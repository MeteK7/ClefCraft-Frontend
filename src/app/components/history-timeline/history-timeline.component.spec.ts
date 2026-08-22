import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { HistoryTimelineComponent } from './history-timeline.component';
import { ActivityService } from '../../_services/activity.service';
import { ActivityLogEntry, PagedResult } from '../../models/activity-log.model';

function makeEntry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id: 1,
    entityType: 'BoardItem',
    entityId: 88,
    actionType: 'CREATED',
    timestamp: '2026-08-17T09:03:44.500Z',
    actorUserId: 'user-1',
    actorFullName: 'Jane Doe',
    changes: [],
    ...overrides
  };
}

function pagedResult(items: ActivityLogEntry[], hasMore = false): PagedResult<ActivityLogEntry> {
  return { items, totalCount: items.length, pageNumber: 1, pageSize: 20, hasMore };
}

describe('HistoryTimelineComponent', () => {
  let fixture: ComponentFixture<HistoryTimelineComponent>;
  let component: HistoryTimelineComponent;
  let activityServiceSpy: jasmine.SpyObj<ActivityService>;

  beforeEach(async () => {
    activityServiceSpy = jasmine.createSpyObj('ActivityService', ['getActivityLog']);

    await TestBed.configureTestingModule({
      imports: [HistoryTimelineComponent],
      providers: [{ provide: ActivityService, useValue: activityServiceSpy }]
    }).compileComponents();

    fixture = TestBed.createComponent(HistoryTimelineComponent);
    component = fixture.componentInstance;
    component.entityType = 'BoardItem';
    component.entityId = 88;
  });

  it('shows the loading state while the request is pending', () => {
    activityServiceSpy.getActivityLog.and.returnValue(of(pagedResult([])).pipe());
    // Use a subject-like delay by not emitting synchronously would need TestScheduler;
    // instead assert loading flips true synchronously before the (synchronous) observable resolves.
    let sawLoading = false;
    activityServiceSpy.getActivityLog.and.callFake(() => {
      sawLoading = component.loading;
      return of(pagedResult([]));
    });

    fixture.detectChanges();

    expect(sawLoading).toBeTrue();
    expect(component.loading).toBeFalse();
  });

  it('renders the empty state for an empty items array', () => {
    activityServiceSpy.getActivityLog.and.returnValue(of(pagedResult([])));

    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('.empty-state-text');
    expect(empty?.textContent).toContain('No activity recorded yet.');
  });

  it('renders the error state and retries on click', () => {
    activityServiceSpy.getActivityLog.and.returnValue(throwError(() => new Error('network')));

    fixture.detectChanges();

    expect(component.error).toBeTrue();
    const retryButton: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(retryButton).toBeTruthy();

    activityServiceSpy.getActivityLog.and.returnValue(of(pagedResult([makeEntry()])));
    retryButton.click();
    fixture.detectChanges();

    expect(component.error).toBeFalse();
    expect(component.entries.length).toBe(1);
  });

  it('renders a CREATED entry and an UPDATED entry with its change list', () => {
    const created = makeEntry({ id: 1, actionType: 'CREATED' });
    const updated = makeEntry({
      id: 2,
      actionType: 'UPDATED',
      changes: [{ fieldName: 'StatusId', oldValue: '2', newValue: '3' }]
    });

    component.statuses = [{ id: 2, name: 'To Do' }, { id: 3, name: 'In Progress' }];

    activityServiceSpy.getActivityLog.and.returnValue(of(pagedResult([updated, created])));

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('created this item');
    expect(text).toContain('updated this item');
    expect(text).toContain('Status');
    expect(text).toContain('To Do');
    expect(text).toContain('In Progress');
  });

  it('resolves an unmapped field to a humanized label and raw values', () => {
    const updated = makeEntry({
      id: 3,
      actionType: 'UPDATED',
      changes: [{ fieldName: 'EstimatedTime', oldValue: '2', newValue: '4' }]
    });

    activityServiceSpy.getActivityLog.and.returnValue(of(pagedResult([updated])));

    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Estimated Time');
    expect(text).toContain('2');
    expect(text).toContain('4');
  });

  it('requests the next page and appends rather than replaces entries on "Load more"', () => {
    const first = makeEntry({ id: 1 });
    const second = makeEntry({ id: 2 });

    activityServiceSpy.getActivityLog.and.returnValue(of(pagedResult([first], true)));
    fixture.detectChanges();

    expect(component.entries.length).toBe(1);

    activityServiceSpy.getActivityLog.and.returnValue(of(pagedResult([second], false)));
    component.loadMore();

    expect(activityServiceSpy.getActivityLog).toHaveBeenCalledWith('BoardItem', 88, 2, 20);
    expect(component.entries.length).toBe(2);
    expect(component.entries).toEqual([first, second]);
  });
});
