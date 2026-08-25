import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivityService } from './activity.service';
import { PagedResult, ActivityLogEntry } from '../models/activity-log.model';
import { CalendarActivityLogEntry } from '../models/calendar-activity-log.model';
import { environment } from '../../environments/environment';

describe('ActivityService', () => {
  let service: ActivityService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ActivityService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('requests the correct URL with entityType, entityId, and paging params', () => {
    const expected: PagedResult<ActivityLogEntry> = {
      items: [],
      totalCount: 0,
      pageNumber: 1,
      pageSize: 20,
      hasMore: false
    };

    service.getActivityLog('BoardItem', 88, 1, 20).subscribe(result => {
      expect(result).toEqual(expected);
    });

    const req = httpMock.expectOne(
      r => r.url === `${environment.apiUrl}/ActivityLogs/BoardItem/88` &&
        r.params.get('pageNumber') === '1' &&
        r.params.get('pageSize') === '20'
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();
    req.flush(expected);
  });

  it('requests calendar event activity without seriesUid when omitted', () => {
    const expected: PagedResult<CalendarActivityLogEntry> = {
      items: [], totalCount: 0, pageNumber: 1, pageSize: 20, hasMore: false
    };

    service.getCalendarEventActivity(42).subscribe(result => {
      expect(result).toEqual(expected);
    });

    const req = httpMock.expectOne(
      r => r.url === `${environment.apiUrl}/ActivityLogs/calendar-event/42` &&
        r.params.get('pageNumber') === '1' &&
        r.params.get('pageSize') === '20' &&
        !r.params.has('seriesUid')
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();
    req.flush(expected);
  });

  it('includes seriesUid as a query param for recurring events', () => {
    const expected: PagedResult<CalendarActivityLogEntry> = {
      items: [], totalCount: 0, pageNumber: 1, pageSize: 20, hasMore: false
    };

    service.getCalendarEventActivity(42, 'series-1', 2, 10).subscribe(result => {
      expect(result).toEqual(expected);
    });

    const req = httpMock.expectOne(
      r => r.url === `${environment.apiUrl}/ActivityLogs/calendar-event/42` &&
        r.params.get('seriesUid') === 'series-1' &&
        r.params.get('pageNumber') === '2' &&
        r.params.get('pageSize') === '10'
    );
    req.flush(expected);
  });
});
