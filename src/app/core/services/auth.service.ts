import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  LoginRequest, RegisterRequest, RefreshTokenRequest, VerifyOtpDto,
  ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto, ResendOtpDto, GoogleLoginDto, UserDto
} from '../../models/api.models';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/api/Auth`;

  constructor(
    private http: HttpClient,
    private router: Router
  ) { }

  login(data: LoginRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, data, { responseType: 'text' }).pipe(
      tap((res: any) => this.saveToken(res))
    );
  }

  register(data: RegisterRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, data, { responseType: 'text' }).pipe(
      catchError(err => {
        if (err.status === 204 || err.status === 200) {
          return of('Success');
        }
        return throwError(() => err);
      })
    );
  }

  refresh(data: RefreshTokenRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/refresh`, data, { responseType: 'text' }).pipe(
      tap((res: any) => this.saveToken(res))
    );
  }

  logout(data?: RefreshTokenRequest): Observable<any> {
    if (!data && typeof window !== 'undefined') {
      const rt = localStorage.getItem('refreshToken');
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      if (rt) {
        data = { token: token || '', refreshToken: rt };
      }
    }

    const request$ = data 
      ? this.http.post(`${this.apiUrl}/logout`, data).pipe(catchError(() => of(null))) 
      : of(null);

    return request$.pipe(
      tap(() => {
        this.clearTokens();
        this.goToLogin();
      })
    );
  }

  verifyOtp(data: VerifyOtpDto): Observable<any> {
    return this.http.post(`${this.apiUrl}/verify-otp`, data, { responseType: 'text' }).pipe(
      tap((res: any) => {
        // Only save token if it's returned
        if (res && res.length > 0 && !res.toLowerCase().includes('success') && res.includes('ey')) {
          this.saveToken(res);
        }
      })
    );
  }

  resendOtp(data: ResendOtpDto): Observable<any> {
    return this.http.post(`${this.apiUrl}/resend-otp`, data, { responseType: 'text' });
  }

  forgotPassword(data: ForgotPasswordDto): Observable<any> {
    return this.http.post(`${this.apiUrl}/forgot-password`, data, { responseType: 'text' });
  }

  resetPassword(data: ResetPasswordDto): Observable<any> {
    return this.http.post(`${this.apiUrl}/reset-password`, data, { responseType: 'text' });
  }

  changePassword(data: ChangePasswordDto): Observable<any> {
    return this.http.post(`${this.apiUrl}/change-password`, data, { responseType: 'text' });
  }

  googleLogin(data: GoogleLoginDto): Observable<any> {
    return this.http.post(`${this.apiUrl}/google`, data, { responseType: 'text' }).pipe(
      tap((res: any) => this.saveToken(res))
    );
  }

  private saveToken(res: any) {
    if (!res) return;
    if (typeof window === 'undefined') return;

    if (typeof res === 'string') {
      try {
        const parsed = JSON.parse(res);
        if (parsed.accessToken) localStorage.setItem('accessToken', parsed.accessToken);
        if (parsed.refreshToken) localStorage.setItem('refreshToken', parsed.refreshToken);
        if (parsed.token) localStorage.setItem('accessToken', parsed.token);
      } catch {
        if (res.split('.').length === 3) {
          localStorage.setItem('accessToken', res);
        }
      }
    } else {
      if (res.accessToken) localStorage.setItem('accessToken', res.accessToken);
      if (res.refreshToken) localStorage.setItem('refreshToken', res.refreshToken);
      if (res.token) localStorage.setItem('accessToken', res.token);
    }
  }

  private clearTokens() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('token'); // Clear legacy token if exists
    }
  }

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken') || localStorage.getItem('token') || null;
  }

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('refreshToken') || null;
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  getCurrentUserId(): string | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      if (typeof window === 'undefined') return null; // SSR safety for atob
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.nameid || payload.sub || payload.id || null;
    } catch { return null; }
  }

  getCurrentUser(): Partial<UserDto> | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      if (typeof window === 'undefined') return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        id: payload.nameid || payload.sub || payload.id,
        email: payload.email,
        fullName: payload.name || payload.unique_name
      } as Partial<UserDto>;
    } catch { return null; }
  }

  goToLogin(): void {
    this.router.navigate(['/authentication'], { queryParams: { form: 'login' } });
  }

  goToRegister(): void {
    this.router.navigate(['/authentication'], { queryParams: { form: 'register' } });
  }
}