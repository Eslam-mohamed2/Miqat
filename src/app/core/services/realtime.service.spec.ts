import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HubConnection, HubConnectionState } from '@microsoft/signalr';

import { AuthService } from './auth.service';
import { LOST_AFTER_MS, RETRY_DELAYS_MS, RealtimeService } from './realtime.service';

/** Stands in for the SignalR connection: starts when told to, and can be dropped. */
class FakeConnection {
  state = HubConnectionState.Disconnected;
  starts = 0;
  stops = 0;
  /** How the next starts end: true connects, false fails. Empty: connects. */
  outcomes: boolean[] = [];
  private handlers = new Map<string, (payload: unknown) => void>();
  private closeHandlers: Array<() => void> = [];

  on(event: string, handler: (payload: unknown) => void): void { this.handlers.set(event, handler); }
  onclose(handler: () => void): void { this.closeHandlers.push(handler); }

  async start(): Promise<void> {
    if (this.state !== HubConnectionState.Disconnected) throw new Error('not disconnected');
    this.starts++;
    this.state = HubConnectionState.Connecting;
    await Promise.resolve();
    if (this.outcomes.shift() === false) {
      this.state = HubConnectionState.Disconnected;
      throw new Error('could not connect');
    }
    this.state = HubConnectionState.Connected;
  }

  async stop(): Promise<void> {
    this.stops++;
    this.state = HubConnectionState.Disconnected;
  }

  /** The network took the connection away. */
  drop(): void {
    this.state = HubConnectionState.Disconnected;
    this.closeHandlers.forEach(handler => handler());
  }

  push(event: string, payload: unknown): void { this.handlers.get(event)?.(payload); }
}

class TestRealtime extends RealtimeService {
  readonly fake = new FakeConnection();
  made = 0;

  protected override createConnection(): HubConnection {
    this.made++;
    return this.fake as unknown as HubConnection;
  }
}

/** Lets the promises of a start run to their end. */
async function settle(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

describe('RealtimeService', () => {
  let live: TestRealtime;
  let fake: FakeConnection;
  let session: boolean;
  let connects: number;
  let reconnects: number;
  let lost: number;

  beforeEach(() => {
    session = true;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: { hasSession: () => session, freshToken: async () => 'token' } }
      ]
    });
    live = TestBed.runInInjectionContext(() => new TestRealtime());
    fake = live.fake;
    connects = reconnects = lost = 0;
    live.connected$.subscribe(() => connects++);
    live.reconnected$.subscribe(() => reconnects++);
    live.closed$.subscribe(() => lost++);
    jasmine.clock().install();
  });

  afterEach(async () => {
    await live.disconnect();
    jasmine.clock().uninstall();
  });

  /** Moves the clock and lets whatever it started finish. */
  async function wait(ms: number): Promise<void> {
    jasmine.clock().tick(ms);
    await settle();
  }

  it('connects, and says so', async () => {
    await live.connect();

    expect(fake.starts).toBe(1);
    expect(live.connected()).toBeTrue();
    expect(connects).toBe(1);
    expect(reconnects).toBe(0);
  });

  it('does not connect when nobody is signed in', async () => {
    session = false;
    await live.connect();

    expect(live.made).toBe(0);
    expect(live.connected()).toBeFalse();
  });

  it('connects with an access token that has run out, as long as it can be renewed', async () => {
    // hasSession() is what decides, not isLoggedIn(): the token is renewed by the connection itself.
    await live.connect();
    expect(fake.starts).toBe(1);
  });

  it('is asked again without making a second connection', async () => {
    await live.connect();
    await live.connect();

    expect(live.made).toBe(1);
    expect(fake.starts).toBe(1);
  });

  it('tries again when the first start fails', async () => {
    fake.outcomes = [false, false, true];
    await live.connect();
    expect(live.connected()).toBeFalse();

    await wait(RETRY_DELAYS_MS[1]);
    expect(fake.starts).toBe(2);
    expect(live.connected()).toBeFalse();

    await wait(RETRY_DELAYS_MS[2]);
    expect(fake.starts).toBe(3);
    expect(live.connected()).toBeTrue();
    expect(connects).toBe(1);
    // It was never up before, so nothing was missed "again".
    expect(reconnects).toBe(0);
  });

  it('never gives up: after many failures it still tries, every half minute', async () => {
    fake.outcomes = Array(40).fill(false);
    await live.connect();
    for (const delay of RETRY_DELAYS_MS.slice(1)) await wait(delay);
    const before = fake.starts;
    expect(before).toBe(RETRY_DELAYS_MS.length);

    const longest = RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    for (let i = 0; i < 20; i++) await wait(longest);
    expect(fake.starts).toBe(before + 20);

    // Ten minutes later the server is back.
    fake.outcomes = [];
    await wait(longest);
    expect(live.connected()).toBeTrue();
  });

  it('comes back by itself after a drop, and says that it was away', async () => {
    await live.connect();
    fake.drop();
    expect(live.connected()).toBeFalse();

    await wait(RETRY_DELAYS_MS[0]);
    expect(fake.starts).toBe(2);
    expect(live.connected()).toBeTrue();
    expect(connects).toBe(2);
    expect(reconnects).toBe(1);
    expect(lost).toBe(0);
  });

  it('keeps trying after a drop for as long as it takes', async () => {
    await live.connect();
    fake.outcomes = Array(30).fill(false);
    fake.drop();
    await wait(0);
    for (let i = 0; i < 25; i++) await wait(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
    expect(live.connected()).toBeFalse();
    expect(fake.starts).toBeGreaterThan(20);

    fake.outcomes = [];
    await wait(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
    expect(live.connected()).toBeTrue();
    expect(reconnects).toBe(1);
  });

  it('tells the app once when a drop lasts, and goes on trying', async () => {
    await live.connect();
    fake.outcomes = Array(30).fill(false);
    fake.drop();

    await wait(LOST_AFTER_MS - 1000);
    expect(lost).toBe(0);
    await wait(1000);
    expect(lost).toBe(1);

    await wait(120_000);
    expect(lost).toBe(1);
    expect(live.connected()).toBeFalse();
  });

  it('does not report a short gap as lost', async () => {
    await live.connect();
    fake.outcomes = [false];
    fake.drop();
    await wait(0);
    await wait(RETRY_DELAYS_MS[1]);
    expect(live.connected()).toBeTrue();

    await wait(LOST_AFTER_MS * 2);
    expect(lost).toBe(0);
  });

  it('tries at once when the network is back, instead of sitting out the wait', async () => {
    await live.connect();
    fake.outcomes = [false, false, false, false, false];
    fake.drop();
    await wait(0);
    for (const delay of RETRY_DELAYS_MS.slice(1, 5)) await wait(delay);
    expect(fake.starts).toBe(6);
    expect(live.connected()).toBeFalse();
    // The next try is half a minute away.

    window.dispatchEvent(new Event('online'));
    await settle();
    expect(fake.starts).toBe(7);
    expect(live.connected()).toBeTrue();

    // The wait that was cut short does not start another connection.
    await wait(60_000);
    expect(fake.starts).toBe(7);
  });

  it('tries at once when the tab is looked at again', async () => {
    fake.outcomes = [false, false];
    await live.connect();
    await wait(RETRY_DELAYS_MS[1]);
    expect(live.connected()).toBeFalse();

    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    // Only when the page is the one being looked at (in a test run it is, unless the window is hidden).
    if (document.visibilityState === 'visible') expect(live.connected()).toBeTrue();
  });

  it('leaves a connection that is up alone when the tab or the network wakes', async () => {
    await live.connect();
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    await settle();

    expect(fake.starts).toBe(1);
    expect(connects).toBe(1);
  });

  it('stops trying after sign-out', async () => {
    fake.outcomes = Array(10).fill(false);
    await live.connect();
    await live.disconnect();
    const starts = fake.starts;

    await wait(120_000);
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(fake.starts).toBe(starts);
    expect(lost).toBe(0);
  });

  it('does not come back after sign-out when the server closes the connection', async () => {
    await live.connect();
    await live.disconnect();
    fake.drop();

    await wait(60_000);
    expect(fake.starts).toBe(1);
    expect(live.connected()).toBeFalse();
  });

  it('passes on what the server pushes', async () => {
    const seen: unknown[] = [];
    live.presenceChanged$.subscribe(event => seen.push(event));
    await live.connect();

    fake.push('presenceChanged', { userId: 'u1', isOnline: false });
    expect(seen).toEqual([{ userId: 'u1', isOnline: false }]);
  });
});
