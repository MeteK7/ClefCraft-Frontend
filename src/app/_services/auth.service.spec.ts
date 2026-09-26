import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthService, AuthSession } from './auth.service';
import { environment } from '../../environments/environment';

/** Builds an unsigned JWT-shaped token; jwtDecode only reads the payload. */
function fakeJwt(expiresInSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds }));
  return `header.${payload}.signature`;
}

function storeSession(accessExpiresInSeconds: number, refreshToken = 'refresh-1', refreshExpiresInMs = 86_400_000): void {
  localStorage.setItem('token', fakeJwt(accessExpiresInSeconds));
  localStorage.setItem('refreshToken', refreshToken);
  localStorage.setItem('refreshTokenExpiresAt', new Date(Date.now() + refreshExpiresInMs).toISOString());
}

describe('AuthService', () => {
  const refreshUrl = `${environment.apiUrl}/Auth/refresh`;
  let service: AuthService;
  let http: HttpTestingController;

  function createService(): void {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  }

  /** The refresh POST is sent only after the (async) cross-tab lock is granted. */
  async function nextRefreshRequest(): Promise<TestRequest> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const requests = http.match(refreshUrl);
      if (requests.length) {
        expect(requests.length).withContext('refresh requests sent').toBe(1);
        return requests[0];
      }
      await new Promise(r => setTimeout(r, 5));
    }
    throw new Error('No refresh request was sent.');
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    http?.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    createService();
    expect(service).toBeTruthy();
  });

  describe('isLoggedIn', () => {
    it('is false with no stored session', () => {
      createService();
      expect(service.isLoggedIn()).toBeFalse();
    });

    it('is true with an expired access token but an unexpired refresh token', () => {
      storeSession(-60);
      createService();
      expect(service.isLoggedIn()).toBeTrue();
    });

    it('is false once the refresh token has expired too', () => {
      storeSession(-60, 'refresh-1', -1000);
      createService();
      expect(service.isLoggedIn()).toBeFalse();
    });
  });

  it('setSession stores both tokens and reports the user as authenticated', () => {
    createService();
    const states: boolean[] = [];
    service.isAuthenticated$.subscribe(s => states.push(s));

    const session: AuthSession = {
      token: fakeJwt(900),
      refreshToken: 'refresh-1',
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString()
    };
    service.setSession(session);

    expect(localStorage.getItem('refreshToken')).toBe('refresh-1');
    expect(states).toEqual([false, true]);
  });

  describe('refreshSession', () => {
    it('shares one request between concurrent callers and stores the rotated session', async () => {
      storeSession(-60);
      createService();

      const first = service.refreshSession();
      const second = service.refreshSession();

      const req = await nextRefreshRequest();
      expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
      const newToken = fakeJwt(900);
      req.flush({ token: newToken, refreshToken: 'refresh-2', refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString() });

      expect(await first).toBe(newToken);
      expect(await second).toBe(newToken);
      expect(localStorage.getItem('refreshToken')).toBe('refresh-2');
    });

    it('returns null when the backend rejects the refresh token', async () => {
      storeSession(-60);
      createService();

      const result = service.refreshSession();
      (await nextRefreshRequest()).flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(await result).toBeNull();
    });

    it('skips the network when another tab rotated the token while this one waited', async () => {
      storeSession(-60, 'refresh-1');
      createService();

      // Simulate the other tab finishing its refresh between our call and our turn at the lock.
      const newToken = fakeJwt(900);
      const lockSpy = spyOn(navigator.locks, 'request').and.callFake(((_name: string, action: () => Promise<unknown>) => {
        localStorage.setItem('token', newToken);
        localStorage.setItem('refreshToken', 'refresh-2-from-other-tab');
        return action();
      }) as any);

      expect(await service.refreshSession()).toBe(newToken);
      expect(lockSpy).toHaveBeenCalled();
      http.expectNone(refreshUrl);
    });
  });

  it('getValidAccessToken returns the stored token while it is still usable', async () => {
    storeSession(900);
    createService();

    expect(await service.getValidAccessToken()).toBe(localStorage.getItem('token'));
    http.expectNone(refreshUrl);
  });

  it('logout revokes the refresh token, clears the session and keeps the return url', () => {
    storeSession(900);
    createService();
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    service.logout('/board?openItemId=3');

    const req = http.expectOne(`${environment.apiUrl}/Auth/logout`);
    expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
    req.flush(null);
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true, queryParams: { returnUrl: '/board?openItemId=3' } });
  });
});
