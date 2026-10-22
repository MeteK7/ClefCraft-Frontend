import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { formatDate } from '@angular/common';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
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
  BoardItemAsk,
  ASK_EXACT_TIME_FORMAT,
  NUDGE_TOO_SOON_MESSAGE
} from '../../models/board-item-ask.model';
import { ConfirmDialogData } from '../confirm-dialog/confirm-dialog.component';
import { makeAsk } from '../../models/board-item-ask.testing';
import { environment } from '../../../environments/environment';

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
  const metaText = (askId: number, part: string) => squash(element().querySelector(`[data-ask-id="${askId}"] .${part}`)?.textContent);

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

  it('loads the item\'s asks and emits their summary for the card', fakeAsync(() => {
    const summaries = setup([makeAsk({ id: 1, state: AskState.Pending }), makeAsk({ id: 2, state: AskState.Declined, isRequired: true })]);
    flush();

    expect(component.asks.length).toBe(2);
    expect(summaries).toEqual([jasmine.objectContaining({ openCount: 1, unmetRequiredCount: 1 })]);
  }));

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

  it('shows when each ask was asked, who marked it done, and why a requirement is unmet', () => {
    const asked = new Date(Date.now() - 6 * 86_400_000).toISOString();
    const completedAt = '2026-10-12T15:45:00Z';
    setup([
      makeAsk({ id: 1, state: AskState.Pending, dateCreated: asked }),
      makeAsk({ id: 2, state: AskState.Completed, completedAt, completedByUserId: 'closer', completedByFullName: 'Kemal Closer' }),
      makeAsk({ id: 3, state: AskState.Cancelled, isRequired: true, cancelReason: AskCancelReason.RecipientRemoved, recipientIsBoardMember: false })
    ]);

    expect(metaText(1, 'ask-asked')).toBe(`Asked ${exact(asked)}`);
    expect(metaText(2, 'ask-completed')).toBe(`Done ${exact(completedAt)} · marked by Kemal Closer`);
    expect(rowText(3)).toContain('Required: the recipient left the board');
    expect(rowText(3)).toContain('(not a board member)');
  });

  it('shows a time from the last day as relative, with the exact time on hover', () => {
    const dateCreated = hoursFromNow(-2);
    const lastNudgedAt = new Date(Date.now() - 30 * 60_000).toISOString();
    setup([makeAsk({ id: 1, dateCreated, lastNudgedAt })]);

    const asked = element().querySelector('[data-ask-id="1"] .ask-asked time')!;
    expect(metaText(1, 'ask-asked')).toBe('Asked 2 hours ago');
    expect(asked.getAttribute('datetime')).toBe(dateCreated);
    expect(tooltipOn(asked)).toBe(exact(dateCreated));

    const nudged = element().querySelector('[data-ask-id="1"] .ask-nudged time')!;
    expect(metaText(1, 'ask-nudged')).toBe('Nudged 30 minutes ago');
    expect(tooltipOn(nudged)).toBe(exact(lastNudgedAt));
  });

  it('shows an older time exactly, with nothing to hover', () => {
    const dateCreated = '2026-10-10T09:05:00Z';
    const lastNudgedAt = hoursFromNow(-25);
    setup([makeAsk({ id: 1, dateCreated, lastNudgedAt })]);

    const asked = element().querySelector('[data-ask-id="1"] .ask-asked time')!;
    expect(asked.getAttribute('datetime')).toBe(dateCreated);
    expect(metaText(1, 'ask-asked')).toBe(`Asked ${exact(dateCreated)}`);
    expect(tooltipOn(asked)).toBeUndefined();
    expect(metaText(1, 'ask-nudged')).toBe(`Nudged ${exact(lastNudgedAt)}`);
  });

  it('shows the response and completion times it has, and leaves out the ones it doesn\'t', () => {
    const respondedAt = '2026-10-11T08:30:00Z';
    const completedAt = hoursFromNow(-1);
    setup([
      makeAsk({ id: 1, state: AskState.Pending }),
      makeAsk({ id: 2, state: AskState.Accepted, respondedAt }),
      makeAsk({ id: 3, state: AskState.Declined, respondedAt, responseNote: 'Out this week' }),
      makeAsk({ id: 4, state: AskState.Completed, respondedAt, completedAt, completedByUserId: 'recipient' }),
      makeAsk({ id: 5, state: AskState.Completed })
    ]);

    expect(rowText(1)).not.toContain('Accepted');
    expect(rowText(1)).not.toContain('Nudged');
    expect(metaText(2, 'ask-responded')).toBe(`Accepted ${exact(respondedAt)}`);
    expect(metaText(3, 'ask-responded')).toBe(`Declined ${exact(respondedAt)} · “Out this week”`);
    expect(metaText(4, 'ask-responded')).toBe(`Accepted ${exact(respondedAt)}`);
    expect(metaText(4, 'ask-completed')).toBe('Done 1 hour ago');
    expect(element().querySelector('[data-ask-id="5"] .ask-completed')).toBeNull();
    expect(element().querySelector('[data-ask-id="5"] .ask-responded')).toBeNull();
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
    expect(metaText(5, 'ask-nudged')).toBe('Nudged 3 hours ago');

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

  it('shows each reply with its author and time, and code fences as a block', () => {
    const at = hoursFromNow(-2);
    setup([makeAsk({ id: 1, replies: [reply({ dateCreated: at, body: 'Here:\n```sql\nSELECT *\n  FROM items;\n```\nThanks' })] })]);

    const shown = row(1).querySelector('.reply')!;
    expect(shown.querySelector('.reply-author')!.textContent).toBe('Ayse Recipient');
    expect(shown.querySelector('.reply-head time')!.textContent!.trim()).toBe('2 hours ago');
    expect(Array.from(shown.querySelectorAll('.reply-text')).map(p => p.textContent)).toEqual(['Here:', 'Thanks']);
    expect(shown.querySelector('pre code')!.textContent).toBe('SELECT *\n  FROM items;');
  });

  it('copies a code block and says so briefly', fakeAsync(() => {
    const writeText = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    setup([makeAsk({ id: 1, state: AskState.Completed, replies: [reply({ body: '```\nSELECT 1;\n```' })] })]);
    rowButton(1, '.thread-fold').click();
    fixture.detectChanges();

    rowButton(1, '.reply-copy').click();
    tick();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledOnceWith('SELECT 1;');
    expect(label(rowButton(1, '.reply-copy'))).toBe('Copied');

    tick(1_500);
    fixture.detectChanges();
    expect(label(rowButton(1, '.reply-copy'))).toBe('Copy');
    flush();
  }));

  it('shows only the latest reply until asked for the earlier ones', () => {
    setup([makeAsk({ id: 1, replies: [reply({ id: 1, body: 'one' }), reply({ id: 2, body: 'two' }), reply({ id: 3, body: 'three' })] })]);

    expect(Array.from(row(1).querySelectorAll('.reply-text')).map(p => p.textContent)).toEqual(['three']);

    const earlier = rowButton(1, '.thread-link');
    expect(squash(earlier.textContent)).toBe('Show 2 earlier replies');
    earlier.click();
    fixture.detectChanges();

    expect(Array.from(row(1).querySelectorAll('.reply-text')).map(p => p.textContent)).toEqual(['one', 'two', 'three']);
  });

  it('folds a done ask\'s replies to its answer, and opens them on click', () => {
    setup([makeAsk({
      id: 1, state: AskState.Completed,
      replies: [reply({ id: 1, body: 'INSERT INTO items\n(title) VALUES (\'a\');' }), reply({ id: 2, authorUserId: 'requester', body: 'Thanks!' })]
    })]);

    const fold = rowButton(1, '.thread-fold');
    expect(fold.querySelector('.thread-fold-label')!.textContent).toBe('Answered:');
    expect(fold.querySelector('.thread-fold-text')!.textContent).toBe('INSERT INTO items (title) VALUES (\'a\');');
    expect(row(1).querySelector('.reply')).toBeNull();

    fold.click();
    fixture.detectChanges();
    expect(row(1).querySelectorAll('.reply').length).toBe(1);
  });

  it('posts a reply with Ctrl+Enter, then clears the box and reloads', () => {
    setup([makeAsk({ id: 7, canReply: true })], 'requester');

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
    type(replyBox(7), 'Which table?');
    rowButton(7, '.reply-send').click();

    httpMock.expectOne(replyUrl(7)).flush({ title: 'Nope', status: 400 }, { status: 400, statusText: 'Bad Request' });
    httpMock.expectOne(asksUrl).flush([makeAsk({ id: 7, canReply: true })]);
    fixture.detectChanges();

    expect(replyBox(7).value).toBe('Which table?');
    expect(component.errorMessage).toBe('Nope');
  });

  it('offers no reply box to anyone but the requester and recipient', () => {
    setup([makeAsk({ id: 7, canReply: false, replies: [reply()] })]);

    expect(row(7).querySelector('.reply-box')).toBeNull();
    expect(row(7).querySelector('.reply')).not.toBeNull();
  });

  it('shows the counter only near the limit', () => {
    setup([makeAsk({ id: 7, canReply: true })], 'requester');

    type(replyBox(7), 'x'.repeat(1_799));
    expect(row(7).querySelector('.reply-count')).toBeNull();

    type(replyBox(7), 'x'.repeat(1_800));
    expect(squash(row(7).querySelector('.reply-count')!.textContent)).toBe('1800 / 2000');
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

    expect(row(7).querySelector('.reply-editor')).toBeNull();
    expect(squash(row(7).querySelector('.reply-head')!.textContent)).toContain('edited');
  });

  it('lets only the author edit a reply', () => {
    setup([makeAsk({ id: 7, canReply: true, replies: [reply({ isMine: false })] })], 'requester');

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
    note: 'Review the migration', reason: null, actedOnBehalf: false, replyId: 40, replyExcerpt: 'Done'
  });

  it('reloads when someone acts on an ask of this item, and only this item', () => {
    setup([makeAsk({ id: 7 })]);

    askEvents$.next(askEvent(99));
    httpMock.expectNone(asksUrl);

    askEvents$.next(askEvent(10));
    httpMock.expectOne(asksUrl).flush([makeAsk({ id: 7, replies: [reply()] })]);
    fixture.detectChanges();
    expect(row(7).querySelector('.reply')).not.toBeNull();
  });

  it('tells the app shell its item is on screen while it shows it', () => {
    setup([]);
    const openItems = TestBed.inject(OpenAskItemsService);

    expect(openItems.isOpen(10)).toBeTrue();

    fixture.destroy();
    expect(openItems.isOpen(10)).toBeFalse();
  });
});
