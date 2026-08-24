import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ActivityLogEntry, PagedResult } from '../models/activity-log.model';
import { CalendarActivityLogEntry } from '../models/calendar-activity-log.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ActivityService {
  private apiUrl = `${environment.apiUrl}/ActivityLogs`;

  constructor(private http: HttpClient) { }

  getActivityLog(entityType: string, entityId: number, pageNumber = 1, pageSize = 20): Observable<PagedResult<ActivityLogEntry>> {
    const params = new HttpParams()
      .set('pageNumber', pageNumber)
      .set('pageSize', pageSize);

    return this.http.get<PagedResult<ActivityLogEntry>>(
      `${this.apiUrl}/${entityType}/${entityId}`,
      { params, withCredentials: true }
    );
  }

  getCalendarEventActivity(eventId: number, seriesUid?: string | null, pageNumber = 1, pageSize = 20): Observable<PagedResult<CalendarActivityLogEntry>> {
    let params = new HttpParams()
      .set('pageNumber', pageNumber)
      .set('pageSize', pageSize);

    if (seriesUid) {
      params = params.set('seriesUid', seriesUid);
    }

    return this.http.get<PagedResult<CalendarActivityLogEntry>>(
      `${this.apiUrl}/calendar-event/${eventId}`,
      { params, withCredentials: true }
    );
  }
}
