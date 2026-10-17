import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { BoardItemAsksComponent } from './board-item-asks.component';
import { AuthService } from '../../_services/auth.service';
import { AskAction, AskCancelReason, AskState, AskSummary, BoardItemAsk } from '../../models/board-item-ask.model';
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

  it('shows a Pending ask\'s age, the "marked by" chip, and why a requirement is unmet', () => {
    setup([
      makeAsk({ id: 1, state: AskState.Pending, dateCreated: new Date(Date.now() - 6 * 86_400_000).toISOString() }),
      makeAsk({ id: 2, state: AskState.Completed, completedByUserId: 'closer', completedByFullName: 'Kemal Closer' }),
      makeAsk({ id: 3, state: AskState.Cancelled, isRequired: true, cancelReason: AskCancelReason.RecipientRemoved, recipientIsBoardMember: false })
    ]);
    const text = (fixture.nativeElement as HTMLElement).textContent!;

    expect(text).toContain('Asked 6 days ago');
    expect(text).toContain('Marked done by Kemal Closer');
    expect(text).toContain('Required: the recipient left the board');
    expect(text).toContain('(not a board member)');
  });

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
