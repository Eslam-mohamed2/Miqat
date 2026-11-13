import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { catchError, switchMap } from 'rxjs/operators';
import { throwError, Observable } from 'rxjs';

const AUTH_PATHS_WITHOUT_RETRY = ['/api/Auth/login', '/api/Auth/register', '/api/Auth/refresh', '/api/Auth/logout'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  const isAuthPath = AUTH_PATHS_WITHOUT_RETRY.some(path => req.url.includes(path));
  const token = authService.getToken();

  // Access tokens last 15 minutes. Waiting for a 401 meant that every 15 minutes
  // the first burst of requests all failed before anything recovered — noisy in
  // the console, and any hiccup in that recovery signed the user out. Refreshing
  // up front when the token is already expired avoids the burst entirely.
  if (!isAuthPath && token && authService.isTokenExpired(token)) {
    return retryWithRenewedToken(req, next, authService);
  }

  const authReq = token ? addTokenHeader(req, token) : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isAuthPath) {
        // The token was renewed while this request was on its way (by another
        // request, another tab or the live connection): the stored one is good,
        // and renewing again would only rotate the refresh token once more.
        const stored = authService.getToken();
        if (stored && stored !== token && !authService.isTokenExpired(stored)) {
          return next(addTokenHeader(req, stored));
        }
        return retryWithRenewedToken(req, next, authService);
      }
      return throwError(() => error);
    })
  );
};

/**
 * Renews the access token and sends the request again with the new one.
 *
 * The renewal itself lives in AuthService.renewSession(): one at a time for the
 * whole app, shared with the live connection, so requests that arrive while it
 * is on its way wait for it instead of starting their own. It also decides what
 * a failure means: a refused refresh token ends the session (the user is signed
 * out there), a dropped connection or a server fault does not — the request
 * then simply fails with that error.
 */
function retryWithRenewedToken(
  request: HttpRequest<any>,
  next: HttpHandlerFn,
  authService: AuthService
): Observable<HttpEvent<any>> {
  return authService.renewSession().pipe(
    switchMap(token => next(addTokenHeader(request, token)))
  );
}

function addTokenHeader(request: HttpRequest<any>, token: string): HttpRequest<any> {
  return request.clone({
    setHeaders: { Authorization: `Bearer ${token}` }
  });
}
