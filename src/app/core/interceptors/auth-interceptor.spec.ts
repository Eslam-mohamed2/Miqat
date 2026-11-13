import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Observable, Subject, of, throwError } from 'rxjs';

import { authInterceptor } from './auth-interceptor';
import { AuthService, SessionExpiredError } from '../services/auth.service';

/**
 * The interceptor puts the access token on requests and, when it has run out,
 * waits for the one renewal AuthService runs (shared with the live connection).
 */
describe('authInterceptor', () => {
  let stored: string | null;
  let runOut: Set<string>;
  let renewals: Array<Subject<string>>;
  let sent: Array<{ url: string; authorization: string | null }>;
  /** What the server answers, by the token a request carries. */
  let server: (token: string | null) => Observable<HttpEvent<unknown>>;

  const ok = () => of(new HttpResponse({ status: 200, body: 'ok' }));
  const unauthorized = () => throwError(() => new HttpErrorResponse({ status: 401 }));
  const next: HttpHandlerFn = request => {
    const authorization = request.headers.get('Authorization');
    sent.push({ url: request.url, authorization });
    return server(authorization ? authorization.replace('Bearer ', '') : null);
  };

  function send(url = '/api/Chat'): { body: unknown[]; errors: unknown[] } {
    const result = { body: [] as unknown[], errors: [] as unknown[] };
    TestBed.runInInjectionContext(() => authInterceptor(new HttpRequest('GET', url), next)).subscribe({
      next: event => { if (event instanceof HttpResponse) result.body.push(event.body); },
      error: err => result.errors.push(err)
    });
    return result;
  }

  beforeEach(() => {
    stored = 'old';
    runOut = new Set();
    renewals = [];
    sent = [];
    server = () => ok();

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: AuthService,
          useValue: {
            getToken: () => stored,
            isTokenExpired: (token: string) => runOut.has(token),
            renewSession: () => {
              const renewal = new Subject<string>();
              renewals.push(renewal);
              return renewal;
            }
          }
        }
      ]
    });
  });

  /** The renewal answers: the new token is stored, as AuthService does. */
  function renewed(index: number, token: string): void {
    stored = token;
    renewals[index].next(token);
    renewals[index].complete();
  }

  it('sends the stored token', () => {
    const result = send();

    expect(sent).toEqual([{ url: '/api/Chat', authorization: 'Bearer old' }]);
    expect(result.body).toEqual(['ok']);
    expect(renewals.length).toBe(0);
  });

  it('sends nothing when nobody is signed in', () => {
    stored = null;
    send();
    expect(sent[0].authorization).toBeNull();
  });

  it('renews a token that has run out before sending, and sends the request once with the new one', () => {
    runOut.add('old');
    const result = send();
    expect(sent.length).toBe(0);

    renewed(0, 'new');
    expect(sent).toEqual([{ url: '/api/Chat', authorization: 'Bearer new' }]);
    expect(result.body).toEqual(['ok']);
  });

  it('renews after a 401 and sends the request again', () => {
    server = token => (token === 'old' ? unauthorized() : ok());
    const result = send();
    expect(sent.length).toBe(1);

    renewed(0, 'new');
    expect(sent.map(request => request.authorization)).toEqual(['Bearer old', 'Bearer new']);
    expect(result.body).toEqual(['ok']);
    expect(result.errors).toEqual([]);
  });

  it('does not renew again when the token was renewed while the request was on its way', () => {
    // The request leaves with "old"; before its 401 comes back, something else (another
    // request, the live connection, another tab) has stored "new".
    server = token => {
      if (token === 'old') {
        stored = 'new';
        return unauthorized();
      }
      return ok();
    };
    const result = send();

    expect(renewals.length).toBe(0);
    expect(sent.map(request => request.authorization)).toEqual(['Bearer old', 'Bearer new']);
    expect(result.body).toEqual(['ok']);
  });

  it('fails the request, without a second try, when the session is over', () => {
    runOut.add('old');
    const result = send();
    renewals[0].error(new SessionExpiredError());

    expect(sent.length).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0] instanceof SessionExpiredError).toBeTrue();
  });

  it('fails the request with the network error when the renewal could not reach the server', () => {
    runOut.add('old');
    const result = send();
    renewals[0].error(new HttpErrorResponse({ status: 0 }));

    expect((result.errors[0] as HttpErrorResponse).status).toBe(0);
  });

  it('leaves sign-in, sign-out and the renewal itself alone', () => {
    runOut.add('old');
    server = () => unauthorized();
    for (const url of ['/api/Auth/login', '/api/Auth/register', '/api/Auth/refresh', '/api/Auth/logout']) {
      const result = send(url);
      expect((result.errors[0] as HttpErrorResponse).status).toBe(401);
    }

    expect(renewals.length).toBe(0);
    expect(sent.length).toBe(4);
  });

  it('passes other failures on untouched', () => {
    server = () => throwError(() => new HttpErrorResponse({ status: 503 }));
    const result = send();

    expect((result.errors[0] as HttpErrorResponse).status).toBe(503);
    expect(renewals.length).toBe(0);
  });
});
