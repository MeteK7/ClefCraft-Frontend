import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { formatDate } from '@angular/common';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatTooltip } from '@angular/material/tooltip';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Subject, of } from 'rxjs';

import { ANSWER_FIRST_TEXT, BoardItemAsksComponent, NUDGE_RELOAD_MIN_DELAY_MS, NUDGE_TOO_SOON_TEXT } from './board-item-asks.component';
import { AuthService } from '../../_services/auth.service';
import { AskEventPayload, NotificationRealtimeService } from '../../_services/notification-realtime.service';
import { OpenAskItemsService } from '../../_services/open-ask-items.service';
import {
  ASK_ANSWER_REQUIRED_CODE,
  AskAction,
  AskCancelReason,
  AskReply,
  AskState,
  AskSummary,
  AskTurnReason,
  BoardItemAsk,
  ASK_EXACT_TIME_FORMAT,
  askDayFormat,
  NUDGE_TOO_SOON_MESSAGE
} from '../../models/board-item-ask.model';
import { ConfirmDialogData } from '../confirm-dialog/confirm-dialog.component';
import { REASON_DIALOG_MESSAGE_ID, ReasonDialogData } from '../reason-dialog/reason-dialog.component';
import { makeAsk } from '../../models/board-item-ask.testing';
import { environment } from '../../../environments/environment';
import { provideAppDateFormat } from '../../date-format';

describe('BoardItemAsksComponent', () => {
  let component: BoardItemAsksComponent;
  let fixture: ComponentFixture<BoardItemAsksComponent>;
  let httpMock: HttpTestingController;
  const asksUrl = `${environment.apiUrl}/BoardItems/10/asks`;

  let askEvents$: Subject<AskEventPayload>;

  function setup(asks: BoardItemAsk[], callerId = 'caller'): AskSummary[] {
    askEvents$ = new Subject<AskEventPayload>();
    TestBed.configureTestingModule({
      imports: [BoardItemAsksComponent],
      providers: [
        provideAppDateFormat(),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        { provide: AuthService, useValue: { getUserId: () => callerId } },
        { provide: NotificationRealtimeService, useValue: { askEvents$ } }
      ]
    });

    fixture = TestBed.createComponent(BoardItemAsksComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    component.itemId = 10;
    component.assigneeId = 'assignee';
    component.itemDueDate = '2026-10-20T00:00:00Z';
    component.members = [
      { id: 'caller', fullName: 'Cem Caller' },
      { id: 'assignee', fullName: 'Ada Assignee' },
      { id: 'helper', fullName: 'Hale Helper' },
      { id: 'former', fullName: 'Old Timer (not a board member)' }
    ];

    const summaries: AskSummary[] = [];
    component.summaryChange.subscribe(s => summaries.push(s));
    fixture.detectChanges();
    httpMock.expectOne(asksUrl).flush(asks);
    fixture.detectChanges();
    return summaries;
  }

  const element = () => fixture.nativeElement as HTMLElement;
  const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const label = (b: Element) => squash(b.querySelector('.mdc-button__label')!.textContent);
  const rowText = (askId: number) => squash(element().querySelector(`[data-ask-id="${askId}"]`)!.textContent);

  /** The buttons shown on the cards, by label. */
  const buttons = () => Array.from(element().querySelectorAll<HTMLButtonElement>('.ask-actions button')).map(label);
  const inlineButton = (text: string) => Array.from(element().querySelectorAll<HTMLButtonElement>('.ask-actions button'))
    .find(b => label(b) === text)!;
  const nudgeButton = () => inlineButton('Nudge');
  const moreButton = (askId: number) => element().querySelector<HTMLButtonElement>(`[data-ask-id="${askId}"] .ask-more`);
  const tooltipOn = (native: Element) =>
    fixture.debugElement.queryAll(By.directive(MatTooltip)).find(d => d.nativeElement === native)?.injector.get(MatTooltip).message;

  /** Opens a card's "More actions" menu and returns its items; the menu renders in the overlay. */
  function openMenu(askId: number): HTMLButtonElement[] {
    moreButton(askId)!.click();
    fixture.detectChanges();
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.ask-menu-item'));
  }
  const menuLabels = (items: HTMLButtonElement[]) => items.map(i => squash(i.querySelector('span')!.textContent));

  // The exact time as the viewer's own timezone shows it, computed the way the template does.
  const exact = (iso: string) => formatDate(iso, ASK_EXACT_TIME_FORMAT, 'en-US');
  const nudgeDate = (iso: string) => formatDate(iso, 'EEE d MMM, HH:mm', 'en-US');
  const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
  // An older time as the template shows it: its day ("18 Oct"), with the year when it isn't this one.
  const day = (iso: string) => formatDate(iso, askDayFormat(iso), 'en-US');
  /** The facts on an ask's status line, as read. */
  const statusParts = (askId: number) =>
    Array.from(element().querySelectorAll(`[data-ask-id="${askId}"] .ask-status > span`)).map(s => squash(s.textContent));

  it('loads the item\'s asks and emits their summary for the card', fakeAsync(() => {
    const summaries = setup([makeAsk({ id: 1, state: AskState.Pending }), makeAsk({ id: 2, state: AskState.Declined, isRequired: true })]);
    flush();

    expect(component.asks.length).toBe(2);
    expect(summaries).toEqual([jasmine.objectContaining({ openCount: 1, unmetRequiredCount: 1 })]);
  }));

  it('reports who helped after every load, for the item dialog to show beside Assignee', fakeAsync(() => {
    const accepted = makeAsk({ id: 1, state: AskState.Accepted, recipientUserId: 'helper', recipientFullName: 'Hale Helper' });
    setup([accepted]);
    flush();
    const reported: string[][] = [];
    component.contributorsChange.subscribe(c => reported.push(c.map(p => p.fullName)));

    // Accepted is not done yet: nobody to report.
    component.load();
    httpMock.expectOne(asksUrl).flush([accepted]);
    flush();

    // The ask is marked done: the reload reports its recipient.
    component.load();
    httpMock.expectOne(asksUrl).flush([makeAsk({
      id: 1, state: AskState.Completed, recipientUserId: 'helper', recipientFullName: 'Hale Helper', completedAt: '2026-10-22T10:00:00Z'
    })]);
    flush();

    expect(reported).toEqual([[], ['Hale Helper']]);
  }));

  it('reports how many asks are the viewer\'s move after every load, as the server says', fakeAsync(() => {
    setup([
      makeAsk({ id: 1, state: AskState.Pending, yourMove: AskTurnReason.Respond }),
      makeAsk({ id: 2, state: AskState.Pending })
    ]);
    const reported: number[] = [];
    component.attentionChange.subscribe(a => reported.push(a.yourMove));
    flush();

    component.load();
    httpMock.expectOne(asksUrl).flush([makeAsk({ id: 1, state: AskState.Accepted, yourMove: AskTurnReason.Deliver })]);
    flush();

    expect(reported).toEqual([1]);
  }));

  it('brings an ask\'s card into view and focus, highlighted briefly', fakeAsync(() => {
    setup([makeAsk({ id: 1 }), makeAsk({ id: 2 })]);
    flush();
    const card = element().querySelector<HTMLElement>('[data-ask-id="2"]')!;

    component.revealAsk(2);
    fixture.detectChanges();

    expect(document.activeElement).toBe(card);
    expect(card.getAttribute('tabindex')).toBe('-1');
    expect(card.classList).toContain('revealed');

    tick(BoardItemAsksComponent.REVEAL_HIGHLIGHT_MS);
    fixture.detectChanges();
    expect(card.classList).not.toContain('revealed');
  }));

  it('is headed "Chime In", and invites a first ask when nobody has been asked', () => {
    setup([]);

    expect(squash(element().querySelector('#asks-heading')!.textContent)).toBe('group_add Chime In');
    expect(squash(element().querySelector('.asks-empty')!.textContent))
      .toBe('Need a quick opinion or a hand? Ask someone on this board.');
    expect(label(element().querySelector('.ask-someone')!)).toBe('Ask someone');
  });

  it('shows exactly the actions the API allows, and never "complete on behalf"', () => {
    setup([makeAsk({ allowedActions: [AskAction.Accept, AskAction.Decline, AskAction.CompleteOnBehalf] })]);

    expect(buttons()).toEqual(['Accept', 'Decline']);
    expect(moreButton(1)).toBeNull();
  });

  it('shows no buttons and no menu when nothing is allowed', () => {
    setup([makeAsk({ allowedActions: [] })]);

    expect(buttons()).toEqual([]);
    expect(moreButton(1)).toBeNull();
  });

  it('keeps Nudge on the card and the requester\'s other actions in the menu, Withdraw last and apart', () => {
    setup([makeAsk({
      id: 1,
      allowedActions: [AskAction.Cancel, AskAction.Nudge, AskAction.Edit, AskAction.SetRequired, AskAction.Reassign]
    })]);

    expect(buttons()).toEqual(['Nudge']);
    expect(moreButton(1)!.getAttribute('aria-label')).toBe('More actions for the ask to Ayse Recipient');

    const items = openMenu(1);
    expect(menuLabels(items)).toEqual(['Edit', 'Make required', 'Ask someone else', 'Withdraw']);
    expect(items[3].classList).toContain('danger');
    expect(items[3].previousElementSibling!.tagName.toLowerCase()).toBe('mat-divider');
    expect(items[0].previousElementSibling?.tagName.toLowerCase()).not.toBe('mat-divider');
  });

  it('offers "Waive requirement" in the menu of a required ask', () => {
    setup([makeAsk({ id: 1, isRequired: true, allowedActions: [AskAction.Nudge, AskAction.WaiveRequirement, AskAction.Cancel] })]);

    expect(menuLabels(openMenu(1))).toEqual(['Waive requirement', 'Withdraw']);
  });

  it('withdraws only after the confirmation dialog is confirmed', () => {
    setup([makeAsk({ id: 7, revision: 3, allowedActions: [AskAction.Cancel] })]);
    const answer = new Subject<boolean | undefined>();
    const open = spyOn(TestBed.inject(MatDialog), 'open').and.returnValue({ afterClosed: () => answer } as never);

    openMenu(7)[0].click();

    expect(open).toHaveBeenCalledTimes(1);
    const config = open.calls.mostRecent().args[1] as { data: ConfirmDialogData };
    expect(config.data).toEqual(jasmine.objectContaining({ title: 'Withdraw this ask?', confirmLabel: 'Withdraw', destructive: true }));
    expect(config.data.message).toBe('Ayse Recipient won\'t be asked to help with “Review the migration” any more.');
    httpMock.expectNone(`${environment.apiUrl}/BoardItemAsks/7/cancel`);

    answer.next(true);
    const req = httpMock.expectOne(`${environment.apiUrl}/BoardItemAsks/7/cancel`);
    expect(req.request.body).toEqual({ expectedRevision: 3, reason: null });
  });

  it('does nothing when the withdraw dialog is cancelled or dismissed', () => {
    setup([makeAsk({ id: 7, allowedActions: [AskAction.Cancel] })]);
    const answers: (boolean | undefined)[] = [false, undefined];
    spyOn(TestBed.inject(MatDialog), 'open').and.callFake(() => ({ afterClosed: () => of(answers.shift()) }) as never);

    component.act(component.asks[0], AskAction.Cancel);
    component.act(component.asks[0], AskAction.Cancel);

    expect(answers).toEqual([]);
    httpMock.expectNone(() => true);
  });

  // ---- Reasons: an in-app dialog, never window.prompt ------------------------------------------

  /** Opens the reason dialog through MatDialog.open; returns its config and the answer to give. */
  function spyOnReasonDialog(): { config: () => MatDialogConfig<ReasonDialogData>; answer: Subject<string | undefined> } {
    const answer = new Subject<string | undefined>();
    const open = spyOn(TestBed.inject(MatDialog), 'open').and.returnValue({ afterClosed: () => answer } as never);
    return { config: () => open.calls.mostRecent().args[1] as MatDialogConfig<ReasonDialogData>, answer };
  }

  beforeEach(() => spyOn(window, 'prompt').and.throwError('window.prompt must not be used'));

  it('asks why in a dialog before declining, and sends the reason', () => {
    setup([makeAsk({ id: 7, revision: 3, allowedActions: [AskAction.Decline] })], 'recipient');
    const dialog = spyOnReasonDialog();

    inlineButton('Decline').click();

    const config = dialog.config();
    expect(config.data).toEqual({
      title: 'Decline this ask?',
      message: 'Rae Requester asked you:',
      quote: 'Review the migration',
      label: 'Why you\'re declining (optional)',
      hint: 'Everyone on this board will see this on the ask.',
      confirmLabel: 'Decline',
      maxLength: 500
    });
    expect(config.disableClose).toBeTrue();
    expect(config.ariaDescribedBy).toBe(REASON_DIALOG_MESSAGE_ID);
    httpMock.expectNone(`${environment.apiUrl}/BoardItemAsks/7/decline`);

    dialog.answer.next('Out this week');
    expect(httpMock.expectOne(`${environment.apiUrl}/BoardItemAsks/7/decline`).request.body)
      .toEqual({ expectedRevision: 3, reason: 'Out this week' });
    expect(window.prompt).not.toHaveBeenCalled();
  });

  it('declines without a reason when none is given, and not at all when cancelled', () => {
    setup([makeAsk({ id: 7, revision: 3, allowedActions: [AskAction.Decline] })], 'recipient');
    const dialog = spyOnReasonDialog();

    component.act(component.asks[0], AskAction.Decline);
    dialog.answer.next(undefined);
    httpMock.expectNone(`${environment.apiUrl}/BoardItemAsks/7/decline`);

    dialog.answer.next('');
    expect(httpMock.expectOne(`${environment.apiUrl}/BoardItemAsks/7/decline`).request.body)
      .toEqual({ expectedRevision: 3, reason: null });
  });

  it('asks why in a dialog before waiving a requirement, and sends the reason', () => {
    setup([makeAsk({ id: 7, revision: 3, isRequired: true, dueDate: null, allowedActions: [AskAction.WaiveRequirement] })], 'requester');
    const dialog = spyOnReasonDialog();

    component.act(component.asks[0], AskAction.WaiveRequirement);

    expect(dialog.config().data).toEqual({
      title: 'Waive the requirement?',
      message: 'The item can then be completed without waiting for Ayse Recipient.',
      quote: 'Review the migration',
      label: 'Why it\'s no longer required (optional)',
      hint: 'Everyone on this board will see this in the item\'s history.',
      confirmLabel: 'Waive',
      maxLength: 500
    });
    expect(dialog.config().disableClose).toBeTrue();

    dialog.answer.next('Signed off in person');
    expect(httpMock.expectOne(r => r.method === 'PUT' && r.url === `${environment.apiUrl}/BoardItemAsks/7`).request.body)
      .toEqual({ expectedRevision: 3, note: 'Review the migration', dueDate: null, isRequired: false, waiveReason: 'Signed off in person' });
  });

  it('waives without a reason when none is given, and not at all when cancelled', () => {
    setup([makeAsk({ id: 7, revision: 3, isRequired: true, allowedActions: [AskAction.WaiveRequirement] })], 'requester');
    const dialog = spyOnReasonDialog();

    component.act(component.asks[0], AskAction.WaiveRequirement);
    dialog.answer.next(undefined);
    httpMock.expectNone(r => r.method === 'PUT');

    dialog.answer.next('');
    expect(httpMock.expectOne(r => r.method === 'PUT').request.body.waiveReason).toBeNull();
  });

  it('quotes a long note in one line, cut at 80 characters', () => {
    const note = 'Check the migration '.repeat(10).trim();
    setup([makeAsk({ id: 7, note, allowedActions: [AskAction.Decline] })], 'recipient');
    const dialog = spyOnReasonDialog();

    component.act(component.asks[0], AskAction.Decline);

    expect(dialog.config().data!.quote).toBe(note.slice(0, 80).trimEnd() + '…');
  });

  it('says where each ask stands in one line: its state and when, nothing more', () => {
    const asked = '2026-10-10T09:05:00Z';
    const respondedAt = '2026-10-11T08:30:00Z';
    const completedAt = '2026-10-12T15:45:00Z';
    setup([
      makeAsk({ id: 1, state: AskState.Pending, dateCreated: asked }),
      makeAsk({ id: 2, state: AskState.Accepted, respondedAt }),
      makeAsk({ id: 3, state: AskState.Declined, respondedAt, responseNote: 'Out this week' }),
      makeAsk({ id: 4, state: AskState.Completed, respondedAt, completedAt, completedByUserId: 'closer', completedByFullName: 'Kemal Closer' }),
      makeAsk({ id: 5, state: AskState.Cancelled, isRequired: true, cancelReason: AskCancelReason.RecipientRemoved, recipientIsBoardMember: false })
    ]);

    expect(statusParts(1)).toEqual([`Asked ${day(asked)}`]);
    expect(statusParts(2)).toEqual([`Accepted ${day(respondedAt)}`]);
    expect(statusParts(3)).toEqual([`Declined ${day(respondedAt)}`, '“Out this week”']);
    expect(statusParts(4)).toEqual([`Done ${day(completedAt)}`, 'marked by Kemal Closer']);
    expect(statusParts(5)).toEqual(['Closed: the recipient left the board']);
    expect(rowText(5)).toContain('Required: the recipient left the board');
    expect(rowText(5)).toContain('(not a board member)');
  });

  it('shows a time from the last day as relative, an older one as its day, both exact on hover', () => {
    const dateCreated = '2026-10-10T09:05:00Z';
    const lastNudgedAt = new Date(Date.now() - 30 * 60_000).toISOString();
    setup([makeAsk({ id: 1, dateCreated, lastNudgedAt })]);

    expect(statusParts(1)).toEqual([`Asked ${day(dateCreated)}`, 'nudged 30 minutes ago']);
    const [asked, nudged] = Array.from(element().querySelectorAll('[data-ask-id="1"] .ask-status time'));
    expect(asked.getAttribute('datetime')).toBe(dateCreated);
    expect(tooltipOn(asked)).toBe(exact(dateCreated));
    expect(tooltipOn(nudged)).toBe(exact(lastNudgedAt));
  });

  it('shows the due date only while the ask is open', () => {
    setup([
      makeAsk({ id: 1, state: AskState.Accepted, respondedAt: '2026-10-11T08:30:00Z', dueDate: '2026-11-02T00:00:00Z' }),
      makeAsk({ id: 2, state: AskState.Completed, completedAt: '2026-10-12T15:45:00Z', dueDate: '2026-11-02T00:00:00Z' })
    ]);

    expect(element().querySelector('[data-ask-id="1"] .ask-due-on')).not.toBeNull();
    expect(element().querySelector('[data-ask-id="2"] .ask-due-on')).toBeNull();
  });

  it('opens the key dates in the order they happened, and links to the full history', () => {
    const history = jasmine.createSpy('openHistory');
    setup([makeAsk({
      id: 1, state: AskState.Completed, dateCreated: '2026-10-18T13:48:00Z', lastNudgedAt: '2026-10-18T13:49:00Z',
      respondedAt: '2026-10-19T17:29:00Z', completedAt: '2026-10-21T15:39:00Z', completedByFullName: 'Ayse Recipient'
    })]);
    component.openHistory.subscribe(history);

    const toggle = element().querySelector<HTMLButtonElement>('[data-ask-id="1"] .ask-details-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(element().querySelector('#ask-dates-1')).toBeNull();

    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const labels = Array.from(element().querySelectorAll('#ask-dates-1 dt')).map(dt => dt.textContent!.trim());
    expect(labels).toEqual(['Asked', 'Last nudged', 'Accepted', 'Done']);

    element().querySelector<HTMLButtonElement>('#ask-dates-1 .ask-full-history')!.click();
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('keeps a decline reason to one line, with the full text on hover', () => {
    const reason = 'Out this week, and the week after, for a conference; ask someone in the platform team instead.';
    setup([makeAsk({ id: 3, state: AskState.Declined, respondedAt: '2026-10-11T08:30:00Z', responseNote: reason })]);

    const shown = element().querySelector('[data-ask-id="3"] .ask-reason')!;
    expect(tooltipOn(shown)).toBe(reason);
  });

  it('names the other person from the viewer\'s side', () => {
    const ask = makeAsk({ id: 1, requestedByFullName: 'Rae Requester', recipientFullName: 'Ayse Recipient' });

    setup([ask], 'requester');
    expect(squash(element().querySelector('.ask-who')!.textContent)).toBe('Asked Ayse Recipient');
    TestBed.resetTestingModule();

    setup([ask], 'recipient');
    expect(squash(element().querySelector('.ask-who')!.textContent)).toBe('From Rae Requester');
    TestBed.resetTestingModule();

    // Anyone else on the board: neutral, read as "Rae asked Ayse"; the arrow isn't read.
    setup([ask], 'caller');
    const who = element().querySelector('.ask-who')!;
    expect(squash(who.textContent)).toBe('Rae Requester → asked Ayse Recipient');
    expect(who.querySelector('.ask-arrow')!.getAttribute('aria-hidden')).toBe('true');
    expect(who.querySelector('.visually-hidden')!.textContent!.trim()).toBe('asked');
  });

  it('shows "Answer expected" only while the answer is still owed', () => {
    setup([
      makeAsk({ id: 1, state: AskState.Accepted, expectsAnswer: true, isAnswered: false }),
      makeAsk({ id: 2, state: AskState.Accepted, expectsAnswer: true, isAnswered: true }),
      makeAsk({ id: 3, state: AskState.Completed, expectsAnswer: true, isAnswered: true })
    ]);

    expect(element().querySelector('[data-ask-id="1"] .ask-expects-answer')).not.toBeNull();
    expect(element().querySelector('[data-ask-id="2"] .ask-expects-answer')).toBeNull();
    expect(element().querySelector('[data-ask-id="3"] .ask-expects-answer')).toBeNull();
  });

  it('offers Nudge with the 24-hour rule when the API allows it', () => {
    setup([makeAsk({ id: 1, allowedActions: [AskAction.Nudge] })]);

    const nudge = nudgeButton();
    expect(nudge.disabled).toBeFalse();
    expect(tooltipOn(nudge)).toBe('Remind Ayse Recipient. You can nudge once every 24 hours.');
  });

  it('shows Nudge disabled during the cooldown, with the rule and the next time', fakeAsync(() => {
    const lastNudgedAt = hoursFromNow(-3);
    const nextNudgeAt = hoursFromNow(21);
    setup([makeAsk({ id: 5, lastNudgedAt, nextNudgeAt, allowedActions: [AskAction.Edit] })]);

    expect(buttons()).toEqual(['Nudge']);
    const nudge = nudgeButton();
    expect(nudge.disabled).toBeTrue();
    expect(nudge.classList).toContain('nudge-waiting');
    expect(statusParts(5)[1]).toBe('nudged 3 hours ago');

    const expected = `You can nudge once every 24 hours. Next nudge on ${nudgeDate(nextNudgeAt)}.`;
    expect(squash(tooltipOn(element().querySelector('.nudge-wrap')!))).toBe(expected);
    const description = element().querySelector(`#${nudge.getAttribute('aria-describedby')}`)!;
    expect(description.classList).toContain('visually-hidden');
    expect(squash(description.textContent)).toBe(expected);

    fixture.destroy();
    flush();
  }));

  it('shows no Nudge to a viewer the API gives no cooldown to', () => {
    setup([makeAsk({ id: 5, lastNudgedAt: hoursFromNow(-3), nextNudgeAt: null, allowedActions: [AskAction.Accept] })]);

    expect(buttons()).toEqual(['Accept']);
    expect(element().querySelector('#nudge-wait-5')).toBeNull();
  });

  it('reloads a second after the cooldown ends, and the API\'s answer enables Nudge', fakeAsync(() => {
    const waiting = makeAsk({ id: 5, lastNudgedAt: hoursFromNow(-23), nextNudgeAt: new Date(Date.now() + 60_000).toISOString() });
    setup([waiting]);
    expect(nudgeButton().disabled).toBeTrue();

    tick(60_999);
    httpMock.expectNone(asksUrl);

    tick(1);
    httpMock.expectOne(asksUrl).flush([{ ...waiting, nextNudgeAt: null, allowedActions: [AskAction.Nudge] }]);
    fixture.detectChanges();
    expect(nudgeButton().disabled).toBeFalse();

    tick(24 * 3_600_000);
    httpMock.expectNone(asksUrl);
    flush();
  }));

  it('tries again after the minimum delay when the API still reports a cooldown the client thinks is over', fakeAsync(() => {
    const skewed = makeAsk({ id: 5, lastNudgedAt: hoursFromNow(-24), nextNudgeAt: new Date(Date.now() - 10_000).toISOString() });
    setup([skewed]);

    tick(NUDGE_RELOAD_MIN_DELAY_MS - 1);
    httpMock.expectNone(asksUrl);
    tick(1);
    httpMock.expectOne(asksUrl).flush([skewed]);

    tick(NUDGE_RELOAD_MIN_DELAY_MS - 1);
    httpMock.expectNone(asksUrl);
    tick(1);
    httpMock.expectOne(asksUrl).flush([{ ...skewed, nextNudgeAt: null, allowedActions: [AskAction.Nudge] }]);

    tick(60_000);
    httpMock.expectNone(asksUrl);
    flush();
  }));

  it('leaves no reload pending once destroyed', fakeAsync(() => {
    setup([makeAsk({ id: 5, lastNudgedAt: hoursFromNow(-1), nextNudgeAt: hoursFromNow(23) })]);

    fixture.destroy();
    tick(24 * 3_600_000);

    httpMock.expectNone(asksUrl);
  }));

  it('keeps an open form and what was typed in it through a cooldown reload', fakeAsync(() => {
    const waiting = makeAsk({
      id: 5, lastNudgedAt: hoursFromNow(-23), nextNudgeAt: new Date(Date.now() + 60_000).toISOString(), allowedActions: [AskAction.Edit]
    });
    setup([waiting]);

    component.act(component.asks[0], AskAction.Edit);
    component.form.patchValue({ note: 'Review the migration and the seed' });
    fixture.detectChanges();

    tick(61_000);
    httpMock.expectOne(asksUrl).flush([{ ...waiting, nextNudgeAt: null, allowedActions: [AskAction.Nudge, AskAction.Edit] }]);
    fixture.detectChanges();

    expect(component.formMode?.kind).toBe('edit');
    expect(element().querySelector<HTMLInputElement>('input[formcontrolname="note"]')!.value).toBe('Review the migration and the seed');
    flush();
  }));

  describe('the note counter', () => {
    const noteInput = () => element().querySelector<HTMLInputElement>('input[formcontrolname="note"]')!;
    const noteCount = () => element().querySelector<HTMLElement>('.ask-note-count')!;
    function typeNote(length: number): void {
      noteInput().value = 'x'.repeat(length);
      noteInput().dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }
    function openNewAsk(): void {
      element().querySelector<HTMLButtonElement>('.ask-someone')!.click();
      fixture.detectChanges();
    }
    let announce: jasmine.Spy;
    const announced = () => announce.calls.allArgs();

    function setupForm(asks: BoardItemAsk[] = []): void {
      setup(asks);
      announce = spyOn(TestBed.inject(LiveAnnouncer), 'announce');
    }

    it('counts the note, as "n / 200" to see and "n of 200 characters" to hear', () => {
      setupForm();
      openNewAsk();
      typeNote(45);

      expect(squash(noteCount().querySelector('[aria-hidden="true"]')!.textContent)).toBe('45 / 200');
      expect(squash(noteCount().querySelector('.visually-hidden')!.textContent)).toBe('45 of 200 characters');
    });

    it('describes the note field with the count, outside any live region', () => {
      setupForm();
      openNewAsk();

      expect(noteCount().id).toBe(component.noteCountId);
      expect(noteInput().getAttribute('aria-describedby')!.split(' ')).toContain(component.noteCountId);
      expect(noteCount().closest('[aria-live]')).toBeNull();
      expect(element().querySelector('.ask-form mat-hint')).toBeNull();
    });

    it('gives each panel its own counter id', () => {
      setupForm();
      const other = TestBed.createComponent(BoardItemAsksComponent).componentInstance;
      expect(other.noteCountId).not.toBe(component.noteCountId);
    });

    it('announces 20 characters left and the limit once each while typing, politely', () => {
      setupForm();
      openNewAsk();
      for (let length = 175; length <= 200; length++) typeNote(length);

      expect(announced()).toEqual([['20 characters left', 'polite'], ['Character limit reached', 'polite']]);
    });

    it('stays quiet while deleting, and announces again on typing back over a threshold', () => {
      setupForm();
      openNewAsk();
      typeNote(185);
      announce.calls.reset();

      for (let length = 184; length >= 170; length--) typeNote(length);
      expect(announced()).toEqual([]);

      for (let length = 171; length <= 180; length++) typeNote(length);
      expect(announced()).toEqual([['20 characters left', 'polite']]);
    });

    it('announces nothing on opening Edit on a long note, only on typing on to the limit', () => {
      setupForm([makeAsk({ id: 5, note: 'x'.repeat(190), allowedActions: [AskAction.Edit] })]);
      component.act(component.asks[0], AskAction.Edit);
      fixture.detectChanges();
      expect(squash(noteCount().querySelector('[aria-hidden="true"]')!.textContent)).toBe('190 / 200');
      expect(announced()).toEqual([]);

      for (let length = 191; length <= 200; length++) typeNote(length);
      expect(announced()).toEqual([['Character limit reached', 'polite']]);
    });
  });

  it('says it is too soon when the server refuses an early nudge, and reloads', fakeAsync(() => {
    setup([makeAsk({ id: 7, allowedActions: [AskAction.Nudge] })]);

    component.act(component.asks[0], AskAction.Nudge);
    httpMock.expectOne(`${environment.apiUrl}/BoardItemAsks/7/nudge`).flush(
      { title: NUDGE_TOO_SOON_MESSAGE, status: 400 },
      { status: 400, statusText: 'Bad Request' });

    expect(component.errorMessage).toBe(NUDGE_TOO_SOON_TEXT);
    httpMock.expectOne(asksUrl).flush([makeAsk({ id: 7, lastNudgedAt: hoursFromNow(-1), nextNudgeAt: hoursFromNow(23) })]);
    fixture.detectChanges();
    expect(element().querySelector('.asks-error')!.textContent!.trim()).toBe('Too soon to nudge again');

    fixture.destroy();
    flush();
  }));

  it('warns, without blocking, when an ask is due after the item', () => {
    setup([]);

    expect(component.isDueAfterItem(new Date(2026, 9, 25))).toBeTrue();
    expect(component.isDueAfterItem(new Date(2026, 9, 18))).toBeFalse();
    expect(component.isDueAfterItem(null)).toBeFalse();

    component.itemDueDate = null;
    expect(component.isDueAfterItem(new Date(2026, 9, 25))).toBeFalse();
  });

  it('offers to ask anyone on the board except yourself, the assignee and former members', () => {
    setup([]);

    expect(component.recipientOptions.map(m => m.id)).toEqual(['helper']);
  });

  it('sends a change with the ask\'s revision, then reloads the list', () => {
    setup([makeAsk({ id: 7, revision: 4, allowedActions: [AskAction.Accept] })]);

    component.act(component.asks[0], AskAction.Accept);

    const req = httpMock.expectOne(`${environment.apiUrl}/BoardItemAsks/7/accept`);
    expect(req.request.body).toEqual({ expectedRevision: 4, reason: null });
    req.flush(makeAsk({ id: 7, state: AskState.Accepted }));

    httpMock.expectOne(asksUrl).flush([makeAsk({ id: 7, state: AskState.Accepted, revision: 5 })]);
    expect(component.asks[0].revision).toBe(5);
  });

  it('shows the API\'s reason when a change is refused, and reloads the stale list', () => {
    setup([makeAsk({ id: 7, revision: 4, allowedActions: [AskAction.Accept] })]);

    component.act(component.asks[0], AskAction.Accept);
    httpMock.expectOne(`${environment.apiUrl}/BoardItemAsks/7/accept`).flush(
      { title: 'This ask changed since you loaded it; reload it and try again.', status: 400 },
      { status: 400, statusText: 'Bad Request' });

    expect(component.errorMessage).toBe('This ask changed since you loaded it; reload it and try again.');
    httpMock.expectOne(asksUrl).flush([]);
  });

  it('asks someone with a UTC due date, and whether an answer is expected', () => {
    setup([]);

    component.openCreate();
    component.form.setValue({
      recipientUserId: 'helper', note: '  Review the API  ', dueDate: new Date(Date.UTC(2026, 10, 2)), isRequired: true, expectsAnswer: true
    });
    component.submitForm();

    const req = httpMock.expectOne(r => r.url === asksUrl && r.method === 'POST');
    expect(req.request.body).toEqual({
      recipientUserId: 'helper', note: 'Review the API', dueDate: '2026-11-02T00:00:00.000Z', isRequired: true, expectsAnswer: true
    });
  });

  it('shows the date format as the placeholder on "By when", and its calendar opens', fakeAsync(() => {
    setup([]);
    component.openCreate();
    fixture.detectChanges();

    const field = element().querySelector('.ask-due')!;
    expect(field.querySelector('input')!.getAttribute('placeholder')).toBe('MM/DD/YYYY');
    expect(field.querySelector('mat-hint')).toBeNull();

    field.querySelector<HTMLButtonElement>('mat-datepicker-toggle button')!.click();
    fixture.detectChanges();
    flush();

    expect(document.querySelector('.mat-datepicker-content .mat-calendar')).not.toBeNull();
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')?.click();
    fixture.detectChanges();
    flush();
  }));

  it('reads a typed date as that day, ISO included', () => {
    setup([]);
    component.openCreate();
    fixture.detectChanges();
    const input = element().querySelector<HTMLInputElement>('.ask-due input')!;

    for (const text of ['11/02/2026', '2026-11-02']) {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      const due = component.form.value.dueDate as Date;
      expect([due.getFullYear(), due.getMonth(), due.getDate()]).withContext(text).toEqual([2026, 10, 2]);
    }
  });

  // ---- Replies ----------------------------------------------------------------------------------

  const replyUrl = (askId: number) => `${environment.apiUrl}/BoardItemAsks/${askId}/replies`;
  const completeUrl = (askId: number) => `${environment.apiUrl}/BoardItemAsks/${askId}/complete`;

  const reply = (overrides: Partial<AskReply> = {}): AskReply => ({
    id: 40, authorUserId: 'recipient', authorFullName: 'Ayse Recipient', body: 'Here it is.',
    dateCreated: hoursFromNow(-1), dateEdited: null, isMine: false, ...overrides
  });

  const row = (askId: number) => element().querySelector<HTMLElement>(`[data-ask-id="${askId}"]`)!;
  const replyBox = (askId: number) => row(askId).querySelector<HTMLTextAreaElement>('.reply-box textarea')!;
  const rowButton = (askId: number, selector: string) => row(askId).querySelector<HTMLButtonElement>(selector)!;

  function type(box: HTMLTextAreaElement, text: string): void {
    box.value = text;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function ctrlEnter(box: HTMLTextAreaElement): void {
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
    fixture.detectChanges();
  }

  /** Clicks a card's conversation toggle (opening or closing it). */
  function toggleConversation(askId: number): void {
    rowButton(askId, '.thread-toggle').click();
    fixture.detectChanges();
  }

  /** The Reply action: opens the conversation and the box. */
  function pressReply(askId: number): void {
    rowButton(askId, '.ask-reply').click();
    fixture.detectChanges();
  }

  /** What the conversation toggle holds, element by element: the chevron and the count, nothing else. */
  const toggleParts = (toggle: Element) => Array.from(toggle.children).map(c => squash(c.textContent));

  const shownReplies = (askId: number) =>
    Array.from(row(askId).querySelectorAll('.thread .reply .reply-text')).map(p => p.textContent);

  it('shows each reply with its author and time, and code fences as a block', () => {
    const at = hoursFromNow(-2);
    setup([makeAsk({ id: 1, replies: [reply({ dateCreated: at, body: 'Here:\n```sql\nSELECT *\n  FROM items;\n```\nThanks' })] })]);
    toggleConversation(1);

    const shown = row(1).querySelector('.thread .reply')!;
    expect(shown.querySelector('.reply-author')!.textContent).toBe('Ayse Recipient');
    expect(shown.querySelector('.reply-head time')!.textContent!.trim()).toBe('2 hours ago');
    expect(Array.from(shown.querySelectorAll('.reply-text')).map(p => p.textContent)).toEqual(['Here:', 'Thanks']);
    expect(shown.querySelector('pre code')!.textContent).toBe('SELECT *\n  FROM items;');
  });

  it('opens the whole conversation with one click, and shows the latest reply while closed', () => {
    setup([makeAsk({ id: 1, replies: [
      reply({ id: 1, body: 'one' }), reply({ id: 2, body: 'two' }),
      reply({ id: 3, authorFullName: 'Rae Requester', authorUserId: 'requester', body: 'three' })
    ] })]);

    // Closed: the count, the replies before the latest counted, and the latest as it reads in the thread.
    const toggle = rowButton(1, '.thread-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggleParts(toggle)).toEqual(['chevron_right', '3 replies']);
    const gap = row(1).querySelector('.thread-digest .thread-gap')!;
    expect(squash(gap.textContent).replace('more_horiz', '')).toBe('2 earlier replies');
    const latest = row(1).querySelector('.thread-digest .digest-latest')!;
    expect(latest.querySelector('.reply-author')!.textContent).toBe('Rae Requester');
    expect(latest.querySelector('.reply-head time')).not.toBeNull();
    expect(latest.querySelector('.reply-text')!.textContent).toBe('three');
    expect(row(1).querySelector('.thread')).toBeNull();

    toggleConversation(1);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe(row(1).querySelector('.thread')!.id);
    expect(toggle.querySelector('.thread-toggle-label')!.textContent!.trim()).toBe('Hide conversation');
    expect(shownReplies(1)).toEqual(['one', 'two', 'three']);
    expect(row(1).querySelector('.thread-digest')).toBeNull();

    toggleConversation(1);
    expect(row(1).querySelector('.thread')).toBeNull();
    expect(row(1).querySelector('.thread-digest')).not.toBeNull();
  });

  it('shows a done ask\'s answer in its place in the closed conversation, and never twice', () => {
    setup([makeAsk({
      id: 1, state: AskState.Completed, answerReplyId: 1,
      replies: [
        reply({ id: 1, body: 'INSERT INTO items (title) VALUES (\'a\');' }),
        reply({ id: 2, authorUserId: 'requester', authorFullName: 'Rae Requester', body: 'Test message' })
      ]
    })]);

    const answer = row(1).querySelector('.thread-digest .answer')!;
    expect(answer.getAttribute('data-reply-id')).toBe('1');
    expect(answer.querySelector('.answer-label')!.textContent).toBe('Answer');
    expect(answer.querySelector('.reply-author')!.textContent).toBe('Ayse Recipient');
    expect(squash(answer.querySelector('.reply-body')!.textContent)).toBe('INSERT INTO items (title) VALUES (\'a\');');

    // The count includes the answer: exactly what opening shows. The latest reply follows the
    // answer, with its own author and time, rather than sitting on the toggle.
    const toggle = rowButton(1, '.thread-toggle');
    expect(toggle.querySelector('.thread-toggle-label')!.textContent!.trim()).toBe('2 replies');
    expect(toggleParts(toggle)).toEqual(['chevron_right', '2 replies']);
    const latest = row(1).querySelector('.thread-digest .digest-latest')!;
    expect(latest.querySelector('.reply-author')!.textContent).toBe('Rae Requester');
    expect(latest.querySelector('.reply-head time')).not.toBeNull();
    expect(latest.querySelector('.reply-text')!.textContent).toBe('Test message');

    toggleConversation(1);
    expect(row(1).querySelector('.answer')).toBeNull();
    expect(shownReplies(1)).toEqual(['INSERT INTO items (title) VALUES (\'a\');', 'Test message']);
    const tagged = row(1).querySelector('.reply.is-answer')!;
    expect(tagged.getAttribute('data-reply-id')).toBe('1');
    expect(tagged.querySelector('.answer-tag')!.textContent).toBe('Answer');

    toggleConversation(1);
    expect(row(1).querySelector('.answer')).not.toBeNull();
  });

  it('shows a single reply as it reads in the thread, with nothing counted before it', () => {
    setup([makeAsk({ id: 1, replies: [reply({ id: 1, body: 'Only one' })] })]);

    expect(toggleParts(rowButton(1, '.thread-toggle'))).toEqual(['chevron_right', '1 reply']);
    expect(row(1).querySelector('.thread-gap')).toBeNull();
    expect(row(1).querySelector('.digest-latest .reply-text')!.textContent).toBe('Only one');
  });

  // ---- Who's on which side --------------------------------------------------------------------

  /** A conversation between Rae (requester) and Ayse (recipient), as `viewer` receives it. */
  const conversation = (viewer: string, authors: string[]): AskReply[] => authors.map((author, i) => reply({
    id: i + 1,
    authorUserId: author,
    authorFullName: author === 'requester' ? 'Rae Requester' : 'Ayse Recipient',
    body: `message ${i + 1}`,
    dateCreated: hoursFromNow(-10 + i),
    isMine: author === viewer
  }));

  /** Opens the conversation of a thread by `authors`, as `viewer`, and returns its replies. */
  function openConversation(viewer: string, authors: string[]): HTMLElement[] {
    setup([makeAsk({ id: 1, replies: conversation(viewer, authors) })], viewer);
    toggleConversation(1);
    return Array.from(row(1).querySelectorAll<HTMLElement>('.thread .reply'));
  }

  const isOffset = (replies: HTMLElement[]) => replies.map(r => r.classList.contains('offset'));
  const shownName = (r: HTMLElement) => r.querySelector('.reply-author')?.textContent ?? null;
  /** The author as a screen reader hears it: the name shown, or the hidden label in its place. */
  const spokenAuthor = (r: HTMLElement) => shownName(r) ?? squash(r.querySelector('.reply-head .visually-hidden')?.textContent);

  for (const [viewer, expected] of [
    ['requester', [true, false, true]],
    ['recipient', [false, true, false]],
    // Neither side: a fixed rule, the requester's replies offset.
    ['caller', [true, false, true]]
  ] as const) {
    it(`offsets the right replies for the ${viewer === 'caller' ? 'third viewer' : viewer}`, () => {
      expect(isOffset(openConversation(viewer, ['requester', 'recipient', 'requester']))).toEqual([...expected]);
    });
  }

  /** Whether each reply starts and ends its run, as classes. */
  const runFlags = (replies: HTMLElement[]) =>
    replies.map(r => [r.classList.contains('run-start'), r.classList.contains('run-end')]);
  const corners = (r: HTMLElement) => {
    const s = getComputedStyle(r);
    return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].join(' ');
  };
  /** The run tint as the current theme resolves it. */
  function ownTint(): string {
    const probe = document.createElement('div');
    probe.style.background = 'var(--reply-own-bg)';
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }
  const transparent = 'rgba(0, 0, 0, 0)';

  it('groups replies into runs by author', () => {
    const replies = openConversation('requester', ['recipient', 'recipient', 'requester', 'requester', 'requester', 'recipient']);

    expect(runFlags(replies)).toEqual([[true, false], [false, true], [true, false], [false, false], [false, true], [true, true]]);
  });

  it('tints the viewer\'s runs as one section: rounded outside, nearly square where messages meet', () => {
    const replies = openConversation('requester', ['requester', 'requester', 'requester', 'recipient', 'requester']);

    expect(ownTint()).not.toBe(transparent);
    expect(replies.map(r => getComputedStyle(r).backgroundColor))
      .toEqual([ownTint(), ownTint(), ownTint(), transparent, ownTint()]);
    expect(corners(replies[0])).toBe('6px 6px 2px 2px');
    expect(corners(replies[1])).toBe('2px 2px 2px 2px');
    expect(corners(replies[2])).toBe('2px 2px 6px 6px');
    // A run of one is rounded all round.
    expect(corners(replies[4])).toBe('6px 6px 6px 6px');
    // No shadows or borders: the tint alone sets the run apart.
    expect(replies.map(r => getComputedStyle(r).boxShadow)).toEqual(['none', 'none', 'none', 'none', 'none']);
    expect(getComputedStyle(replies[1]).borderTopWidth).toBe('0px');
  });

  it('tints the requester\'s runs for a third viewer', () => {
    const replies = openConversation('caller', ['recipient', 'requester', 'requester']);

    expect(replies.map(r => getComputedStyle(r).backgroundColor)).toEqual([transparent, ownTint(), ownTint()]);
  });

  it('shows "You" on the first of the viewer\'s runs only, and the other person\'s name once per run', () => {
    const replies = openConversation('requester', ['requester', 'requester', 'recipient', 'recipient', 'requester']);

    expect(replies.map(shownName)).toEqual(['You', null, 'Ayse Recipient', null, 'You']);
    // "You" looks like the other side's names.
    expect(replies[0].querySelector('.reply-author')!.className).toBe(replies[2].querySelector('.reply-author')!.className);
  });

  it('gives every reply exactly one author label, shown or for screen readers only', () => {
    const replies = openConversation('requester', ['recipient', 'recipient', 'requester', 'requester']);

    expect(replies.map(spokenAuthor)).toEqual(['Ayse Recipient', 'Ayse Recipient,', 'You', 'You,']);
    expect(replies.map(r => r.querySelectorAll('.reply-head .reply-author, .reply-head .visually-hidden').length))
      .toEqual([1, 1, 1, 1]);
  });

  it('names both sides once per run for a third viewer', () => {
    const replies = openConversation('caller', ['recipient', 'recipient', 'requester', 'requester', 'recipient']);

    expect(replies.map(shownName)).toEqual(['Ayse Recipient', null, 'Rae Requester', null, 'Ayse Recipient']);
    expect(replies.map(spokenAuthor)).toEqual(
      ['Ayse Recipient', 'Ayse Recipient,', 'Rae Requester', 'Rae Requester,', 'Ayse Recipient']);
  });

  it('keeps a run close together and opens a gap where the author changes, in the order sent', () => {
    const replies = openConversation('requester', ['recipient', 'recipient', 'requester']);

    expect(replies.map(r => getComputedStyle(r).marginTop)).toEqual(['0px', '3px', '12px']);
    expect(replies.map(r => r.getAttribute('data-reply-id'))).toEqual(['1', '2', '3']);
    expect(replies.map(r => getComputedStyle(r).order)).toEqual(['0', '0', '0']);
    expect(getComputedStyle(row(1).querySelector('.thread-list')!).flexDirection).toBe('column');
  });

  it('keeps code in the viewer\'s reply inside its tinted block, scrolling there rather than overflowing', () => {
    const long = 'npm run migrate -- --env staging --dry-run --verbose --tag release-2026-10-24';
    setup([makeAsk({ id: 1, replies: [
      reply({ id: 1, authorUserId: 'requester', isMine: true, body: 'Ran:\n```\n' + long + '\n```' })
    ] })], 'requester');
    toggleConversation(1);

    // The narrowest rail.
    element().style.display = 'block';
    element().style.width = '320px';

    const block = row(1).querySelector<HTMLElement>('[data-reply-id="1"]')!;
    const code = block.querySelector<HTMLElement>('.reply-code')!;
    const text = block.querySelector('.reply-text')!.getBoundingClientRect();
    const blockStyle = getComputedStyle(block);
    const inner = block.getBoundingClientRect();

    expect(code.getBoundingClientRect().left).toBe(text.left);
    expect(code.getBoundingClientRect().left).toBeGreaterThanOrEqual(inner.left + parseFloat(blockStyle.paddingLeft));
    expect(code.getBoundingClientRect().right).toBeLessThanOrEqual(inner.right - parseFloat(blockStyle.paddingRight));
    // The long line scrolls inside the code block, which keeps its Copy button; nothing around it overflows.
    const pre = code.querySelector('pre')!;
    expect(pre.scrollWidth).toBeGreaterThan(pre.clientWidth);
    expect(code.querySelector('.reply-copy')).not.toBeNull();
    expect(block.scrollWidth).toBe(block.clientWidth);
    const list = row(1).querySelector<HTMLElement>('.thread-list')!;
    expect(list.scrollWidth).toBe(list.clientWidth);
  });

  it('draws the answer\'s rule on the viewer\'s own answer without losing the tag in the tint', () => {
    const replies = conversation('recipient', ['recipient', 'recipient', 'requester']);
    setup([makeAsk({ id: 1, state: AskState.Completed, answerReplyId: 1, replies })], 'recipient');
    toggleConversation(1);

    const answer = row(1).querySelector<HTMLElement>('.reply.is-answer')!;
    const style = getComputedStyle(answer);
    expect(answer.classList).toContain('offset');
    expect(style.backgroundColor).toBe(ownTint());
    expect(style.borderLeftWidth).toBe('2px');
    expect(style.borderLeftColor).not.toBe(style.backgroundColor);
    expect([style.borderTopLeftRadius, style.borderBottomLeftRadius]).toEqual(['0px', '0px']);
    // Its text lines up with the run's next message: the 2px rule plus 4px matches the 6px padding.
    const textLeft = (r: Element) => r.querySelector('.reply-text')!.getBoundingClientRect().left;
    expect(textLeft(answer)).toBe(textLeft(row(1).querySelector('[data-reply-id="2"]')!));
    const tag = getComputedStyle(answer.querySelector('.answer-tag')!).backgroundColor;
    expect(tag).not.toBe(style.backgroundColor);
  });

  it('says "You" for the viewer\'s own latest reply on the closed row', () => {
    setup([makeAsk({ id: 1, replies: conversation('requester', ['recipient', 'requester']) })], 'requester');

    expect(row(1).querySelector('.digest-latest .reply-author')!.textContent).toBe('You');
  });

  it('says "You" on the answer block when the viewer gave the answer', () => {
    setup([makeAsk({
      id: 1, state: AskState.Completed, answerReplyId: 1, replies: conversation('recipient', ['recipient', 'requester'])
    })], 'recipient');

    expect(row(1).querySelector('.answer .reply-author')!.textContent).toBe('You');
  });

  it('doesn\'t preview the latest reply when it\'s the answer already shown', () => {
    setup([makeAsk({ id: 1, state: AskState.Completed, answerReplyId: 40, replies: [reply({ id: 40 })] })]);

    expect(rowButton(1, '.thread-toggle').querySelector('.thread-toggle-label')!.textContent!.trim()).toBe('1 reply');
    expect(row(1).querySelector('.digest-latest')).toBeNull();
    expect(row(1).querySelector('.thread-gap')).toBeNull();
  });

  // ---- The closed conversation of a done ask ---------------------------------------------------

  /** A done ask whose replies are by `authors` (as `viewer` receives them), answered by reply `answerAt` (1-based). */
  function doneAsk(authors: string[], answerAt: number, viewer = 'requester'): void {
    setup([makeAsk({ id: 1, state: AskState.Completed, answerReplyId: answerAt, replies: conversation(viewer, authors) })], viewer);
  }

  /** The closed conversation, top to bottom, as short labels. */
  const digest = () => Array.from(row(1).querySelectorAll<HTMLElement>('.thread-toggle, .thread-digest > *')).map(el =>
    el.classList.contains('thread-toggle') ? `toggle: ${squash(el.querySelector('.thread-toggle-label')!.textContent)}`
      : el.classList.contains('thread-gap') ? `gap: ${squash(el.textContent).replace('more_horiz', '').trim()}`
      : el.classList.contains('answer') ? `answer: ${el.getAttribute('data-reply-id')}`
      : `latest: ${el.getAttribute('data-reply-id')}`);

  it('places the answer between the replies before and after it, counted, with the latest last', () => {
    doneAsk(['recipient', 'recipient', 'requester', 'recipient', 'requester'], 2);

    expect(digest()).toEqual(['toggle: 5 replies', 'gap: 1 earlier reply', 'answer: 2', 'gap: 2 more replies', 'latest: 5']);
  });

  for (const [name, authors, answerAt, expected] of [
    ['the only reply', ['recipient'], 1, ['toggle: 1 reply', 'answer: 1']],
    ['the first, with one after it', ['recipient', 'requester'], 1, ['toggle: 2 replies', 'answer: 1', 'latest: 2']],
    ['the last', ['requester', 'requester', 'recipient'], 3, ['toggle: 3 replies', 'gap: 2 earlier replies', 'answer: 3']],
    ['followed by one more and the latest', ['recipient', 'requester', 'recipient'], 1,
      ['toggle: 3 replies', 'answer: 1', 'gap: 1 more reply', 'latest: 3']]
  ] as const) {
    it(`shows only what surrounds an answer that is ${name}`, () => {
      doneAsk([...authors], answerAt);
      expect(digest()).toEqual([...expected]);
    });
  }

  it('opens the whole conversation from a count, with focus on the toggle', fakeAsync(() => {
    doneAsk(['recipient', 'recipient', 'requester'], 2);

    rowButton(1, '.thread-gap').click();
    fixture.detectChanges();
    flush();

    expect(row(1).querySelector('.thread-digest')).toBeNull();
    expect(shownReplies(1)).toEqual(['message 1', 'message 2', 'message 3']);
    expect(row(1).querySelector('.reply.is-answer')!.getAttribute('data-reply-id')).toBe('2');
    const toggle = rowButton(1, '.thread-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(toggle);
  }));

  it('keeps the answer\'s buttons outside the toggle button', () => {
    const long = Array.from({ length: 6 }, (_, i) => `line ${i + 1}`).join('\n');
    setup([makeAsk({ id: 1, state: AskState.Completed, answerReplyId: 1, replies: [
      reply({ id: 1, body: long + '\n```\nSELECT 1;\n```' }), reply({ id: 2, authorUserId: 'requester', body: 'Thanks' })
    ] })], 'requester');

    const toggle = rowButton(1, '.thread-toggle');
    expect(toggle.querySelectorAll('button, a, [tabindex]').length).toBe(0);
    expect(toggle.contains(row(1).querySelector('.answer'))).toBeFalse();
    expect(row(1).querySelector('.answer .reply-copy')).not.toBeNull();
    expect(row(1).querySelector('.answer .answer-more')).not.toBeNull();
  });

  it('names and tints the latest reply as the open conversation would', () => {
    doneAsk(['recipient', 'requester'], 1, 'requester');

    const latest = row(1).querySelector<HTMLElement>('.digest-latest')!;
    expect(latest.querySelector('.reply-author')!.textContent).toBe('You');
    expect(latest.classList).toContain('offset');
    expect(getComputedStyle(latest).backgroundColor).toBe(ownTint());
    // The conversation's rule, as when open; the answer's lies on it.
    const digestBox = row(1).querySelector<HTMLElement>('.thread-digest')!;
    expect(getComputedStyle(digestBox).borderLeftWidth).toBe('2px');
    expect(row(1).querySelector('.thread-digest .answer')!.getBoundingClientRect().left)
      .toBe(digestBox.getBoundingClientRect().left);
  });

  it('keeps the latest reply untinted when it\'s the other person\'s', () => {
    doneAsk(['requester', 'recipient'], 1, 'requester');

    const latest = row(1).querySelector<HTMLElement>('.digest-latest')!;
    expect(latest.querySelector('.reply-author')!.textContent).toBe('Ayse Recipient');
    expect(latest.classList).not.toContain('offset');
  });

  it('shows no answer block on a done ask without an answer', () => {
    setup([makeAsk({ id: 1, state: AskState.Completed, answerReplyId: null, replies: [reply({ authorUserId: 'requester' })] })]);

    expect(row(1).querySelector('.answer')).toBeNull();
    expect(row(1).querySelector('.thread-toggle')).not.toBeNull();
  });

  it('has no conversation row while there are no replies', () => {
    setup([makeAsk({ id: 1, canReply: true })], 'requester');

    expect(row(1).querySelector('.thread-toggle')).toBeNull();
  });

  it('clamps a long answer until "Show more"', () => {
    const long = Array.from({ length: 6 }, (_, i) => `line ${i + 1}`).join('\n');
    setup([makeAsk({ id: 1, state: AskState.Completed, answerReplyId: 40, replies: [reply({ id: 40, body: long })] })]);

    const body = row(1).querySelector('.answer-body')!;
    const more = rowButton(1, '.answer-more');
    expect(body.classList).toContain('clamped');
    expect(more.textContent!.trim()).toBe('Show more');

    more.click();
    fixture.detectChanges();
    expect(body.classList).not.toContain('clamped');
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens a long thread on its latest ten replies', () => {
    const replies = Array.from({ length: 12 }, (_, i) => reply({ id: i + 1, body: `r${i + 1}` }));
    setup([makeAsk({ id: 1, replies })]);

    expect(rowButton(1, '.thread-toggle').querySelector('.thread-toggle-label')!.textContent!.trim()).toBe('12 replies');
    toggleConversation(1);
    expect(shownReplies(1).length).toBe(10);
    expect(shownReplies(1)[0]).toBe('r3');

    const earlier = row(1).querySelector<HTMLButtonElement>('.thread > .thread-link')!;
    expect(squash(earlier.textContent)).toBe('Show 2 earlier replies');
    earlier.click();
    fixture.detectChanges();
    expect(shownReplies(1).length).toBe(12);
  });

  it('copies a code block from the answer and says so briefly', fakeAsync(() => {
    const writeText = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    setup([makeAsk({ id: 1, state: AskState.Completed, answerReplyId: 40, replies: [reply({ id: 40, body: '```\nSELECT 1;\n```' })] })]);

    rowButton(1, '.answer .reply-copy').click();
    tick();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledOnceWith('SELECT 1;');
    expect(label(rowButton(1, '.reply-copy'))).toBe('Copied');

    tick(1_500);
    fixture.detectChanges();
    expect(label(rowButton(1, '.reply-copy'))).toBe('Copy');
    flush();
  }));

  // ---- The reply box ----------------------------------------------------------------------------

  it('shows the reply box by default only to the recipient of an open ask', () => {
    setup([
      makeAsk({ id: 1, state: AskState.Pending, canReply: true }),
      makeAsk({ id: 2, state: AskState.Completed, canReply: true })
    ], 'recipient');

    expect(row(1).querySelector('.reply-box')).not.toBeNull();
    expect(row(1).querySelector('.ask-reply')).toBeNull();
    expect(row(2).querySelector('.reply-box')).toBeNull();
    expect(row(2).querySelector('.ask-reply')).not.toBeNull();
  });

  it('opens the box with Reply, focused, and closes it on Esc without closing the dialog', fakeAsync(() => {
    setup([makeAsk({ id: 7, canReply: true })], 'requester');
    expect(row(7).querySelector('.reply-box')).toBeNull();

    pressReply(7);
    tick();
    expect(document.activeElement).toBe(replyBox(7));

    type(replyBox(7), 'Draft');
    expect(escapeReachesDialog(replyBox(7))).toBeFalse();
    expect(row(7).querySelector('.reply-box')).toBeNull();

    pressReply(7);
    tick();
    expect(replyBox(7).value).toBe('Draft');
    flush();
  }));

  it('opens the conversation too when Reply is pressed on an ask with replies', () => {
    setup([makeAsk({ id: 7, canReply: true, replies: [reply()] })], 'requester');

    pressReply(7);

    expect(rowButton(7, '.thread-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(row(7).querySelector('.reply-box')).not.toBeNull();

    // Closing the conversation closes the box with it.
    toggleConversation(7);
    expect(row(7).querySelector('.reply-box')).toBeNull();
  });

  it('posts a reply with Ctrl+Enter, then clears the box and reloads', () => {
    setup([makeAsk({ id: 7, canReply: true })], 'requester');
    pressReply(7);

    const box = replyBox(7);
    expect(box.getAttribute('aria-label')).toBe('Reply to Ayse Recipient');
    type(box, '  Which table?  ');
    ctrlEnter(box);

    const req = httpMock.expectOne(replyUrl(7));
    expect(req.request.body).toEqual({ body: 'Which table?' });
    req.flush(makeAsk({ id: 7 }));
    httpMock.expectOne(asksUrl).flush([makeAsk({ id: 7, canReply: true, replies: [reply({ body: 'Which table?', isMine: true })] })]);
    fixture.detectChanges();

    expect(replyBox(7).value).toBe('');
  });

  it('keeps an unsent reply when the request fails, and through a reload', () => {
    setup([makeAsk({ id: 7, canReply: true })], 'requester');
    pressReply(7);
    type(replyBox(7), 'Which table?');
    rowButton(7, '.reply-send').click();

    httpMock.expectOne(replyUrl(7)).flush({ title: 'Nope', status: 400 }, { status: 400, statusText: 'Bad Request' });
    httpMock.expectOne(asksUrl).flush([makeAsk({ id: 7, canReply: true })]);
    fixture.detectChanges();

    expect(replyBox(7).value).toBe('Which table?');
    expect(component.errorMessage).toBe('Nope');
  });

  it('offers no reply box or Reply to anyone but the requester and recipient', () => {
    setup([makeAsk({ id: 7, canReply: false, replies: [reply()] })]);
    toggleConversation(7);

    expect(row(7).querySelector('.reply-box')).toBeNull();
    expect(row(7).querySelector('.ask-reply')).toBeNull();
    expect(row(7).querySelector('.thread .reply')).not.toBeNull();
  });

  it('shows the counter only near the limit', () => {
    setup([makeAsk({ id: 7, canReply: true })], 'recipient');

    type(replyBox(7), 'x'.repeat(1_799));
    expect(row(7).querySelector('.reply-count')).toBeNull();

    type(replyBox(7), 'x'.repeat(1_800));
    expect(squash(row(7).querySelector('.reply-count [aria-hidden="true"]')!.textContent)).toBe('1800 / 2000');
    expect(squash(row(7).querySelector('.reply-count .visually-hidden')!.textContent)).toBe('1800 of 2000 characters');
  });

  it('describes the reply box with the counter once it shows, outside any live region', () => {
    setup([makeAsk({ id: 7, canReply: true })], 'recipient');

    type(replyBox(7), 'x'.repeat(1_799));
    expect(replyBox(7).getAttribute('aria-describedby')).toBeNull();

    type(replyBox(7), 'x'.repeat(1_800));
    const count = row(7).querySelector('.reply-count')!;
    expect(count.id).toBe('reply-count-7');
    expect(replyBox(7).getAttribute('aria-describedby')).toBe('reply-count-7');
    expect(count.closest('[aria-live]')).toBeNull();
  });

  it('describes the reply box by both the complete prompt and the counter', () => {
    setup([makeAsk({ id: 7, canReply: true })], 'recipient');
    component.completePromptAskId = 7;
    fixture.detectChanges();

    type(replyBox(7), 'x'.repeat(1_800));
    expect(replyBox(7).getAttribute('aria-describedby')).toBe('complete-prompt-7 reply-count-7');
  });

  it('announces 200 characters left as the reply counter appears, and the limit, once each', () => {
    setup([makeAsk({ id: 7, canReply: true })], 'recipient');
    const announce = spyOn(TestBed.inject(LiveAnnouncer), 'announce');

    type(replyBox(7), 'x'.repeat(1_799));
    type(replyBox(7), 'x'.repeat(1_800));
    expect(announce.calls.allArgs()).toEqual([['200 characters left', 'polite']]);

    for (const length of [1_801, 1_900, 1_999]) type(replyBox(7), 'x'.repeat(length));
    expect(announce.calls.count()).toBe(1);

    type(replyBox(7), 'x'.repeat(2_000));
    type(replyBox(7), 'x'.repeat(1_990));
    expect(announce.calls.allArgs()).toEqual([['200 characters left', 'polite'], ['Character limit reached', 'polite']]);
  });

  /** Presses Esc where it bubbles, and says whether it got past the panel (to the item dialog). */
  function escapeReachesDialog(target: HTMLElement): boolean {
    let reached = false;
    const listener = () => reached = true;
    document.body.addEventListener('keydown', listener);
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.body.removeEventListener('keydown', listener);
    fixture.detectChanges();
    return reached;
  }

  it('focuses the editor at the end of the text when editing starts', fakeAsync(() => {
    setup([makeAsk({ id: 7, canReply: true, replies: [reply({ id: 40, isMine: true, body: 'SELECT 1;' })] })], 'recipient');
    toggleConversation(7);

    rowButton(7, '.reply-edit').click();
    fixture.detectChanges();
    tick();

    const editor = row(7).querySelector<HTMLTextAreaElement>('.reply-editor textarea')!;
    expect(document.activeElement).toBe(editor);
    expect(editor.selectionStart).toBe('SELECT 1;'.length);
    flush();
  }));

  it('edits one\'s own reply inline: Esc cancels (and only that), Ctrl+Enter saves', () => {
    setup([makeAsk({ id: 7, canReply: true, replies: [reply({ id: 40, isMine: true, body: 'SELECT 1;' })] })], 'recipient');
    toggleConversation(7);

    rowButton(7, '.reply-edit').click();
    fixture.detectChanges();
    let editor = row(7).querySelector<HTMLTextAreaElement>('.reply-editor textarea')!;
    expect(escapeReachesDialog(editor)).toBeFalse();
    expect(row(7).querySelector('.reply-editor')).toBeNull();

    rowButton(7, '.reply-edit').click();
    fixture.detectChanges();
    editor = row(7).querySelector<HTMLTextAreaElement>('.reply-editor textarea')!;
    type(editor, 'SELECT 2;');
    ctrlEnter(editor);

    const req = httpMock.expectOne(`${environment.apiUrl}/BoardItemAskReplies/40`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ body: 'SELECT 2;' });
    req.flush(makeAsk({ id: 7 }));
    httpMock.expectOne(asksUrl).flush([makeAsk({
      id: 7, canReply: true, replies: [reply({ id: 40, isMine: true, body: 'SELECT 2;', dateEdited: hoursFromNow(0) })]
    })]);
    fixture.detectChanges();

    // The conversation stays open through the reload.
    expect(row(7).querySelector('.reply-editor')).toBeNull();
    expect(squash(row(7).querySelector('.thread .reply-head')!.textContent)).toContain('edited');
  });

  it('lets only the author edit a reply', () => {
    setup([makeAsk({ id: 7, canReply: true, replies: [reply({ isMine: false })] })], 'requester');
    toggleConversation(7);

    expect(row(7).querySelector('.reply-edit')).toBeNull();
  });

  // ---- Marking done -----------------------------------------------------------------------------

  it('disables Mark done until the expected answer is given, saying why', () => {
    setup([makeAsk({ id: 7, state: AskState.Accepted, expectsAnswer: true, isAnswered: false, canReply: true,
      allowedActions: [AskAction.Decline, AskAction.Complete] })], 'recipient');

    expect(squash(row(7).querySelector('.ask-expects-answer')!.textContent)).toBe('Answer expected');
    const markDone = row(7).querySelector<HTMLButtonElement>('.complete-waiting')!;
    expect(markDone.disabled).toBeTrue();
    expect(tooltipOn(markDone.parentElement!)).toBe(ANSWER_FIRST_TEXT);
    const description = element().querySelector(`#${markDone.getAttribute('aria-describedby')}`)!;
    expect(squash(description.textContent)).toBe('Reply with the answer first.');
  });

  it('marks done straight away once the recipient has replied', () => {
    setup([makeAsk({ id: 7, state: AskState.Accepted, expectsAnswer: true, isAnswered: true, canReply: true,
      allowedActions: [AskAction.Complete] })], 'recipient');

    inlineButton('Mark done').click();

    expect(httpMock.expectOne(completeUrl(7)).request.body).toEqual({ expectedRevision: 1, reason: null });
  });

  it('asks for the result first when marking done without having replied', () => {
    setup([makeAsk({ id: 7, state: AskState.Accepted, canReply: true, allowedActions: [AskAction.Complete] })], 'recipient');

    inlineButton('Mark done').click();
    fixture.detectChanges();

    httpMock.expectNone(completeUrl(7));
    expect(row(7).querySelector('.reply-box.prompting')).not.toBeNull();
    expect(squash(row(7).querySelector('.reply-prompt')!.textContent))
      .toBe('Share the result with Rae Requester, or mark it done without a reply.');

    rowButton(7, '.reply-done-without').click();
    expect(httpMock.expectOne(completeUrl(7)).request.body).toEqual({ expectedRevision: 1, reason: null });
  });

  it('sends the result and marks done in one request from the prompt', () => {
    setup([makeAsk({ id: 7, state: AskState.Accepted, canReply: true, allowedActions: [AskAction.Complete] })], 'recipient');
    inlineButton('Mark done').click();
    fixture.detectChanges();

    const sendAndDone = rowButton(7, '.reply-send-done');
    expect(sendAndDone.disabled).toBeTrue();
    type(replyBox(7), 'Ran it on staging.');
    rowButton(7, '.reply-send-done').click();

    const req = httpMock.expectOne(completeUrl(7));
    expect(req.request.body).toEqual({ expectedRevision: 1, reason: null, replyBody: 'Ran it on staging.' });
    httpMock.expectNone(replyUrl(7));
    req.flush(makeAsk({ id: 7, state: AskState.Completed }));
    httpMock.expectOne(asksUrl).flush([makeAsk({ id: 7, state: AskState.Completed })]);
    expect(component.completePromptAskId).toBeNull();
  });

  it('closes the prompt with Esc without marking done, or closing the item dialog', () => {
    setup([makeAsk({ id: 7, state: AskState.Accepted, canReply: true, allowedActions: [AskAction.Complete] })], 'recipient');
    inlineButton('Mark done').click();
    fixture.detectChanges();

    expect(escapeReachesDialog(replyBox(7))).toBeFalse();

    expect(row(7).querySelector('.reply-box.prompting')).toBeNull();
    httpMock.expectNone(completeUrl(7));
  });

  it('offers "Send & mark done" from a Pending ask\'s reply box, as one request', () => {
    setup([makeAsk({ id: 7, state: AskState.Pending, canReply: true, allowedActions: [AskAction.Accept, AskAction.Decline] })], 'recipient');

    type(replyBox(7), 'Here is the SQL.');
    rowButton(7, '.reply-send-done').click();

    expect(httpMock.expectOne(completeUrl(7)).request.body)
      .toEqual({ expectedRevision: 1, reason: null, replyBody: 'Here is the SQL.' });
  });

  it('offers no "Send & mark done" to the requester', () => {
    setup([makeAsk({ id: 7, canReply: true, allowedActions: [AskAction.Nudge] })], 'requester');
    pressReply(7);

    type(replyBox(7), 'Any news?');

    expect(row(7).querySelector('.reply-send-done')).toBeNull();
    expect(row(7).querySelector('.reply-send')).not.toBeNull();
  });

  it('opens the reply box when the server refuses to mark done without the answer', () => {
    setup([makeAsk({ id: 7, state: AskState.Accepted, isAnswered: true, canReply: true, allowedActions: [AskAction.Complete] })], 'recipient');

    inlineButton('Mark done').click();
    httpMock.expectOne(completeUrl(7)).flush(
      { title: 'This ask expects an answer. Reply with the answer before marking it done.', status: 400, code: ASK_ANSWER_REQUIRED_CODE },
      { status: 400, statusText: 'Bad Request' });
    httpMock.expectOne(asksUrl).flush([makeAsk({ id: 7, state: AskState.Accepted, expectsAnswer: true, canReply: true, allowedActions: [AskAction.Complete] })]);
    fixture.detectChanges();

    expect(component.errorMessage).toBe('This ask expects an answer. Reply with the answer before marking it done.');
    expect(component.completePromptAskId).toBe(7);
  });

  // ---- Expects an answer --------------------------------------------------------------------------

  it('toggles "Expect an answer" from the menu', () => {
    setup([makeAsk({ id: 7, revision: 2, allowedActions: [AskAction.SetExpectsAnswer, AskAction.Cancel] })], 'requester');

    const items = openMenu(7);
    expect(menuLabels(items)).toEqual(['Expect an answer', 'Withdraw']);
    items[0].click();

    const req = httpMock.expectOne(`${environment.apiUrl}/BoardItemAsks/7/expects-answer`);
    expect(req.request.body).toEqual({ expectedRevision: 2, expectsAnswer: true });
  });

  it('offers "No answer needed" while an answer is expected', () => {
    setup([makeAsk({ id: 7, expectsAnswer: true, allowedActions: [AskAction.ClearExpectsAnswer] })], 'requester');

    expect(menuLabels(openMenu(7))).toEqual(['No answer needed']);
  });

  it('starts "Ask again" from the old ask\'s terms, expected answer included', () => {
    setup([makeAsk({ id: 7, state: AskState.Declined, expectsAnswer: true, allowedActions: [AskAction.AskAgain] })], 'requester');

    component.act(component.asks[0], AskAction.AskAgain);

    expect(component.form.value.expectsAnswer).toBeTrue();
  });

  // ---- Realtime -----------------------------------------------------------------------------------

  const askEvent = (boardItemId: number): AskEventPayload => ({
    askId: 7, boardItemId, boardId: 3, itemTitle: 'Release notes', event: 'Replied', actorFullName: 'Ayse Recipient',
    note: 'Review the migration', reason: null, actedOnBehalf: false, replyId: 40, replyExcerpt: 'Done',
    occurredAt: '2026-10-25T10:00:00Z'
  });

  it('reloads when someone acts on an ask of this item, and only this item', () => {
    setup([makeAsk({ id: 7 })]);

    askEvents$.next(askEvent(99));
    httpMock.expectNone(asksUrl);

    askEvents$.next(askEvent(10));
    httpMock.expectOne(asksUrl).flush([makeAsk({ id: 7, replies: [reply()] })]);
    fixture.detectChanges();
    // Shown as the conversation row; it doesn't open by itself.
    expect(rowButton(7, '.thread-toggle').querySelector('.thread-toggle-label')!.textContent!.trim()).toBe('1 reply');
    expect(rowButton(7, '.thread-toggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('tells the app shell its item is on screen while it shows it', () => {
    setup([]);
    const openItems = TestBed.inject(OpenAskItemsService);

    expect(openItems.isOpen(10)).toBeTrue();

    fixture.destroy();
    expect(openItems.isOpen(10)).toBeFalse();
  });

  it('lets toasts through while hidden, suppresses them again when shown, and unregisters once', () => {
    setup([]);
    const openItems = TestBed.inject(OpenAskItemsService);
    const unregister = spyOn(openItems, 'unregister').and.callThrough();

    fixture.componentRef.setInput('suppressToasts', false);
    fixture.detectChanges();
    expect(openItems.isOpen(10)).toBeFalse();

    fixture.componentRef.setInput('suppressToasts', true);
    fixture.detectChanges();
    expect(openItems.isOpen(10)).toBeTrue();

    fixture.componentRef.setInput('suppressToasts', false);
    fixture.detectChanges();
    fixture.destroy();
    // Hidden at close: already unregistered, so closing doesn't unregister again.
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(openItems.isOpen(10)).toBeFalse();
  });

  it('still reloads on its item\'s events while hidden', () => {
    setup([makeAsk({ id: 7 })]);
    fixture.componentRef.setInput('suppressToasts', false);
    fixture.detectChanges();

    askEvents$.next(askEvent(10));

    httpMock.expectOne(asksUrl).flush([makeAsk({ id: 7, replies: [reply()] })]);
  });

  it('offers a hide button only where it can be hidden', () => {
    setup([]);
    expect(element().querySelector('.asks-hide')).toBeNull();

    fixture.componentRef.setInput('hideable', true);
    fixture.detectChanges();
    const hide = element().querySelector<HTMLButtonElement>('.asks-hide')!;
    const hidden = jasmine.createSpy('hide');
    component.hide.subscribe(hidden);

    expect(hide.getAttribute('aria-label')).toBe('Hide Chime In');
    expect(hide.getAttribute('aria-expanded')).toBe('true');
    expect(hide.getAttribute('aria-controls')).toBe('chime-in-panel');
    hide.click();
    expect(hidden).toHaveBeenCalledTimes(1);
    expect(element().querySelector('#asks-heading')!.getAttribute('tabindex')).toBe('-1');
  });
});
