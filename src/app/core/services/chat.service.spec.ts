import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpTestingController } from '@angular/common/http/testing';
import { Subject } from 'rxjs';

import { AuthService } from './auth.service';
import {
  ChatConversation, ChatService, FRIENDS_RETRY_MS, POLL_WHILE_DOWN_MS, REFRESH_RETRY_MS
} from './chat.service';
import { PresenceEvent, RealtimeService } from './realtime.service';
import { TEST_PROVIDERS } from '../../../testing/test-providers';

const ME = 'me';
const BASIM = 'basim';
const CARIM = 'carim';
const DALIA = 'dalia';

/** A friendship row as GET /api/Friends lists it. */
const friendRow = (friendId: string, friendName: string) => ({
  id: `f-${friendId}`, senderId: ME, receiverId: friendId, status: 'Accepted', createdAt: '2026-11-01T10:00:00Z',
  friendId, friendName
});
const FRIENDS = { friends: [friendRow(CARIM, 'Carim West'), friendRow(BASIM, 'Basim East'), friendRow(DALIA, 'Dalia Noor')] };

/** A chat with messages between the user and a friend. */
const chatWith = (friendId: string, fullName: string, isOnline = false): ChatConversation => ({
  id: `c-${friendId}`, friend: { id: friendId, fullName, isOnline }, unreadCount: 0, canSend: true,
  lastMessageAt: '2026-11-13T10:00:00Z', isGroup: false
});

/** Stands in for the live connection: up or down, and the events the server pushes. */
function fakeLive() {
  const subjects: Record<string, Subject<unknown>> = {};
  const fixed: Record<string, unknown> = { connected: signal(false) };
  return new Proxy(fixed, {
    get(target, name) {
      if (typeof name !== 'string') return undefined;
      if (name in target) return target[name];
      // Every "something$" the service listens to exists.
      if (name.endsWith('$')) return (subjects[name] ??= new Subject<unknown>());
      return undefined;
    }
  }) as unknown as {
    connected: ReturnType<typeof signal<boolean>>;
    connected$: Subject<void>;
    presenceChanged$: Subject<PresenceEvent>;
  };
}

describe('ChatService: friends who are offline, and a server that does not answer', () => {
  let chat: ChatService;
  let http: HttpTestingController;
  let live: ReturnType<typeof fakeLive>;

  const get = (path: string) => (request: { method: string; url: string }) =>
    request.method === 'GET' && request.url.endsWith(path);
  const chats = () => http.expectOne(get('/api/Chat'));
  const online = () => http.expectOne(get('/api/Chat/online'));
  const friends = () => http.expectOne(get('/api/Friends'));
  const down = { status: 503, statusText: 'Service Unavailable' };

  /** Answers the first reading: the chats, who is online, and the friends asked for once the chat is there. */
  function answerStart(conversations: ChatConversation[], onlineIds: string[], friendList: object = FRIENDS): void {
    chats().flush(conversations);
    online().flush(onlineIds);
    friends().flush(friendList);
  }

  /** The chats did not arrive: the reading is over, and its other request with it. */
  function failStart(error = down): void {
    chats().flush(null, error);
    expect(online().cancelled).toBeTrue();
  }

  beforeEach(() => {
    live = fakeLive();
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        { provide: AuthService, useValue: { getCurrentUserId: () => ME } },
        { provide: RealtimeService, useValue: live }
      ]
    });
    localStorage.removeItem(`miqat.chat.heads.${ME}`);
    jasmine.clock().install();
    chat = TestBed.inject(ChatService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    chat.stop();
    jasmine.clock().uninstall();
    http.verify();
    localStorage.removeItem(`miqat.chat.heads.${ME}`);
  });

  // ── Everyone is listed, online or not ───────────────────────────────────────

  it('lists every friend when none of them is online', () => {
    chat.start();
    answerStart([], []);

    expect(chat.friendsState()).toBe('ready');
    expect(chat.friends().map(f => f.fullName)).toEqual(['Basim East', 'Carim West', 'Dalia Noor']);
    expect(chat.friends().some(f => chat.isOnline(f.id))).toBeFalse();
    // Group chats are probed for when there is no chat to look at.
    http.expectOne(get('/api/Call/active')).flush([]);
  });

  it('keeps a friend and the chat with them listed when they go offline', () => {
    chat.start();
    answerStart([chatWith(BASIM, 'Basim East', true)], [BASIM, CARIM]);
    expect(chat.isOnline(BASIM)).toBeTrue();
    expect(chat.isOnline(CARIM)).toBeTrue();

    live.presenceChanged$.next({ userId: BASIM, isOnline: false });
    live.presenceChanged$.next({ userId: CARIM, isOnline: false });

    expect(chat.isOnline(BASIM)).toBeFalse();
    expect(chat.isOnline(CARIM)).toBeFalse();
    expect(chat.friends().map(f => f.id)).toEqual([BASIM, CARIM, DALIA]);
    expect(chat.conversations().map(c => c.friend.id)).toEqual([BASIM]);
    expect(chat.conversation(`c-${BASIM}`)?.canSend).toBeTrue();
  });

  it('opens a chat with a friend who is offline', () => {
    chat.start();
    answerStart([chatWith(BASIM, 'Basim East')], []);

    let opened: ChatConversation | undefined;
    chat.openWith(CARIM).subscribe(conversation => (opened = conversation));
    http.expectOne(request => request.method === 'POST' && request.url.endsWith(`/api/Chat/with/${CARIM}`))
      .flush({ id: 'c-new', friend: { id: CARIM, fullName: 'Carim West', isOnline: false }, unreadCount: 0, canSend: true, isGroup: false });
    http.expectOne(get('/api/Chat/c-new/messages')).flush({ messages: [], hasMore: false });

    expect(opened?.id).toBe('c-new');
    expect(chat.isOpen('c-new')).toBeTrue();
    expect(chat.conversation('c-new')?.canSend).toBeTrue();
    expect(chat.isOnline(CARIM)).toBeFalse();
  });

  // ── The first answer does not arrive ────────────────────────────────────────

  it('does not hide the chat for the whole visit when the server fails once at the start', () => {
    chat.start();
    failStart();
    expect(chat.available()).toBeNull();

    jasmine.clock().tick(REFRESH_RETRY_MS[0]);
    answerStart([chatWith(BASIM, 'Basim East')], []);

    expect(chat.available()).toBeTrue();
    expect(chat.conversations().length).toBe(1);
  });

  it('keeps asking, with longer waits, until the server answers', () => {
    chat.start();
    for (const wait of [...REFRESH_RETRY_MS, REFRESH_RETRY_MS[REFRESH_RETRY_MS.length - 1]]) {
      failStart();
      expect(chat.available()).toBeNull();
      jasmine.clock().tick(wait - 1);
      http.expectNone(get('/api/Chat'));
      jasmine.clock().tick(1);
    }
    answerStart([], [BASIM]);

    expect(chat.available()).toBeTrue();
    expect(chat.isOnline(BASIM)).toBeTrue();
    http.expectOne(get('/api/Call/active')).flush([]);
  });

  it('hides the chat on a server that has none (404), and does not ask again', () => {
    chat.start();
    failStart({ status: 404, statusText: 'Not Found' });

    expect(chat.available()).toBeFalse();
    jasmine.clock().tick(10 * POLL_WHILE_DOWN_MS);
    http.expectNone(get('/api/Chat'));
  });

  it('lists the chats when only "who is online" fails', () => {
    chat.start();
    chats().flush([chatWith(BASIM, 'Basim East', true), chatWith(CARIM, 'Carim West')]);
    online().flush(null, down);
    friends().flush(FRIENDS);

    expect(chat.available()).toBeTrue();
    expect(chat.conversations().length).toBe(2);
    // The chat itself says Basim is online.
    expect(chat.isOnline(BASIM)).toBeTrue();
    expect(chat.isOnline(CARIM)).toBeFalse();
  });

  // ── Who is online stays right ───────────────────────────────────────────────

  it('reads the lists again when the live connection comes up', () => {
    chat.start();
    answerStart([chatWith(BASIM, 'Basim East')], []);
    expect(chat.isOnline(BASIM)).toBeFalse();

    // Basim opened the app between that answer and the moment this page was connected: nothing was pushed.
    live.connected.set(true);
    live.connected$.next();
    chats().flush([chatWith(BASIM, 'Basim East', true)]);
    online().flush([BASIM]);

    expect(chat.isOnline(BASIM)).toBeTrue();
  });

  it('lets what is pushed win over an answer that was written before it', () => {
    chat.start();
    const chatsRequest = chats();
    const onlineRequest = online();

    // The server wrote "nobody is online", then Basim connected and the server pushed it;
    // the push overtakes the answer.
    live.presenceChanged$.next({ userId: BASIM, isOnline: true });
    chatsRequest.flush([chatWith(BASIM, 'Basim East')]);
    onlineRequest.flush([]);
    friends().flush(FRIENDS);

    expect(chat.isOnline(BASIM)).toBeTrue();
  });

  it('and the other way round: someone who left while the answer was on its way is offline', () => {
    chat.start();
    const chatsRequest = chats();
    const onlineRequest = online();

    live.presenceChanged$.next({ userId: BASIM, isOnline: false });
    chatsRequest.flush([chatWith(BASIM, 'Basim East', true)]);
    onlineRequest.flush([BASIM]);
    friends().flush(FRIENDS);

    expect(chat.isOnline(BASIM)).toBeFalse();
    expect(chat.conversations().length).toBe(1);
  });

  it('asks the server every half minute while the live connection is down, and not while it is up', () => {
    chat.start();
    answerStart([chatWith(BASIM, 'Basim East')], []);

    // Down: Basim comes online and writes; nothing is pushed here.
    jasmine.clock().tick(POLL_WHILE_DOWN_MS);
    chats().flush([{ ...chatWith(BASIM, 'Basim East', true), unreadCount: 2 }]);
    online().flush([BASIM]);
    expect(chat.isOnline(BASIM)).toBeTrue();
    expect(chat.unreadTotal()).toBe(2);

    // Up: what happens is pushed, so nothing is asked.
    live.connected.set(true);
    jasmine.clock().tick(5 * POLL_WHILE_DOWN_MS);
    http.expectNone(get('/api/Chat'));

    // Down again.
    live.connected.set(false);
    jasmine.clock().tick(POLL_WHILE_DOWN_MS);
    chats().flush([chatWith(BASIM, 'Basim East')]);
    online().flush([]);
    expect(chat.isOnline(BASIM)).toBeFalse();
    expect(chat.conversations().length).toBe(1);
  });

  it('reads once more when the connection comes up while a reading is on its way', () => {
    chat.start();
    const first = chats();
    const firstOnline = online();
    live.connected.set(true);
    live.connected$.next();

    first.flush([]);
    firstOnline.flush([]);
    friends().flush(FRIENDS);
    http.expectOne(get('/api/Call/active')).flush([]);

    // The reading that was asked before the connection was up is followed by one asked after.
    chats().flush([]);
    online().flush([CARIM]);
    expect(chat.isOnline(CARIM)).toBeTrue();
  });

  // ── The friends do not arrive ───────────────────────────────────────────────

  it('asks for the friends again by itself, then says they could not be loaded', () => {
    chat.start();
    chats().flush([chatWith(BASIM, 'Basim East')]);
    online().flush([]);
    expect(chat.friendsState()).toBe('loading');

    friends().flush(null, down);
    for (const wait of FRIENDS_RETRY_MS) {
      expect(chat.friendsState()).toBe('loading');
      jasmine.clock().tick(wait);
      friends().flush(null, down);
    }
    // Not "no friends": the list did not arrive.
    expect(chat.friendsState()).toBe('failed');
    expect(chat.friends()).toEqual([]);

    // "Try again".
    chat.loadFriends();
    expect(chat.friendsState()).toBe('loading');
    friends().flush(FRIENDS);
    expect(chat.friendsState()).toBe('ready');
    expect(chat.friends().length).toBe(3);
  });

  it('keeps the friends it has when a later reading of them fails', () => {
    chat.start();
    answerStart([chatWith(BASIM, 'Basim East')], []);
    expect(chat.friends().length).toBe(3);

    chat.loadFriends();
    friends().flush(null, down);
    for (const wait of FRIENDS_RETRY_MS) {
      jasmine.clock().tick(wait);
      friends().flush(null, down);
    }

    expect(chat.friendsState()).toBe('ready');
    expect(chat.friends().length).toBe(3);
  });

  it('forgets everything at sign-out, and an answer that arrives afterwards changes nothing', () => {
    chat.start();
    const late = chats();
    const lateOnline = online();
    chat.stop();

    late.flush([chatWith(BASIM, 'Basim East', true)]);
    lateOnline.flush([BASIM]);

    expect(chat.available()).toBeNull();
    expect(chat.conversations()).toEqual([]);
    expect(chat.isOnline(BASIM)).toBeFalse();
    jasmine.clock().tick(10 * POLL_WHILE_DOWN_MS);
    http.expectNone(get('/api/Chat'));
  });
});
