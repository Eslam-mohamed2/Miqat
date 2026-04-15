import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/api/Auth`;

  constructor(
    private http: HttpClient,
    private router: Router
  ) { }

  login(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, data, { responseType: 'text' }).pipe(
      tap((res: any) => this.saveToken(res))
    );
  }

  register(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, data, { responseType: 'text' }).pipe(
      catchError(err => {
        if (err.status === 204 || err.status === 200) {
          return of('Success');
        }
        return throwError(() => err);
      })
    );
  }

  verifyOtp(data: { email: string, code: string, purpose: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/verify-otp`, data, { responseType: 'text' }).pipe(
      tap((res: any) => this.saveToken(res))
    );
  }

  private saveToken(res: any) {
    if (!res) return;
    if (typeof res === 'string') {
      try {
        const parsed = JSON.parse(res);
        if (parsed && (parsed.token || parsed.accessToken)) {
          localStorage.setItem('token', parsed.token || parsed.accessToken);
        }
      } catch {
        // Only save raw string if it resembles a JWT structure securely
        if (res.split('.').length === 3) {
          localStorage.setItem('token', res);
        }
      }
    } else if (res && (res.token || res.accessToken)) {
      localStorage.setItem('token', res.token || res.accessToken);
    }
  }

  resendOtp(data: { email: string, purpose: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/resend-otp`, data, { responseType: 'text' });
  }

  getToken(): string | null {
    return localStorage.getItem('token') || null;
  }

  refreshToken(): Observable<any> {
    return this.http.post(`${this.apiUrl}/refresh`, {});
  }

  logout(): Observable<any> {
    localStorage.removeItem('token');
    this.goToLogin();
    return new Observable(subscriber => {
      subscriber.next(null);
      subscriber.complete();
    });
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  goToLogin(): void {
    this.router.navigate(['/authentication'], { queryParams: { form: 'login' } });
  }

  goToRegister(): void {
    this.router.navigate(['/authentication'], { queryParams: { form: 'register' } });
  }

  forgotPassword(data: { email: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/forgot-password`, data, { responseType: 'text' });
  }

  changePassword(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/change-password`, data, { responseType: 'text' });
  }
}