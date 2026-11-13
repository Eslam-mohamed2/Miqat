import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, of } from 'rxjs';

import { AuthService, SessionExpiredError } from './auth.service';

/**
 * Renewing the access token: one renewal at a time, shared by the HTTP requests
 * and the live connection. The instance is built off the prototype (as in
 * auth.service.spec.ts); the request to the server and the sign-out are stand-ins.
 */
function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const jwt = (payload: unknown) => `${b64url({ alg: 'HS256' })}.${b64url(payload)}.sig`;
const seconds = (fromNow: number) => Math.floor(Date.now() / 1000) + fromNow;

const GOOD = jwt({ nameid: '1', exp: seconds(900) });
const RUN_OUT = jwt({ nameid: '1', exp: seconds(-60) });
const NEW = jwt({ nameid: '1', exp: seconds(900), n: 2 });

describe('AuthService: renewing the session', () => {
  let auth: AuthService;
  let saved: Record<string, string | null>;
  let refreshCalls: Array<{ token: string; refreshToken: string }>;
  let answers: Array<Subject<string>>;
  let signOuts: number;

  /** What is in storage, as the app reads it. */
  const store = (access: string | null, refresh: string | null) => {
    access ? localStorage.setItem('accessToken', access) : localStorage.removeItem('accessToken');
    refresh ? localStorage.setItem('refreshToken', refresh) : localStorage.removeItem('refreshToken');
  };
  /** The server answers the renewal that is waiting: new tokens are stored, as AuthService.refresh() does. */
  const answer = (index: number, access = NEW, refresh = 'r2') => {
    store(access, refresh);
    answers[index].next(JSON.stringify({ accessToken: access, refreshToken: refresh }));
    answers[index].complete();
  };
  const refuse = (index: number, status: number) =>
    answers[index].error(new HttpErrorResponse({ status, statusText: 'x', url: '/api/Auth/refresh' }));

  beforeEach(() => {
    saved = { accessToken: localStorage.getItem('accessToken'), refreshToken: localStorage.getItem('refreshToken'), token: localStorage.getItem('token') };
    localStorage.removeItem('token');
    auth = Object.create(AuthService.prototype) as AuthService;
    refreshCalls = [];
    answers = [];
    signOuts = 0;
    spyOn(auth, 'refresh').and.callFake((data: { token: string; refreshToken: string }): Observable<string> => {
      refreshCalls.push(data);
      const subject = new Subject<string>();
      answers.push(subject);
      return subject;
    });
    spyOn(auth, 'logout').and.callFake(() => { signOuts++; return of(null); });
    // One tab on its own; the turns between tabs have their own tests at the end.
    spyOn(auth as any, 'tabLocks').and.returnValue(null);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    }
  });

  it('asks the server once for everyone who asks at the same time', () => {
    store(RUN_OUT, 'r1');
    const got: string[] = [];
    auth.renewSession().subscribe(token => got.push(`request:${token === NEW}`));
    auth.renewSession().subscribe(token => got.push(`request:${token === NEW}`));
    auth.freshToken().then(token => got.push(`live:${token === NEW}`));

    expect(refreshCalls).toEqual([{ token: RUN_OUT, refreshToken: 'r1' }]);
    answer(0);
    expect(got).toEqual(['request:true', 'request:true']);
    return Promise.resolve().then(() => Promise.resolve()).then(() => {
      expect(got).toContain('live:true');
      expect(refreshCalls.length).toBe(1);
      expect(signOuts).toBe(0);
    });
  });

  it('starts a new renewal the next time one is needed', () => {
    store(RUN_OUT, 'r1');
    auth.renewSession().subscribe();
    answer(0);

    auth.renewSession().subscribe();
    expect(refreshCalls.length).toBe(2);
    expect(refreshCalls[1].refreshToken).toBe('r2');
  });

  it('ends the session, once, when the refresh token is refused', () => {
    store(RUN_OUT, 'r1');
    const errors: unknown[] = [];
    auth.renewSession().subscribe({ error: err => errors.push(err) });
    auth.renewSession().subscribe({ error: err => errors.push(err) });
    refuse(0, 401);

    expect(errors.length).toBe(2);
    expect(errors.every(err => err instanceof SessionExpiredError)).toBeTrue();
    expect(signOuts).toBe(1);
  });

  it('does not end the session when the server could not be reached', () => {
    store(RUN_OUT, 'r1');
    const errors: any[] = [];
    auth.renewSession().subscribe({ error: err => errors.push(err) });
    refuse(0, 0);

    expect(errors.length).toBe(1);
    expect(errors[0] instanceof SessionExpiredError).toBeFalse();
    expect(errors[0].status).toBe(0);
    expect(signOuts).toBe(0);

    // The next one who needs a token tries again.
    let token = '';
    auth.renewSession().subscribe(value => (token = value));
    answer(1);
    expect(token).toBe(NEW);
  });

  it('does not end the session on a server fault either', () => {
    store(RUN_OUT, 'r1');
    const errors: any[] = [];
    auth.renewSession().subscribe({ error: err => errors.push(err) });
    refuse(0, 503);

    expect(errors[0].status).toBe(503);
    expect(signOuts).toBe(0);
  });

  it('uses the refresh token another tab stored when its own was used up', () => {
    store(RUN_OUT, 'r1');
    let token = '';
    auth.renewSession().subscribe(value => (token = value));

    // Another tab renewed first: that revoked r1 and stored r9.
    store(RUN_OUT, 'r9');
    refuse(0, 401);
    expect(refreshCalls.map(call => call.refreshToken)).toEqual(['r1', 'r9']);
    expect(signOuts).toBe(0);

    answer(1);
    expect(token).toBe(NEW);
  });

  it('tries the other tab\'s token once, not for ever', () => {
    store(RUN_OUT, 'r1');
    const errors: unknown[] = [];
    auth.renewSession().subscribe({ error: err => errors.push(err) });
    store(RUN_OUT, 'r9');
    refuse(0, 401);
    store(RUN_OUT, 'r10');
    refuse(1, 401);

    expect(refreshCalls.length).toBe(2);
    expect(errors[0] instanceof SessionExpiredError).toBeTrue();
    expect(signOuts).toBe(1);
  });

  it('ends the session when there is no refresh token, or the answer carries no token', () => {
    store(RUN_OUT, null);
    const errors: unknown[] = [];
    auth.renewSession().subscribe({ error: err => errors.push(err) });
    expect(refreshCalls.length).toBe(0);
    expect(errors[0] instanceof SessionExpiredError).toBeTrue();

    store(RUN_OUT, 'r1');
    auth.renewSession().subscribe({ error: err => errors.push(err) });
    answers[0].next('Success');
    expect(errors[1] instanceof SessionExpiredError).toBeTrue();
    expect(signOuts).toBe(2);
  });

  describe('freshToken, for the live connection', () => {
    it('hands out the stored token while it is good, without asking the server', async () => {
      store(GOOD, 'r1');
      expect(await auth.freshToken()).toBe(GOOD);
      expect(refreshCalls.length).toBe(0);
    });

    it('renews a token that has run out', async () => {
      store(RUN_OUT, 'r1');
      const waiting = auth.freshToken();
      answer(0);
      expect(await waiting).toBe(NEW);
    });

    it('renews a token that is about to run out', async () => {
      store(jwt({ nameid: '1', exp: seconds(4) }), 'r1');
      const waiting = auth.freshToken();
      expect(refreshCalls.length).toBe(1);
      answer(0);
      expect(await waiting).toBe(NEW);
    });

    it('answers null when nobody is signed in', async () => {
      store(null, null);
      expect(await auth.freshToken()).toBeNull();
    });

    it('hands out a run-out token that cannot be renewed: the server decides', async () => {
      store(RUN_OUT, null);
      expect(await auth.freshToken()).toBe(RUN_OUT);
      expect(signOuts).toBe(0);
    });

    it('fails when the renewal fails, so the connection tries again later', async () => {
      store(RUN_OUT, 'r1');
      const waiting = auth.freshToken();
      refuse(0, 0);
      await expectAsync(waiting).toBeRejected();
      expect(signOuts).toBe(0);
    });
  });

  describe('hasSession', () => {
    it('is true with a good access token', () => {
      store(GOOD, null);
      expect(auth.hasSession()).toBeTrue();
    });

    it('is true with a run-out access token and a refresh token: it can be renewed', () => {
      store(RUN_OUT, 'r1');
      expect(auth.isLoggedIn()).toBeFalse();
      expect(auth.hasSession()).toBeTrue();
    });

    it('is false with a run-out access token and nothing to renew it with, and when signed out', () => {
      store(RUN_OUT, null);
      expect(auth.hasSession()).toBeFalse();
      store(null, 'r1');
      expect(auth.hasSession()).toBeFalse();
      store(null, null);
      expect(auth.hasSession()).toBeFalse();
    });
  });

  it('counts a token as run out a little early when asked to', () => {
    const soon = jwt({ exp: seconds(5) });
    expect(auth.isTokenExpired(soon)).toBeFalse();
    expect(auth.isTokenExpired(soon, 10_000)).toBeTrue();
  });
});

/**
 * The browser's locks, reduced to what the renewal uses: one holder at a time,
 * in the order asked, until the holder's promise settles.
 */
class FakeLocks {
  asked = 0;
  /** When set, nobody ever gets a turn (a tab that is stuck holds it). */
  stuck = false;
  private held = false;
  private waiting: Array<() => void> = [];

  request(_name: string, options: { signal?: AbortSignal }, run: () => Promise<void>): Promise<void> {
    this.asked++;
    return new Promise<void>((resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('gave up', 'AbortError')));
      const turn = () => {
        this.held = true;
        run().then(() => {
          this.held = false;
          resolve();
          this.waiting.shift()?.();
        });
      };
      if (this.stuck) return;
      this.held ? this.waiting.push(turn) : turn();
    });
  }
}

describe('AuthService: tabs take turns renewing the session', () => {
  let saved: Record<string, string | null>;
  let locks: FakeLocks;

  interface Tab { auth: AuthService; calls: string[]; answers: Array<Subject<string>>; signOuts: number; }

  /** One tab of the browser: its own AuthService, the same storage and the same locks. */
  function openTab(): Tab {
    const tab: Tab = { auth: Object.create(AuthService.prototype) as AuthService, calls: [], answers: [], signOuts: 0 };
    spyOn(tab.auth, 'refresh').and.callFake((data: { refreshToken: string }): Observable<string> => {
      tab.calls.push(data.refreshToken);
      const subject = new Subject<string>();
      tab.answers.push(subject);
      return subject;
    });
    spyOn(tab.auth, 'logout').and.callFake(() => { tab.signOuts++; return of(null); });
    spyOn(tab.auth as any, 'tabLocks').and.returnValue(locks);
    return tab;
  }

  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

  beforeEach(() => {
    saved = { accessToken: localStorage.getItem('accessToken'), refreshToken: localStorage.getItem('refreshToken'), token: localStorage.getItem('token') };
    localStorage.removeItem('token');
    localStorage.setItem('accessToken', RUN_OUT);
    localStorage.setItem('refreshToken', 'r1');
    locks = new FakeLocks();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    }
  });

  it('two tabs that wake up together use the refresh token once: the second takes the first one\'s token', async () => {
    const first = openTab();
    const second = openTab();
    const got: string[] = [];
    first.auth.renewSession().subscribe(token => got.push(`first:${token === NEW}`));
    second.auth.renewSession().subscribe(token => got.push(`second:${token === NEW}`));
    await settle();

    // Only the tab whose turn it is has asked the server.
    expect(first.calls).toEqual(['r1']);
    expect(second.calls).toEqual([]);

    localStorage.setItem('accessToken', NEW);
    localStorage.setItem('refreshToken', 'r2');
    first.answers[0].next(JSON.stringify({ accessToken: NEW, refreshToken: 'r2' }));
    first.answers[0].complete();
    await settle();

    expect(got).toEqual(['first:true', 'second:true']);
    expect(second.calls).toEqual([]);
    expect(first.signOuts + second.signOuts).toBe(0);
  });

  it('the second tab renews itself when the first one could not', async () => {
    const first = openTab();
    const second = openTab();
    const errors: any[] = [];
    let token = '';
    first.auth.renewSession().subscribe({ error: err => errors.push(err) });
    second.auth.renewSession().subscribe(value => (token = value));
    await settle();

    first.answers[0].error(new HttpErrorResponse({ status: 0 }));
    await settle();
    expect(errors[0].status).toBe(0);
    expect(second.calls).toEqual(['r1']);

    localStorage.setItem('accessToken', NEW);
    second.answers[0].next(JSON.stringify({ accessToken: NEW, refreshToken: 'r2' }));
    second.answers[0].complete();
    await settle();
    expect(token).toBe(NEW);
    expect(first.signOuts + second.signOuts).toBe(0);
  });

  it('a tab that never gets its turn renews anyway', async () => {
    jasmine.clock().install();
    try {
      locks.stuck = true;
      const tab = openTab();
      let token = '';
      tab.auth.renewSession().subscribe(value => (token = value));
      await settle();
      expect(tab.calls).toEqual([]);

      jasmine.clock().tick(10_000);
      await settle();
      expect(tab.calls).toEqual(['r1']);

      localStorage.setItem('accessToken', NEW);
      tab.answers[0].next(JSON.stringify({ accessToken: NEW, refreshToken: 'r2' }));
      tab.answers[0].complete();
      expect(token).toBe(NEW);
    } finally {
      jasmine.clock().uninstall();
    }
  });
});
