import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { authInterceptorFn } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptorFn', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['getToken', 'refreshSession', 'logout']);
    auth.getToken.and.returnValue('expired-token');

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptorFn])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: auth },
      ]
    });

    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    spyOnProperty(TestBed.inject(Router), 'url').and.returnValue('/board?openItemId=3');
  });

  afterEach(() => backend.verify());

  const flush401 = (url: string) =>
    backend.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });

  /** Lets the refreshSession() promise resolve so the retried request is issued. */
  const settle = () => new Promise(r => setTimeout(r));

  it('attaches the access token', () => {
    http.get('/api/Boards').subscribe();

    const req = backend.expectOne('/api/Boards');
    expect(req.request.headers.get('Authorization')).toBe('Bearer expired-token');
    req.flush([]);
  });

  it('refreshes once on 401 and replays the request with the new token', async () => {
    auth.refreshSession.and.resolveTo('fresh-token');
    let result: unknown;
    http.get('/api/Boards').subscribe(r => result = r);

    flush401('/api/Boards');
    await settle();

    const retry = backend.expectOne('/api/Boards');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh-token');
    retry.flush(['board']);

    expect(result).toEqual(['board']);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('logs out with the current url when the refresh fails', async () => {
    auth.refreshSession.and.resolveTo(null);
    let status: number | undefined;
    http.get('/api/Boards').subscribe({ error: e => status = e.status });

    flush401('/api/Boards');
    await settle();

    expect(auth.logout).toHaveBeenCalledOnceWith('/board?openItemId=3', 'expired');
    expect(status).toBe(401);
  });

  it('does not refresh again when the replayed request is also rejected', async () => {
    auth.refreshSession.and.resolveTo('fresh-token');
    let status: number | undefined;
    http.get('/api/Boards').subscribe({ error: e => status = e.status });

    flush401('/api/Boards');
    await settle();
    flush401('/api/Boards');

    expect(status).toBe(401);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('leaves auth endpoints alone: no token and no refresh on 401', () => {
    let status: number | undefined;
    http.post('/api/Auth/refresh', { refreshToken: 'x' }).subscribe({ error: e => status = e.status });

    const req = backend.expectOne('/api/Auth/refresh');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it('passes non-401 errors through untouched', () => {
    let status: number | undefined;
    http.get('/api/Boards').subscribe({ error: e => status = e.status });

    backend.expectOne('/api/Boards').flush(null, { status: 403, statusText: 'Forbidden' });

    expect(status).toBe(403);
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});
