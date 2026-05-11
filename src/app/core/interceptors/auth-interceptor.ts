import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { catchError, switchMap, take, filter } from 'rxjs/operators';
import { throwError, Observable, BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<any>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  let token = authService.getToken();

  const authReq = token ? addTokenHeader(req, token) : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.includes('/api/Auth/login') && !req.url.includes('/api/Auth/register') && !req.url.includes('/api/Auth/refresh')) {
        return handle401Error(req, next, authService, router);
      }
      return throwError(() => error);
    })
  );
};

function handle401Error(request: HttpRequest<any>, next: HttpHandlerFn, authService: AuthService, router: Router): Observable<HttpEvent<any>> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    const refreshToken = authService.getRefreshToken();
    if (refreshToken) {
      return authService.refresh({ refreshToken }).pipe(
        switchMap((tokenResponse: any) => {
          isRefreshing = false;
          let newToken = null;
          
          if (typeof tokenResponse === 'string') {
              try {
                  const parsed = JSON.parse(tokenResponse);
                  newToken = parsed.accessToken || parsed.token;
              } catch {
                  if (tokenResponse.split('.').length === 3) {
                      newToken = tokenResponse;
                  }
              }
          } else if (tokenResponse) {
              newToken = tokenResponse.accessToken || tokenResponse.token;
          }

          if (newToken) {
              refreshTokenSubject.next(newToken);
              return next(addTokenHeader(request, newToken));
          } else {
              return logoutAndRedirect(authService, router);
          }
        }),
        catchError((err) => {
          isRefreshing = false;
          return logoutAndRedirect(authService, router);
        })
      );
    } else {
      isRefreshing = false;
      return logoutAndRedirect(authService, router);
    }
  } else {
    return refreshTokenSubject.pipe(
      filter(token => token != null),
      take(1),
      switchMap(jwt => {
        return next(addTokenHeader(request, jwt));
      })
    );
  }
}

function addTokenHeader(request: HttpRequest<any>, token: string) {
    return request.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
}

function logoutAndRedirect(authService: AuthService, router: Router) {
    authService.logout().subscribe();
    return throwError(() => new Error('Session expired'));
}