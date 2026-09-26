import { HttpRequest, HttpHandlerFn, HttpEvent, HttpContextToken, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from './auth.service';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, from, switchMap, throwError } from 'rxjs';

// Marks a request that has already been replayed after a refresh, so a second 401 is final.
const RETRIED_AFTER_REFRESH = new HttpContextToken<boolean>(() => false);

// These authenticate with credentials in the body, never with the access token, and a 401
// from them must not trigger another refresh.
const AUTH_ENDPOINT = /\/Auth\/(login|register|refresh|logout)$/;

function withToken(req: HttpRequest<any>, token: string | null): HttpRequest<any> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

export function authInterceptorFn(req: HttpRequest<any>, next: HttpHandlerFn): Observable<HttpEvent<any>> {
  if (AUTH_ENDPOINT.test(req.url)) {
    return next(req);
  }

  const authService = inject(AuthService);
  const router = inject(Router);

  return next(withToken(req, authService.getToken())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || req.context.get(RETRIED_AFTER_REFRESH)) {
        return throwError(() => error);
      }

      return from(authService.refreshSession()).pipe(
        switchMap(token => {
          if (!token) {
            authService.logout(router.url, 'expired');
            return throwError(() => error);
          }

          const retry = req.clone({ context: req.context.set(RETRIED_AFTER_REFRESH, true) });
          return next(withToken(retry, token));
        })
      );
    })
  );
}
