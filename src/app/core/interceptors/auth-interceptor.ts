import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { catchError, switchMap, take, filter } from 'rxjs/operators';
import { throwError, Observable, BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';

const AUTH_PATHS_WITHOUT_RETRY = ['/api/Auth/login', '/api/Auth/register', '/api/Auth/refresh', '/api/Auth/logout'];

let isRefreshing = false;
let refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isAuthPath = AUTH_PATHS_WITHOUT_RETRY.some(path => req.url.includes(path));
  const token = authService.getToken();

  // Access tokens last 15 minutes. Waiting for a 401 meant that every 15 minutes
  // the first burst of requests all failed before anything recovered — noisy in
  // the console, and any hiccup in that recovery signed the user out. Refreshing
  // up front when the token is already expired avoids the burst entirely.
  if (!isAuthPath && token && authService.isTokenExpired(token)) {
    return handle401Error(req, next, authService, router);
  }

  const authReq = token ? addTokenHeader(req, token) : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isAuthPath) {
        return handle401Error(req, next, authService, router);
      }
      return throwError(() => error);
    })
  );
};

function handle401Error(
  request: HttpRequest<any>,
  next: HttpHandlerFn,
  authService: AuthService,
  router: Router
): Observable<HttpEvent<any>> {
  if (isRefreshing) {
    // Wait for the in-flight refresh. If it fails, failRefreshQueue() errors this
    // subject so parked requests reject instead of hanging forever.
    return refreshTokenSubject.pipe(
      filter((token): token is string => token != null),
      take(1),
      switchMap(token => next(addTokenHeader(request, token)))
    );
  }

  isRefreshing = true;
  refreshTokenSubject.next(null);

  const refreshToken = authService.getRefreshToken();
  if (!refreshToken) {
    isRefreshing = false;
    return failRefreshQueue(authService);
  }

  return authService.refresh({ token: authService.getToken() || '', refreshToken }).pipe(
    switchMap(response => {
      isRefreshing = false;
      const newToken = authService.extractTokens(response)?.accessToken;

      if (!newToken) {
        return failRefreshQueue(authService);
      }

      refreshTokenSubject.next(newToken);
      return next(addTokenHeader(request, newToken));
    }),
    catchError((error: HttpErrorResponse) => {
      isRefreshing = false;

      // The API rotates refresh tokens: using one revokes it and issues another.
      // So a 401 here does not necessarily mean the session is over — it usually
      // means something else (another tab, or an earlier in-flight refresh)
      // already rotated it. If storage now holds a different token, that one is
      // live, and retrying with it is correct. Logging out here is what kicked
      // people back to the sign-in screen mid-session.
      const currentToken = authService.getRefreshToken();
      if (currentToken && currentToken !== refreshToken) {
        return retryWithRotatedToken(request, next, authService, currentToken);
      }

      // A dropped connection or a server fault is not an authentication failure.
      // Ending the session on those meant one flaky request signed the user out.
      if (!isAuthFailure(error)) {
        resetRefreshQueue();
        return throwError(() => error);
      }

      return failRefreshQueue(authService);
    })
  );
}

/** Only a refusal from the refresh endpoint itself should end the session. */
function isAuthFailure(error: HttpErrorResponse): boolean {
  return error?.status === 401 || error?.status === 403;
}

/**
 * Someone else rotated the refresh token while this attempt was in flight, so
 * this retries once with the token that is now stored. A second failure falls
 * through to a real logout rather than looping.
 */
function retryWithRotatedToken(
  request: HttpRequest<any>,
  next: HttpHandlerFn,
  authService: AuthService,
  refreshToken: string
): Observable<HttpEvent<any>> {
  isRefreshing = true;

  return authService.refresh({ token: authService.getToken() || '', refreshToken }).pipe(
    switchMap(response => {
      isRefreshing = false;
      const newToken = authService.extractTokens(response)?.accessToken;
      if (!newToken) return failRefreshQueue(authService);

      refreshTokenSubject.next(newToken);
      return next(addTokenHeader(request, newToken));
    }),
    catchError((error: HttpErrorResponse) => {
      isRefreshing = false;
      if (!isAuthFailure(error)) {
        resetRefreshQueue();
        return throwError(() => error);
      }
      return failRefreshQueue(authService);
    })
  );
}

/**
 * Releases requests parked on a refresh that did not complete, without ending
 * the session — used when the failure was a network or server problem.
 */
function resetRefreshQueue(): void {
  refreshTokenSubject.error(new Error('Token refresh failed'));
  refreshTokenSubject = new BehaviorSubject<string | null>(null);
}

function addTokenHeader(request: HttpRequest<any>, token: string): HttpRequest<any> {
  return request.clone({
    setHeaders: { Authorization: `Bearer ${token}` }
  });
}

/**
 * Rejects every request parked on the refresh, then swaps in a fresh subject so a
 * later login can start a new refresh cycle (an errored subject stays errored).
 */
function failRefreshQueue(authService: AuthService): Observable<never> {
  const sessionExpired = new Error('Session expired');

  refreshTokenSubject.error(sessionExpired);
  refreshTokenSubject = new BehaviorSubject<string | null>(null);

  authService.logout().subscribe();
  return throwError(() => sessionExpired);
}
