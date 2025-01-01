import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class CalendarService {
  private apiUrl = 'https://localhost:7287/api/Calendar';

  constructor(private http: HttpClient) {}

  // Fetch events with userId parameter
  getEvents(userId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/events?userId=${userId}`);
  }

  // Save event to the backend
  saveEvent(event: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/create`, event);
  }
}
