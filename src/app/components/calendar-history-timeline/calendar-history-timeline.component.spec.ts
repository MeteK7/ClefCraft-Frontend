import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { CalendarHistoryTimelineComponent } from './calendar-history-timeline.component';
import { ActivityService } from '../../_services/activity.service';
import { CalendarActivityLogEntry } from '../../models/calendar-activity-log.model';
import { PagedResult } from '../../models/activity-log.model';

function makeEntry(overrides: Partial<CalendarActivityLogEntry> = {}): CalendarActivityLogEntry {
  return {
    id: 1,
    scope: 'Event',
    actionType: 'CREATED',
    timestamp: '2026-08-17T09:03:44.500Z',
    actorUserId: 'user-1',
    actorFullName: 'Jane Doe',
    changes: [],
    effectiveFrom: null,
    effectiveTo: null,
    occurrenceDate: null,
    ...overrides
  };
}

function pagedResult(items: CalendarActivityLogEntry[], hasMore = false): PagedResult<CalendarActivityLogEntry> {
  return { items, totalCount: items.length, pageNumber: 1, pageSize: 20, hasMore };
}

describe('CalendarHistoryTimelineComponent', () => {
  let fixture: ComponentFixture<CalendarHistoryTimelineComponent>;
  let component: CalendarHistoryTimelineComponent;
  let activityServiceSpy: jasmine.SpyObj<ActivityService>;

  beforeEach(async () => {
    activityServiceSpy = jasmine.createSpyObj('ActivityService', ['getCalendarEventActivity']);

    await TestBed.configureTestingModule({
      imports: [CalendarHistoryTimelineComponent],
      providers: [{ provide: ActivityService, useValue: activityServiceSpy }]
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarHistoryTimelineComponent);
    component = fixture.componentInstance;
    component.eventId = 42;
  });

  it('shows the loading state while the request is pending', () => {
    let sawLoading = false;
    activityServiceSpy.getCalendarEventActivity.and.callFake(() => {
      sawLoading = component.loading;
      return of(pagedResult([]));
    });

    fixture.detectChanges();

    expect(sawLoading).toBeTrue();
    expect(component.loading).toBeFalse();
  });

  it('renders the empty state for an empty items array', () => {
    activityServiceSpy.getCalendarEventActivity.and.returnValue(of(pagedResult([])));

    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('.empty-state-text');
    expect(empty?.textContent).toContain('No activity recorded yet.');
  });

  it('renders the error state and retries on click', () => {
    activityServiceSpy.getCalendarEventActivity.and.returnValue(throwError(() => new Error('network')));

    fixture.detectChanges();

    expect(component.error).toBeTrue();
    const retryButton: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(retryButton).toBeTruthy();

    activityServiceSpy.getCalendarEventActivity.and.returnValue(of(pagedResult([makeEntry()])));
    retryButton.click();
    fixture.detectChanges();

    expect(component.error).toBeFalse();
    expect(component.entries.length).toBe(1);
  });

  it('shows no scope badge for Event-scoped entries (the universal baseline every event has)', () => {
    const eventEntry = makeEntry({ id: 1, scope: 'Event' });

    activityServiceSpy.getCalendarEventActivity.and.returnValue(of(pagedResult([eventEntry])));

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.history-scope-badge')).toBeNull();
  });

  it('labels Segment and Exception scopes distinctly, without a badge for the Event entry alongside them', () => {
    const eventEntry = makeEntry({ id: 1, scope: 'Event' });
    const segmentEntry = makeEntry({ id: 2, scope: 'Segment', effectiveFrom: '2026-08-01T00:00:00Z' });
    const exceptionEntry = makeEntry({ id: 3, scope: 'Exception', occurrenceDate: '2026-08-20T00:00:00Z' });

    activityServiceSpy.getCalendarEventActivity.and.returnValue(of(pagedResult([eventEntry, segmentEntry, exceptionEntry])));

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('Series');
    expect(text).toContain('Recurring settings');
    expect(text).toContain('This occurrence');

    const badges = fixture.nativeElement.querySelectorAll('.history-scope-badge');
    expect(badges.length).toBe(2);
  });

  it('collapses a StartDate+EndDate change into a single Rescheduled summary row', () => {
    const rescheduled = makeEntry({
      id: 4,
      actionType: 'UPDATED',
      changes: [
        { fieldName: 'StartDate', oldValue: '2026-08-01T10:00:00Z', newValue: '2026-08-03T10:00:00Z' },
        { fieldName: 'EndDate', oldValue: '2026-08-01T11:00:00Z', newValue: '2026-08-03T11:00:00Z' }
      ]
    });

    activityServiceSpy.getCalendarEventActivity.and.returnValue(of(pagedResult([rescheduled])));

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Rescheduled');
    expect(text).toContain('+2 days');
    // Should NOT render raw "Start"/"End" rows separately alongside the summary.
    expect(component.displayChanges(rescheduled).length).toBe(1);
  });

  it('requests the next page with the seriesUid and appends rather than replaces entries on "Load more"', () => {
    component.seriesUid = 'series-1';
    const first = makeEntry({ id: 1 });
    const second = makeEntry({ id: 2 });

    activityServiceSpy.getCalendarEventActivity.and.returnValue(of(pagedResult([first], true)));
    fixture.detectChanges();

    expect(component.entries.length).toBe(1);

    activityServiceSpy.getCalendarEventActivity.and.returnValue(of(pagedResult([second], false)));
    component.loadMore();

    expect(activityServiceSpy.getCalendarEventActivity).toHaveBeenCalledWith(42, 'series-1', 2, 20);
    expect(component.entries.length).toBe(2);
    expect(component.entries).toEqual([first, second]);
  });
});
