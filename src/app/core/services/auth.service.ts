import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, defer, firstValueFrom, of, throwError } from 'rxjs';
import { tap, catchError, finalize, map, shareReplay } from 'rxjs/operators';
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
/** The live connection renews a token that is about to run out, so it is not refused halfway through connecting. */
const ABOUT_TO_EXPIRE_MS = 10_000;
/** The name under which the tabs of this browser take turns renewing the session. */
const RENEWAL_LOCK = 'miqat.session.renewal';
/** A tab that does not get its turn within this time renews anyway. */
const RENEWAL_TURN_WAIT_MS = 10_000;

/** The refresh token was refused (or there is none): the session is over and the user has been sent to sign in. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'SessionExpiredError';
  }
}

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

  /** The renewal that is on its way, shared by everyone who asks while it is. */
  private renewal: Observable<string> | null = null;

  /**
   * Renews the access token with the stored refresh token and answers the new one.
   *
   * There is one renewal at a time for the whole app: the HTTP interceptor and
   * the live connection both come here, and whoever asks while one is on its way
   * waits for that one. The API rotates refresh tokens (using one revokes it), so
   * two renewals side by side would make the second fail and sign the user out.
   * For the same reason the tabs of one browser take turns (see renewInTurn):
   * they share the stored tokens, and after a sleep they all wake up together.
   *
   * Fails with {@link SessionExpiredError} when the session is really over (the
   * user is then signed out and sent to the sign-in screen), and with the
   * original error when the server could not be reached: a dropped connection is
   * not the end of a session.
   */
  renewSession(): Observable<string> {
    if (this.renewal) return this.renewal;

    const renewal: Observable<string> = defer(() => this.renewInTurn()).pipe(
      catchError(err => {
        if (err instanceof SessionExpiredError) this.logout().subscribe();
        return throwError(() => err);
      }),
      finalize(() => { if (this.renewal === renewal) this.renewal = null; }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.renewal = renewal;
    return renewal;
  }

  /**
   * Renews when it is this tab's turn. A tab that waited finds the token the
   * tab before it stored, and uses that one instead of asking the server again.
   */
  private renewInTurn(): Observable<string> {
    const stale = this.getToken();
    const renew = (): Observable<string> => {
      const stored = this.getToken();
      if (stored && stored !== stale && !this.isTokenExpired(stored, ABOUT_TO_EXPIRE_MS)) return of(stored);
      return this.renewOnce(true);
    };

    const locks = this.tabLocks();
    if (!locks) return renew();

    return new Observable<string>(subscriber => {
      let started = false;
      const giveUp = new AbortController();
      const timer = setTimeout(() => giveUp.abort(), RENEWAL_TURN_WAIT_MS);
      const run = () => new Promise<void>(done => {
        started = true;
        clearTimeout(timer);
        renew().subscribe({
          next: token => subscriber.next(token),
          error: err => { done(); subscriber.error(err); },
          complete: () => { done(); subscriber.complete(); }
        });
      });

      // The turn is held until the new tokens are stored (the promise of run()).
      locks.request(RENEWAL_LOCK, { signal: giveUp.signal }, run).catch(() => {
        clearTimeout(timer);
        // No turn (another tab is stuck with it, or the browser refused): renew anyway.
        if (!started) run();
      });
    });
  }

  /** The browser's locks, shared by its tabs; null where there are none. Its own method so a test can replace it. */
  private tabLocks(): LockManager | null {
    return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null;
  }

  private renewOnce(mayRetry: boolean): Observable<string> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return throwError(() => new SessionExpiredError());

    return this.refresh({ token: this.getToken() || '', refreshToken }).pipe(
      map(response => {
        const token = this.extractTokens(response)?.accessToken;
        if (!token) throw new SessionExpiredError();
        return token;
      }),
      catchError(err => {
        if (err instanceof SessionExpiredError) return throwError(() => err);

        // A refusal does not always mean the session is over: another tab may have
        // used this refresh token first, which revokes it and stores a new one.
        // If storage now holds a different token, that one is live: try it, once.
        const stored = this.getRefreshToken();
        if (mayRetry && stored && stored !== refreshToken) return this.renewOnce(false);

        // Only a refusal from the refresh endpoint itself ends the session.
        const refused = err?.status === 401 || err?.status === 403;
        return throwError(() => (refused ? new SessionExpiredError() : err));
      })
    );
  }

  /**
   * An access token the server will accept right now, for the live connection:
   * the stored one while it is good, otherwise a renewed one. Null when nobody
   * is signed in. Rejects when the token had to be renewed and could not be.
   */
  async freshToken(): Promise<string | null> {
    const token = this.getToken();
    if (!token) return null;
    if (!this.isTokenExpired(token, ABOUT_TO_EXPIRE_MS)) return token;
    // Nothing to renew it with: the server decides.
    if (!this.getRefreshToken()) return token;

    return firstValueFrom(this.renewSession());
  }

  /** Someone is signed in: the access token is good, or there is a refresh token to renew it with. */
  hasSession(): boolean {
    return this.isLoggedIn() || (!!this.getToken() && !!this.getRefreshToken());
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

  /**
   * Step 1 of changing the sign-in address: a code is sent to the new address.
   * Nothing changes until that code is confirmed.
   */
  requestEmailChange(newEmail: string, currentPassword: string): Observable<{ message?: string }> {
    return this.http.post<{ message?: string }>(`${this.apiUrl}/change-email`, { newEmail, currentPassword });
  }

  /** Step 2: the code that arrived at the new address. Answers the new address. */
  confirmEmailChange(code: string): Observable<{ message?: string; email?: string }> {
    return this.http.post<{ message?: string; email?: string }>(`${this.apiUrl}/change-email/confirm`, { code });
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

  /** True when the token carries an `exp` claim that has already passed (or passes within `withinMs`). */
  isTokenExpired(token: string | null = this.getToken(), withinMs = 0): boolean {
    const payload = this.decodeToken(token);
    if (!payload || typeof payload['exp'] !== 'number') return false;
    return payload['exp'] * 1000 <= Date.now() + withinMs;
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
