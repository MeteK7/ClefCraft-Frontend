import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { jwtDecode } from 'jwt-decode';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';

// Replace "any" with your actual User model when available.
type CurrentUser = any;

export interface AuthSession {
  token: string;
  refreshToken: string;
  /** Server-side idle deadline: the refresh token dies if not used by then. */
  refreshTokenExpiresAt: string;
  /** Hard cap on the whole session (login + 8 h); never extended by refreshes. */
  sessionExpiresAt?: string;
}

/** Why a session ended without the user clicking "log out"; shown on the login page. */
export type SignOutReason = 'idle' | 'expired';

const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refreshToken';
const REFRESH_TOKEN_EXPIRES_KEY = 'refreshTokenExpiresAt';

// An access token this close to expiry is treated as already expired, so requests and hub
// (re)connects don't start with a token that dies in flight.
const ACCESS_TOKEN_SKEW_MS = 30_000;

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/Auth`;

  private readonly currentUserSubject = new BehaviorSubject<CurrentUser | null>(null);
  readonly currentUser$ = this.currentUserSubject.asObservable();

  private readonly isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  /** Emits true after login (or at startup with a stored session) and false after logout. */
  readonly isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  private refreshInFlight: Promise<string | null> | null = null;

  constructor(private readonly http: HttpClient, private readonly router: Router) {
    this.isAuthenticatedSubject.next(this.isLoggedIn());
  }

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
  //
  // Both tokens live in localStorage. This is a deliberate trade-off: an XSS bug could read the
  // refresh token as well as the access token. The extra exposure is small because the server
  // kills a refresh token after 15 idle minutes and every session after 8 hours, and it also
  // rotates tokens with reuse detection, revokes on logout and stores only hashes. An httpOnly
  // cookie would need SameSite=None + CSRF handling for the cross-site dev setup
  // (http :4200 -> https :7287); revisit once the SPA and API are served from one origin.

  setSession(session: AuthSession): void {
    localStorage.setItem(TOKEN_KEY, session.token);
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
    localStorage.setItem(REFRESH_TOKEN_EXPIRES_KEY, session.refreshTokenExpiresAt);
    this.isAuthenticatedSubject.next(true);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  private clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_EXPIRES_KEY);
    this.isAuthenticatedSubject.next(false);
  }

  /**
   * Rotates the refresh token and returns the new access token, or null if the session is over.
   * Concurrent callers in this tab share one request, and the Web Locks API serializes refreshes
   * across tabs: two tabs presenting the same refresh token would look like token theft to the
   * backend and revoke every session.
   */
  refreshSession(): Promise<string | null> {
    if (!this.refreshInFlight) {
      const refreshTokenAtStart = this.getRefreshToken();
      this.refreshInFlight = this.withCrossTabLock(() => this.performRefresh(refreshTokenAtStart))
        .finally(() => this.refreshInFlight = null);
    }

    return this.refreshInFlight;
  }

  /** The stored access token if it is still usable, otherwise a freshly refreshed one. */
  async getValidAccessToken(): Promise<string | null> {
    const token = this.getToken();

    if (token && this.isAccessTokenUsable(token)) {
      return token;
    }

    return this.getRefreshToken() ? this.refreshSession() : null;
  }

  private async performRefresh(refreshTokenAtStart: string | null): Promise<string | null> {
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      return null;
    }

    // Another tab rotated the token while we waited for the lock; its access token is ours too.
    const token = this.getToken();
    if (refreshToken !== refreshTokenAtStart && token && this.isAccessTokenUsable(token)) {
      return token;
    }

    try {
      const session = await firstValueFrom(
        this.http.post<AuthSession>(`${this.apiUrl}/refresh`, { refreshToken })
      );
      this.setSession(session);
      return session.token;
    } catch {
      return null;
    }
  }

  private withCrossTabLock<T>(action: () => Promise<T>): Promise<T> {
    return typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('clefcraft-auth-refresh', action)
      : action();
  }

  /**
   * Ends the session. For a forced sign-out, pass the current url (so login can bring the user
   * back) and the reason (so the login page can say why).
   */
  logout(returnUrl?: string, reason?: SignOutReason): void {
    const refreshToken = this.getRefreshToken();

    if (refreshToken) {
      // Best effort: the local session ends regardless of whether the revoke reaches the server.
      this.http.post(`${this.apiUrl}/logout`, { refreshToken }).subscribe({ error: () => { } });
    }

    this.clearSession();

    this.currentUserSubject.next(null);

    const queryParams: Record<string, string> = {};
    if (returnUrl && returnUrl !== '/' && !returnUrl.startsWith('/login')) {
      queryParams['returnUrl'] = returnUrl;
    }
    if (reason) {
      queryParams['reason'] = reason;
    }

    this.router.navigate(
      ['/login'],
      {
        replaceUrl: true,
        queryParams: Object.keys(queryParams).length ? queryParams : undefined
      }
    );
  }

  /** True while there is a usable session: a valid access token, or a refresh token to get one. */
  isLoggedIn(): boolean {
    const token = this.getToken();

    if (token && this.isAccessTokenUsable(token, 0)) {
      return true;
    }

    const refreshExpiresAt = Date.parse(localStorage.getItem(REFRESH_TOKEN_EXPIRES_KEY) ?? '');

    return !!this.getRefreshToken() && refreshExpiresAt > Date.now();
  }

  private isAccessTokenUsable(token: string, skewMs = ACCESS_TOKEN_SKEW_MS): boolean {
    try {
      const decoded: any = jwtDecode(token);

      return !!decoded.exp && decoded.exp * 1000 - skewMs > Date.now();
    }

    catch {
      return false;
    }
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

  hasRole(role: string): boolean {

    const roles = this.getRoleClaim();

    if (!roles) {
      return false;
    }

    if (Array.isArray(roles)) {
      return roles.includes(role);
    }

    return roles === role;
  }

  private getRoleClaim(): string | string[] | null {

    const token = this.decodeToken();

    if (!token) {
      return null;
    }

    return (
      token.role ??
      token.roles ??
      token['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ??
      null
    );
  }
}