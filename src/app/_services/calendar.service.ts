import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EventType } from '../models/event-type.model';

@Injectable({
  providedIn: 'root',
})
export class CalendarService {
  private apiUrl = 'https://localhost:7287/api/Calendar';

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

  GetWorkHistory(itemId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/WorkHistory/${itemId}`);
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


  updateFromOccurrence(
    baseEventId: number,
    occurrenceDate: string, 
    record: any              
  ): Observable<any> {
    return this.http.patch<any>(
      `${this.apiUrl}/events/${baseEventId}/occurrences/from`,
      {
        occurrenceDate,
        subject: record.subject,
        comment: record.comment,
        startDate: record.startDate,
        endDate: record.endDate,
        location: record.location,
      }
    );
  }

  updateSeriesPreserveExceptions(
    baseEventId: number,
    record: any
  ): Observable<any> {
    return this.http.patch<any>(
      `${this.apiUrl}/events/${baseEventId}/series`,
      {
        subject: record.subject,
        comment: record.comment,
        location: record.location,
        recurrenceRuleJson: record.recurrenceRuleJson,
        preserveExceptions: true,   // tells the backend to skip existing exceptions
      }
    );
  }

  updateSeriesOverrideAll(
    baseEventId: number,
    record: any
  ): Observable<any> {
    return this.http.patch<any>(
      `${this.apiUrl}/events/${baseEventId}/series`,
      {
        subject: record.subject,
        comment: record.comment,
        location: record.location,
        recurrenceRuleJson: record.recurrenceRuleJson,
        preserveExceptions: false,   // tells the backend to overwrite all exceptions
      }
    );
  }
}
