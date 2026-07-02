import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { jwtDecode } from 'jwt-decode';
import { environment } from '../../environments/environment.prod';

// Replace "any" with your actual User model when available.
type CurrentUser = any;

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/Auth`;

  private readonly currentUserSubject = new BehaviorSubject<CurrentUser | null>(null);
  readonly currentUser$ = this.currentUserSubject.asObservable();

  constructor(private readonly http: HttpClient) {}

  // ==========================================================
  // Initialization
  // ==========================================================

  initializeUser(): void {
    if (!this.isLoggedIn()) {
      return;
    }

    this.loadCurrentUser().subscribe({
      next: user => this.currentUserSubject.next(user),
      error: err => console.error('Failed to load current user.', err)
    });
  }

  // ==========================================================
  // Authentication
  // ==========================================================

  login(email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, {
      email,
      password
    });
  }

  register(
    firstName: string,
    lastName: string,
    email: string,
    userName: string,
    password: string
  ): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, {
      firstName,
      lastName,
      email,
      userName,
      password
    });
  }

  loadCurrentUser(): Observable<CurrentUser> {
    return this.http.get<CurrentUser>(`${this.apiUrl}/me`);
  }

  // ==========================================================
  // Current User
  // ==========================================================

  setCurrentUser(user: CurrentUser): void {
    this.currentUserSubject.next(user);
  }

  getCurrentUser(): CurrentUser | null {
    return this.currentUserSubject.value;
  }

  // ==========================================================
  // Token Management
  // ==========================================================

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
    this.currentUserSubject.next(null);
  }

  isLoggedIn(): boolean {
    return this.getToken() !== null;
  }

  // ==========================================================
  // JWT Helpers
  // ==========================================================

  decodeToken(): any | null {
    const token = this.getToken();

    if (!token) {
      return null;
    }

    try {
      return jwtDecode(token);
    } catch (error) {
      console.error('Invalid JWT token.', error);
      return null;
    }
  }

  getUserId(): string | null {
    return this.decodeToken()?.uid ?? null;
  }

  getUserRole(): string | null {
    return this.decodeToken()?.role ?? null;
  }
}