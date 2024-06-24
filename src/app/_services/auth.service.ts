import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'https://localhost:7287/api/Auth'; // API base URL
  //private loginUrl = 'https://localhost:7287/api/Auth/login'; // Your API endpoint

  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    const body = JSON.stringify({ email, password });

    return this.http.post<any>(`${this.apiUrl}/login`, body, { headers });
  }

  register(firstName: string, lastName: string, email: string, userName: string, password: string): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
  
    const body = JSON.stringify({ firstName, lastName, email, userName, password });
  
    return this.http.post<any>(`${this.apiUrl}/register`, body, { headers });
  }
  
}
