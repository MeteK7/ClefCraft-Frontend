import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EventType } from '../models/event-type.model';
import { WorkHistoryEntry } from '../models/work-history.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class CalendarService {
  private apiUrl = `${environment.apiUrl}/Calendar`;

  constructor(private http: HttpClient) { }

  // Fetch events with userId parameter
  getEvents(rangeStart: Date, rangeEnd: Date): Observable<any[]> {
    return this.http.get<any[]>(
      `${this.apiUrl}/events`,
      {
        params: {
          rangeStart: rangeStart.toISOString(),
          rangeEnd: rangeEnd.toISOString()
        }
      }
    );
  }

  // Save event to the backend
  saveEvent(event: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}`, event);
  }

  updateEvent(id: number, event: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, event);
  }

  getEventTypes(): Observable<EventType[]> {
    return this.http.get<EventType[]>(`${this.apiUrl}/event-types`);
  }

  GetWorkHistory(itemId: number): Observable<WorkHistoryEntry[]> {
    return this.http.get<WorkHistoryEntry[]>(`${this.apiUrl}/work-history/${itemId}`);
  }

  getAttachments(eventId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${eventId}/attachments`);
  }

  uploadAttachments(eventId: number, formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/${eventId}/attachments`, formData);
  }

  downloadAttachment(id: number): Observable<Blob> {
    return this.http.get(`api/Calendar/attachments/download/${id}`, {
      responseType: 'blob'
    });
  }

  deleteAttachment(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/attachments/${id}`);
  }

  updateSingleOccurrence(payload: {
    seriesUid: string;
    occurrenceDate: string;

    subject?: string;
    comment?: string;

    startDate?: string;
    endDate?: string;

    isCancelled?: boolean;

    location?: string | null;

    eventTypeId?: number | null;
  }): Observable<void> {
    return this.http.put<void>(
      `${this.apiUrl}/occurrence`,
      payload
    );
  }


  updateFromOccurrence(payload: {
    seriesUid: string;
    occurrenceDate: string;

    subject?: string;
    comment?: string;
    startDate?: string;
    endDate?: string;
    location?: string | null;
  }): Observable<void> {
    return this.http.put<void>(
      `${this.apiUrl}/occurrence/from`,
      payload
    );
  }

  updateSeriesPreserveExceptions(payload: {
    seriesUid: string;
    subject?: string;
    comment?: string;
    location?: string;
    recurrenceRuleJson: string;
  }): Observable<void> {
    return this.http.put<void>(
      `${this.apiUrl}/series/preserve-exceptions`,
      payload
    );
  }

  updateSeriesOverrideAll(payload: {
    seriesUid: string;
    subject?: string;
    comment?: string;
    location?: string;
    recurrenceRuleJson: string;
  }): Observable<void> {
    return this.http.put<void>(
      `${this.apiUrl}/series/override-all`,
      payload
    );
  }
}
