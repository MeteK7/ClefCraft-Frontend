import { HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { AuthService } from './auth.service';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';

export function authInterceptorFn(req: HttpRequest<any>, next: HttpHandlerFn): Observable<HttpEvent<any>> {
  const authService = inject(AuthService);  // Use `inject` to get AuthService instance
  const authToken = authService.getToken(); // Get token from AuthService

  // If there's a token, clone the request and add the Authorization header
  if (authToken) {
    const clonedRequest = req.clone({
      setHeaders: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    return next(clonedRequest);  // Pass the cloned request to next handler
  }

  return next(req);  // If no token, just pass the original request
}
