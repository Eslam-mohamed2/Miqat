import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  LoginRequest, RegisterRequest, RefreshTokenRequest, VerifyOtpDto,
  ForgotPasswordDto, ResetPasswordDto, ChangePasswordDto, ResendOtpDto, GoogleLoginDto,
  UserDto, AuthTokens
} from '../../models/api.models';
import { isApiEnvelope } from '../http/api-response';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const LEGACY_TOKEN_KEY = 'token';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/api/Auth`;

  constructor(
    private http: HttpClient,
    private router: Router
  ) { }

  login(data: LoginRequest): Observable<string> {
    return this.http.post(`${this.apiUrl}/login`, data, { responseType: 'text' }).pipe(
      tap(res => this.saveToken(res))
    );
  }

  register(data: RegisterRequest): Observable<string> {
    return this.http.post(`${this.apiUrl}/register`, data, { responseType: 'text' }).pipe(
      catchError(err => {
        if (err.status === 204 || err.status === 200) {
          return of('Success');
        }
        return throwError(() => err);
      })
    );
  }

  refresh(data: RefreshTokenRequest): Observable<string> {
    return this.http.post(`${this.apiUrl}/refresh`, data, { responseType: 'text' }).pipe(
      tap(res => this.saveToken(res))
    );
  }

  logout(data?: RefreshTokenRequest): Observable<unknown> {
    if (!data && this.isBrowser()) {
      const rt = this.getRefreshToken();
      const token = this.getToken();
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

  verifyOtp(data: VerifyOtpDto): Observable<string> {
    return this.http.post(`${this.apiUrl}/verify-otp`, data, { responseType: 'text' }).pipe(
      // Email verification returns no token; password reset returns one. Saving is
      // driven by whether a real token is present, not by sniffing the message text.
      tap(res => this.saveToken(res))
    );
  }

  resendOtp(data: ResendOtpDto): Observable<string> {
    return this.http.post(`${this.apiUrl}/resend-otp`, data, { responseType: 'text' });
  }

  forgotPassword(data: ForgotPasswordDto): Observable<string> {
    return this.http.post(`${this.apiUrl}/forgot-password`, data, { responseType: 'text' });
  }

  resetPassword(data: ResetPasswordDto): Observable<string> {
    return this.http.post(`${this.apiUrl}/reset-password`, data, { responseType: 'text' });
  }

  changePassword(data: ChangePasswordDto): Observable<string> {
    return this.http.post(`${this.apiUrl}/change-password`, data, { responseType: 'text' });
  }

  googleLogin(data: GoogleLoginDto): Observable<string> {
    return this.http.post(`${this.apiUrl}/google`, data, { responseType: 'text' }).pipe(
      tap(res => this.saveToken(res))
    );
  }

  /**
   * Pulls tokens out of an auth response, tolerating every shape the API may use:
   * a bare JWT string, `{accessToken, refreshToken}`, `{token}`, or any of those
   * nested inside the `{success, message, data, errors}` envelope.
   * Returns null when the response carries no token (e.g. email verification).
   */
  extractTokens(res: unknown): AuthTokens | null {
    if (res === null || res === undefined) return null;

    if (typeof res === 'string') {
      const trimmed = res.trim();
      if (!trimmed) return null;

      // Structured bodies are parsed FIRST. A JSON body containing a JWT has dots
      // in it, so testing for a token before parsing matched the whole body and
      // stored it as the access token.
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return this.extractTokens(JSON.parse(trimmed));
        } catch {
          return null;
        }
      }

      return this.looksLikeJwt(trimmed) ? { accessToken: trimmed } : null;
    }

    if (typeof res !== 'object') return null;

    // Unwrap the ApiResponse envelope, then re-read the payload inside it.
    if (isApiEnvelope<unknown>(res)) {
      return this.extractTokens(res.data);
    }

    const body = res as AuthTokens;
    const accessToken = body.accessToken ?? body.token;
    const refreshToken = body.refreshToken;
    if (!accessToken && !refreshToken) return null;

    return { accessToken, refreshToken };
  }

  private saveToken(res: unknown): void {
    if (!this.isBrowser()) return;

    const tokens = this.extractTokens(res);
    if (!tokens) return;

    if (tokens.accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    if (tokens.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }

  /**
   * Restricted to the base64url alphabet so no JSON body, sentence, or status
   * message can ever be mistaken for a token just by containing dots.
   */
  private looksLikeJwt(value: string): boolean {
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(value);
  }

  private clearTokens(): void {
    if (!this.isBrowser()) return;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }

  getToken(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || null;
  }

  getRefreshToken(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY) || null;
  }

  /**
   * Decodes a JWT payload. JWTs are base64**url** encoded (`-`/`_`, no padding) and
   * may hold non-ASCII names, neither of which bare `atob` handles - it throws on
   * `-`/`_` and mangles multi-byte UTF-8.
   */
  decodeToken(token: string | null = this.getToken()): Record<string, any> | null {
    if (!token || !this.isBrowser()) return null;
    const segment = token.split('.')[1];
    if (!segment) return null;

    try {
      const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch {
      return null;
    }
  }

  /** True when the token carries an `exp` claim that has already passed. */
  isTokenExpired(token: string | null = this.getToken()): boolean {
    const payload = this.decodeToken(token);
    if (!payload || typeof payload['exp'] !== 'number') return false;
    return payload['exp'] * 1000 <= Date.now();
  }

  isLoggedIn(): boolean {
    const token = this.getToken();
    return !!token && !this.isTokenExpired(token);
  }

  /**
   * The API builds its JWT from ClaimTypes.*, which serialise as full XML schema
   * URIs — not the short "nameid"/"email"/"name" forms. Reading only the short
   * keys meant this returned null for every real token, which silently broke
   * every caller: "is this my profile", and the counterpart resolution that
   * decides whose name to show on a friend row.
   */
  private static readonly CLAIM_KEYS = {
    id: [
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier',
      'nameid', 'sub', 'id'
    ],
    email: [
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      'email'
    ],
    name: [
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
      'name', 'unique_name'
    ]
  };

  private claim(payload: Record<string, any>, keys: readonly string[]): string | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value) return value;
    }
    return undefined;
  }

  getCurrentUserId(): string | null {
    const payload = this.decodeToken();
    if (!payload) return null;
    return this.claim(payload, AuthService.CLAIM_KEYS.id) ?? null;
  }

  getCurrentUser(): Partial<UserDto> | null {
    const payload = this.decodeToken();
    if (!payload) return null;
    return {
      id: this.claim(payload, AuthService.CLAIM_KEYS.id),
      email: this.claim(payload, AuthService.CLAIM_KEYS.email),
      fullName: this.claim(payload, AuthService.CLAIM_KEYS.name)
    } as Partial<UserDto>;
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  goToLogin(): void {
    this.router.navigate(['/authentication'], { queryParams: { form: 'login' } });
  }

  goToRegister(): void {
    this.router.navigate(['/authentication'], { queryParams: { form: 'register' } });
  }
}
