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
    eventId: number;
    occurrenceDate: string;   // ISO date string, parsed to DateOnly on the API
    subject?: string;
    comment?: string;
    startDate?: string;
    endDate?: string;
    isCancelled?: boolean;
  }): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/occurrence`, payload);
  }

  
// ─────────────────────────────────────────────────────────────────────────────
// SCOPE: 'thisAndFollowing'
// ─────────────────────────────────────────────────────────────────────────────
//
// Splits the series at occurrenceDate:
//   • All occurrences BEFORE occurrenceDate are left untouched.
//   • occurrenceDate and every occurrence AFTER it receive the new values.
//
// Typical backend approach: the server truncates the original series at
// (occurrenceDate - 1), then creates a new series starting at occurrenceDate
// with the updated rule and field values.
//
updateFromOccurrence(
  baseEventId: number,
  occurrenceDate: string,   // ISO string — original scheduled date of this occurrence
  record: any               // full form record from CalendarDialogComponent
): Observable<any> {
  return this.http.patch<any>(
    `${this.apiUrl}/events/${baseEventId}/occurrences/from`,
    {
      occurrenceDate,
      subject:   record.subject,
      comment:   record.comment,
      startDate: record.startDate,
      endDate:   record.endDate,
      location:  record.location,
      // add any other fields your backend accepts
    }
  );
}
 
// ─────────────────────────────────────────────────────────────────────────────
// SCOPE: 'allPreserve'
// ─────────────────────────────────────────────────────────────────────────────
//
// Updates the series-level defaults but SKIPS occurrences that already have
// their own exception records (i.e. occurrences where isException === true or
// equivalent in your data model).
//
// Backend note: the server should iterate over all generated occurrences,
// check whether each one has an exception row, and only write the new values
// to those that do not.
//
updateSeriesPreserveExceptions(
  baseEventId: number,
  record: any
): Observable<any> {
  return this.http.patch<any>(
    `${this.apiUrl}/events/${baseEventId}/series`,
    {
      subject:          record.subject,
      comment:          record.comment,
      location:         record.location,
      recurrenceRuleJson: record.recurrenceRuleJson,
      preserveExceptions: true,   // tells the backend to skip existing exceptions
    }
  );
}
 
// ─────────────────────────────────────────────────────────────────────────────
// SCOPE: 'allOverride'
// ─────────────────────────────────────────────────────────────────────────────
//
// Updates the series-level defaults AND overwrites every individual exception,
// effectively resetting the whole series to the new values.
//
// Backend note: the server should delete (or reset) all exception rows for
// this series, then update the base event with the new values.
//
updateSeriesOverrideAll(
  baseEventId: number,
  record: any
): Observable<any> {
  return this.http.patch<any>(
    `${this.apiUrl}/events/${baseEventId}/series`,
    {
      subject:          record.subject,
      comment:          record.comment,
      location:         record.location,
      recurrenceRuleJson: record.recurrenceRuleJson,
      preserveExceptions: false,   // tells the backend to overwrite all exceptions
    }
  );
}
 
// ─────────────────────────────────────────────────────────────────────────────
// BACKEND ENDPOINT DESIGN NOTE
// ─────────────────────────────────────────────────────────────────────────────
//
// updateSeriesPreserveExceptions and updateSeriesOverrideAll both hit
// PATCH /events/:id/series and differ only in the preserveExceptions flag,
// so they can share one backend handler:
//
//   PATCH /api/events/{baseEventId}/series
//   Body: { subject, comment, location, ..., preserveExceptions: boolean }
//
//   if preserveExceptions === true:
//     UPDATE base_event SET ...
//     UPDATE occurrences SET ... WHERE base_event_id = :id AND is_exception = false
//   else:
//     UPDATE base_event SET ...
//     DELETE FROM exceptions WHERE base_event_id = :id
//     (occurrences regenerated from base on next fetch)
//
// ─────────────────────────────────────────────────────────────────────────────
}
