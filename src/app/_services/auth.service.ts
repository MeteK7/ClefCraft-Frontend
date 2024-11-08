import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { jwtDecode } from 'jwt-decode';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'https://localhost:7287/api/Auth'; // API base URL
  //private loginUrl = 'https://localhost:7287/api/Auth/login'; // Your API endpoint

  constructor(private http: HttpClient) { }

  login(email: string, password: string): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });
    const body = JSON.stringify({ email, password });

    return this.http.post<any>(`${this.apiUrl}/login`, body, { headers }).pipe(
      tap(response => {
        console.log('Received token:', response.token);

        // Save the JWT token in localStorage after login
        localStorage.setItem('token', response.token);

        this.logDecodedToken(); // Call method to log the decoded token

      })
    );
  }

  logout(): void {
    localStorage.removeItem('token');
  }

  // Helper method to retrieve token
  getToken(): string | null {
    return localStorage.getItem('token');
  }

  register(firstName: string, lastName: string, email: string, userName: string, password: string): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    const body = JSON.stringify({ firstName, lastName, email, userName, password });

    return this.http.post<any>(`${this.apiUrl}/register`, body, { headers });
  }

  logDecodedToken(): void {
    const token = this.getToken();
    if (token) {
      const decoded = jwtDecode<any>(token);
      console.log('Decoded token:', decoded);
    } else {
      console.warn('No token found in localStorage');
    }
  }
}
