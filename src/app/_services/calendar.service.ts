import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class CalendarService {
  private apiUrl = 'https://localhost:7287/api/Calendar';

  constructor(private http: HttpClient) { }

  // Fetch events with userId parameter
  getEvents(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/events`);
  }

  // Save event to the backend
  saveEvent(event: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/create`, event);
  }

  updateEvent(id: number, event: any): Observable<any> {
  return this.http.put<any>(`${this.apiUrl}/${id}`, event);
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
}
