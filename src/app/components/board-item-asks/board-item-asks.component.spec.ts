import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { formatDate } from '@angular/common';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatTooltip } from '@angular/material/tooltip';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { BoardItemAsksComponent, NUDGE_RELOAD_MIN_DELAY_MS, NUDGE_TOO_SOON_TEXT } from './board-item-asks.component';
import { AuthService } from '../../_services/auth.service';
import {
  AskAction,
  AskCancelReason,
  AskState,
  AskSummary,
  BoardItemAsk,
  NUDGE_TOO_SOON_MESSAGE,
  askDateFormat
} from '../../models/board-item-ask.model';
import { makeAsk } from '../../models/board-item-ask.testing';
import { environment } from '../../../environments/environment';

describe('BoardItemAsksComponent', () => {
  let component: BoardItemAsksComponent;
  let fixture: ComponentFixture<BoardItemAsksComponent>;
  let httpMock: HttpTestingController;
  const asksUrl = `${environment.apiUrl}/BoardItems/10/asks`;

  function setup(asks: BoardItemAsk[], callerId = 'caller'): AskSummary[] {
    TestBed.configureTestingModule({
      imports: [BoardItemAsksComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        { provide: AuthService, useValue: { getUserId: () => callerId } }
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

  const buttons = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.ask-actions button'))
    .map(b => b.textContent!.trim());

  const element = () => fixture.nativeElement as HTMLElement;
  const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const rowText = (askId: number) => squash(element().querySelector(`[data-ask-id="${askId}"]`)!.textContent);
  const nudgeButton = () => Array.from(element().querySelectorAll<HTMLButtonElement>('.ask-actions button'))
    .find(b => b.textContent!.trim() === 'Nudge')!;
  const tooltipOn = (native: Element) =>
    fixture.debugElement.queryAll(By.directive(MatTooltip)).find(d => d.nativeElement === native)!.injector.get(MatTooltip).message;

  // The exact time as the viewer's own timezone shows it, computed the way the template does.
  const exact = (iso: string) => formatDate(iso, askDateFormat(iso), 'en-US');
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
  });

  it('shows no buttons when nothing is allowed', () => {
    setup([makeAsk({ allowedActions: [] })]);

    expect(buttons()).toEqual([]);
  });

  it('shows when each ask was asked, who marked it done, and why a requirement is unmet', () => {
    const asked = new Date(Date.now() - 6 * 86_400_000).toISOString();
    const completedAt = '2026-10-12T15:45:00Z';
    setup([
      makeAsk({ id: 1, state: AskState.Pending, dateCreated: asked }),
      makeAsk({ id: 2, state: AskState.Completed, completedAt, completedByUserId: 'closer', completedByFullName: 'Kemal Closer' }),
      makeAsk({ id: 3, state: AskState.Cancelled, isRequired: true, cancelReason: AskCancelReason.RecipientRemoved, recipientIsBoardMember: false })
    ]);

    expect(rowText(1)).toContain(`Asked ${exact(asked)} · 6 days ago`);
    expect(rowText(2)).toContain(`Done ${exact(completedAt)} · marked by Kemal Closer`);
    expect(rowText(3)).toContain('Required: the recipient left the board');
    expect(rowText(3)).toContain('(not a board member)');
  });

  it('puts the API\'s instant in each <time> and shows it as the viewer\'s local time', () => {
    const dateCreated = '2026-10-10T09:05:00Z';
    setup([makeAsk({ id: 1, dateCreated })]);

    const time = element().querySelector('[data-ask-id="1"] .ask-asked time')!;
    expect(time.getAttribute('datetime')).toBe(dateCreated);
    expect(time.textContent!.trim()).toBe(exact(dateCreated));
  });

  it('shows the response and completion times it has, and leaves out the ones it doesn\'t', () => {
    const respondedAt = '2026-10-11T08:30:00Z';
    const completedAt = '2026-10-12T17:00:00Z';
    setup([
      makeAsk({ id: 1, state: AskState.Pending }),
      makeAsk({ id: 2, state: AskState.Accepted, respondedAt }),
      makeAsk({ id: 3, state: AskState.Declined, respondedAt, responseNote: 'Out this week' }),
      makeAsk({ id: 4, state: AskState.Completed, respondedAt, completedAt, completedByUserId: 'recipient' }),
      makeAsk({ id: 5, state: AskState.Completed })
    ]);

    expect(rowText(1)).not.toContain('Accepted');
    expect(rowText(1)).not.toContain('Nudged');
    expect(rowText(2)).toContain(`Accepted ${exact(respondedAt)}`);
    expect(rowText(3)).toContain(`Declined ${exact(respondedAt)} · “Out this week”`);
    expect(rowText(4)).toContain(`Accepted ${exact(respondedAt)} · Done ${exact(completedAt)}`);
    expect(rowText(4)).not.toContain('marked by');
    expect(element().querySelector('[data-ask-id="5"] .ask-completed')).toBeNull();
    expect(element().querySelector('[data-ask-id="5"] .ask-responded')).toBeNull();
  });

  it('offers Nudge with the 24-hour rule when the API allows it', () => {
    setup([makeAsk({ id: 1, allowedActions: [AskAction.Nudge] })]);

    const nudge = nudgeButton();
    expect(nudge.disabled).toBeFalse();
    expect(tooltipOn(nudge)).toBe('Remind Ayse Recipient. You can nudge once every 24 hours.');
  });

  it('shows Nudge disabled during the cooldown, saying when it comes back', fakeAsync(() => {
    const lastNudgedAt = hoursFromNow(-3);
    const nextNudgeAt = hoursFromNow(21);
    setup([makeAsk({ id: 5, lastNudgedAt, nextNudgeAt, allowedActions: [AskAction.Edit] })]);

    expect(buttons()).toEqual(['Nudge', 'Edit']);
    const nudge = nudgeButton();
    expect(nudge.disabled).toBeTrue();

    // The row itself only says when it was nudged; when Nudge comes back is in the tooltip and,
    // for screen readers, in the button's description.
    expect(squash(element().querySelector('[data-ask-id="5"] .ask-nudged')!.textContent))
      .toBe(`Nudged ${exact(lastNudgedAt)} · 3 hours ago`);
    expect(rowText(5)).not.toContain('next nudge');

    const description = element().querySelector(`#${nudge.getAttribute('aria-describedby')}`)!;
    expect(description.classList).toContain('visually-hidden');
    expect(squash(description.textContent)).toBe(`You can nudge again on ${nudgeDate(nextNudgeAt)}.`);
    expect(squash(tooltipOn(element().querySelector('.nudge-wrap')!))).toBe(
      `Nudged 3 hours ago. You can nudge again on ${nudgeDate(nextNudgeAt)}. You can nudge once every 24 hours.`);

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

  it('asks someone with a UTC due date', () => {
    setup([]);

    component.openCreate();
    component.form.setValue({ recipientUserId: 'helper', note: '  Review the API  ', dueDate: new Date(Date.UTC(2026, 10, 2)), isRequired: true });
    component.submitForm();

    const req = httpMock.expectOne(r => r.url === asksUrl && r.method === 'POST');
    expect(req.request.body).toEqual({
      recipientUserId: 'helper', note: 'Review the API', dueDate: '2026-11-02T00:00:00.000Z', isRequired: true
    });
  });
});
