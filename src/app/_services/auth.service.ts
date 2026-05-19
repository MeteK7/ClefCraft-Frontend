import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { jwtDecode } from 'jwt-decode';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = 'https://localhost:7287/api/Auth';

  constructor(private http: HttpClient) {}

  // =========================
  // AUTH API CALLS
  // =========================

  login(email: string, password: string): Observable<any> {
    const body = { email, password };
    return this.http.post<any>(`${this.apiUrl}/login`, body);
  }

  register(
    firstName: string,
    lastName: string,
    email: string,
    userName: string,
    password: string
  ): Observable<any> {
    const body = { firstName, lastName, email, userName, password };
    return this.http.post<any>(`${this.apiUrl}/register`, body);
  }

  // =========================
  // TOKEN MANAGEMENT
  // =========================

  setToken(token: string): void {
    localStorage.setItem('token', token);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  removeToken(): void {
    localStorage.removeItem('token');
  }

  logout(): void {
    this.removeToken();
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  // =========================
  // JWT HELPERS
  // =========================

  decodeToken(): any | null {
    const token = this.getToken();
    if (!token) return null;

    try {
      return jwtDecode(token);
    } catch (e) {
      console.error('Invalid token', e);
      return null;
    }
  }

  getUserRole(): string | null {
    const decoded = this.decodeToken();
    return decoded?.role || null;
  }

  getUserId(): string | null {
    const decoded = this.decodeToken();
    return decoded?.sub || null;
  }
}