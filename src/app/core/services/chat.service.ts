import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, Subscription, forkJoin, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { t } from '../i18n/i18n';
import { AuthService } from './auth.service';
import { FriendService } from './friend.service';
import {
  ChatGroupEvent, ChatMessageEvent, ChatParticipant, GroupCall, GroupCallMemberEvent, PresenceEvent, RealtimeService
} from './realtime.service';
import { applyCallMembers, applyGroupChange, applyRead, typingLabel } from './chat-text';

export interface ChatPerson {
  id: string;
  fullName: string;
  profilePictureUrl?: string | null;
  isOnline?: boolean;
}

export interface ChatMessage extends ChatMessageEvent {
  /** Only on messages this tab is still sending, or could not send. */
  state?: 'sending' | 'failed';
}

export interface ChatConversation {
  id: string;
  /** The other person of a chat between two. For a group: a stand-in that carries the group's id and name. */
  friend: ChatPerson;
  lastMessage?: ChatMessage | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  /** The friend has read everything sent up to this moment. Null for a group: see `participants`. */
  friendLastReadAt?: string | null;
  /** False once the two are no longer friends, or the user is no longer in the group: readable, but closed. */
  canSend: boolean;

  // The fields below are absent on an API build without group chats.
  isGroup?: boolean;
  /** The group's name; null for a chat between two. */
  name?: string | null;
  createdByUserId?: string | null;
  /** The user is an admin of this group. */
  isAdmin?: boolean;
  /** Everyone in the chat, the user too, longest in it first. */
  participants?: ChatParticipant[];
  /** The group call going on right now. */
  activeCall?: GroupCall | null;
}

/** The messages of one chat that are loaded so far, oldest first. */
export interface ChatThread {
  messages: ChatMessage[];
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
}

interface MessagePage { messages: ChatMessage[]; hasMore: boolean; }

const EMPTY_THREAD: ChatThread = { messages: [], hasMore: false, loading: false, loaded: false };
const PAGE_SIZE = 30;
/** How long "is typing" stays up after the last signal, and how often this tab sends one. */
const TYPING_SHOWN_MS = 4000;
const TYPING_SENT_EVERY_MS = 2500;
/** How long a new message is shown beside its bubble. */
const PEEK_SHOWN_MS = 6000;
/** Chat windows side by side: two on a desktop, one on anything narrower. */
const WIDE_SCREEN_PX = 1280;
const MAX_HEADS = 6;
/** While the live connection is down, the chats and who is online are read from the server this often instead. */
export const POLL_WHILE_DOWN_MS = 30_000;
/** Waits before asking again for the chats when the server did not answer; the last one repeats. */
export const REFRESH_RETRY_MS = [2000, 5000, 10_000, 30_000];
/** Waits before asking again for the friends; after the last one the list says it could not be loaded. */
export const FRIENDS_RETRY_MS = [2000, 5000];

/** Where the list of friends stands: not asked yet, on its way, there, or it could not be loaded. */
export type FriendsState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Chats between friends and in groups: the list, the messages, what is unread,
 * who is online, and which chats are docked on the screen as bubbles or open windows.
 *
 * One instance for the whole app, so every piece of chat UI shows the same
 * state. Everything listed is read from the server with plain requests; the
 * live connection then keeps it current. While that connection is down, the
 * lists are simply read again every half minute, and once more the moment it
 * is back, so nothing here depends on it being up.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private realtime = inject(RealtimeService);
  private friendService = inject(FriendService);
  private apiUrl = `${environment.apiUrl}/api/Chat`;

  private subscriptions: Subscription[] = [];
  /** One timer per person typing, under "chat id|person id". */
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private typingSentAt = new Map<string, number>();
  private peekTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Chats being asked for, with what to do once each is there. */
  private fetching = new Map<string, Array<(conversation: ChatConversation) => void>>();
  private groupsProbed = false;
  private me: string | null = null;
  /** Counts the sign-ins this service has served: an answer that arrives for an earlier one is dropped. */
  private session = 0;

  private refreshing = false;
  /** Something happened while the chats were being read: read them once more afterwards. */
  private refreshQueued = false;
  private refreshFailures = 0;
  private refreshRetry?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setInterval>;
  /** Readings of "who is online" on their way, and what was pushed about it since the oldest of them was asked. */
  private onlineReadings = 0;
  private presenceMeanwhile: PresenceEvent[] = [];
  private friendsFailures = 0;
  private friendsRetry?: ReturnType<typeof setTimeout>;

  /** Null until the server was asked; false on an API build without chat (the UI then hides itself). */
  readonly available = signal<boolean | null>(null);
  /** True when this server has group chats and group calls. Everything about groups is hidden otherwise. */
  readonly groupsAvailable = signal(false);
  private readonly allConversations = signal<ChatConversation[]>([]);
  private readonly threads = signal<Readonly<Record<string, ChatThread>>>({});
  private readonly onlineIds = signal<ReadonlySet<string>>(new Set());
  /** Who is typing right now, per chat. */
  private readonly typingUsers = signal<Readonly<Record<string, readonly string[]>>>({});
  private readonly peekIds = signal<ReadonlySet<string>>(new Set());

  /**
   * The user's friends, for starting a chat or a group with them: all of them,
   * whether they have the app open or not. Filled by loadFriends().
   */
  readonly friends = signal<ChatPerson[]>([]);
  /** So a list can tell "no friends" from "still loading" and "could not be loaded". */
  readonly friendsState = signal<FriendsState>('idle');
  /** The "New group" dialog is open (the chat corner draws it, on every page). */
  readonly creatingGroup = signal(false);

  /** Chats docked on the screen as bubbles, newest first. */
  readonly heads = signal<string[]>([]);
  /** The docked chats whose window is open. */
  readonly openIds = signal<string[]>([]);

  /** Chats that have messages, newest first: what the chat list shows. */
  readonly conversations = computed(() =>
    this.allConversations()
      .filter(c => !!c.lastMessageAt)
      .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')));

  /** The group chats the user is in, newest first. */
  readonly groups = computed(() => this.conversations().filter(c => c.isGroup));

  readonly unreadTotal = computed(() => this.allConversations().reduce((sum, c) => sum + c.unreadCount, 0));
  readonly headConversations = computed(() => this.pick(this.heads()));
  readonly openConversations = computed(() => this.pick(this.openIds()));

  /**
   * True when this server has chat: its round button then sits on the screen's
   * bottom corner on every page, and panels that end in that corner leave room for it.
   */
  readonly cornerInUse = computed(() => this.available() === true);

  get currentUserId(): string | null { return this.me; }

  // ── Start and stop ──────────────────────────────────────────────────────────

  /** Called when the signed-in layout appears. Safe to call again. */
  start(): void {
    if (this.subscriptions.length) return;
    this.me = this.auth.getCurrentUserId();
    this.session++;

    this.subscriptions = [
      this.realtime.chatMessage$.subscribe(m => this.onMessage(m)),
      this.realtime.chatMessageChanged$.subscribe(m => this.onMessageChanged(m)),
      this.realtime.chatRead$.subscribe(e => this.onRead(e.conversationId, e.userId, e.readAt)),
      this.realtime.chatTyping$.subscribe(e => this.showTyping(e.conversationId, e.userId)),
      this.realtime.presenceChanged$.subscribe(e => this.onPresence(e)),
      this.realtime.chatGroupChanged$.subscribe(e => this.onGroupChanged(e)),
      this.realtime.chatGroupRemoved$.subscribe(e => this.dropConversation(e.conversationId)),
      this.realtime.groupCallStarted$.subscribe(call => this.patchConversation(call.conversationId, c => ({ ...c, activeCall: call }))),
      this.realtime.groupCallJoined$.subscribe(e => this.onCallMembers(e)),
      this.realtime.groupCallLeft$.subscribe(e => this.onCallMembers(e)),
      this.realtime.groupCallEnded$.subscribe(e => this.patchConversation(e.conversationId,
        c => (c.activeCall?.callId === e.callId ? { ...c, activeCall: null } : c))),
      // The connection is up, for the first time or again. Whatever was pushed
      // before that moment was missed (at the start: someone who came online
      // after the first answer was written), so the lists are read once more.
      this.realtime.connected$.subscribe(() => this.refresh())
    ];

    this.refresh();
    // Without the live connection nothing is pushed: ask instead, while the page is looked at.
    this.pollTimer = setInterval(() => {
      const looking = typeof document === 'undefined' || document.visibilityState === 'visible';
      // Not while a reading that failed is waiting for its next try: that wait is deliberate.
      const waiting = this.refreshRetry !== undefined;
      if (looking && !waiting && !this.realtime.connected() && this.available() !== false) this.refresh();
    }, POLL_WHILE_DOWN_MS);
  }

  /** Called on leaving the signed-in layout (sign-out): nothing of one account may reach the next. */
  stop(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.subscriptions = [];
    this.typingTimers.forEach(clearTimeout);
    this.typingTimers.clear();
    this.typingSentAt.clear();
    this.peekTimers.forEach(clearTimeout);
    this.peekTimers.clear();
    this.fetching.clear();
    this.groupsProbed = false;
    this.me = null;
    this.session++;
    this.refreshing = false;
    this.refreshQueued = false;
    this.refreshFailures = 0;
    clearTimeout(this.refreshRetry);
    this.refreshRetry = undefined;
    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    this.onlineReadings = 0;
    this.presenceMeanwhile = [];
    this.friendsFailures = 0;
    clearTimeout(this.friendsRetry);
    this.friendsRetry = undefined;

    this.available.set(null);
    this.groupsAvailable.set(false);
    this.allConversations.set([]);
    this.threads.set({});
    this.onlineIds.set(new Set());
    this.typingUsers.set({});
    this.peekIds.set(new Set());
    this.friends.set([]);
    this.friendsState.set('idle');
    this.creatingGroup.set(false);
    this.heads.set([]);
    this.openIds.set([]);
  }

  /**
   * Reads the chats and who is online from the server. Called at the start, each
   * time the live connection comes up, and every half minute while it is down.
   */
  private refresh(): void {
    if (this.refreshing) {
      this.refreshQueued = true;
      return;
    }

    const session = this.session;
    this.refreshing = true;
    this.refreshQueued = false;
    clearTimeout(this.refreshRetry);
    this.refreshRetry = undefined;
    const since = this.beginOnlineReading();

    forkJoin({
      conversations: this.http.get<ChatConversation[]>(this.apiUrl),
      // On its own feet: if only this one fails, the chats are still listed and
      // the people in them are as online as the chats say.
      online: this.http.get<string[]>(`${this.apiUrl}/online`).pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ conversations, online }) => {
        if (session !== this.session) return;
        this.refreshing = false;
        this.refreshFailures = 0;

        const firstLoad = this.available() !== true;
        // Chats opened here that have no message yet are not in the server's list; keep them.
        const listed = new Set(conversations.map(c => c.id));
        const local = this.allConversations().filter(c => !listed.has(c.id) && !c.lastMessageAt);

        this.allConversations.set([...conversations, ...local]);
        const ids = new Set([...(online ?? this.onlineIds()), ...conversations.flatMap(onlineIn)]);
        this.endOnlineReading(since, ids);
        this.onlineIds.set(ids);
        this.available.set(true);
        this.probeGroups(conversations);

        // A group the user was taken out of while the connection was down is gone from the list.
        const known = new Set(this.allConversations().map(c => c.id));
        this.heads.update(ids => ids.filter(id => firstLoad || known.has(id)));
        this.openIds.update(ids => ids.filter(id => known.has(id)));

        if (firstLoad) {
          this.restoreHeads();
          // So the chat list has the friends before it is opened for the first time.
          if (this.friendsState() === 'idle') this.loadFriends();
        }
        this.openIds().forEach(id => this.loadMessages(id, true));

        if (this.refreshQueued) this.refresh();
      },
      error: (err: HttpErrorResponse) => {
        if (session !== this.session) return;
        this.refreshing = false;
        this.endOnlineReading(since);

        // 404 is an API build without chat: the chat stays hidden.
        if (err?.status === 404) {
          if (this.available() === null) this.available.set(false);
          return;
        }

        // Anything else is a server that is waking up or a gap in the network,
        // not a reason to take the chat (and everyone in it) off the screen for
        // the rest of the visit: ask again, a little later each time.
        const wait = REFRESH_RETRY_MS[Math.min(this.refreshFailures++, REFRESH_RETRY_MS.length - 1)];
        this.refreshRetry = setTimeout(() => {
          this.refreshRetry = undefined;
          this.refresh();
        }, wait);
      }
    });
  }

  /**
   * A reading of "who is online" is on its way. What is pushed from now on is
   * newer than its answer will be, so it is remembered and wins over the answer.
   */
  private beginOnlineReading(): number {
    this.onlineReadings++;
    return this.presenceMeanwhile.length;
  }

  private endOnlineReading(since: number, ids?: Set<string>): void {
    if (ids) {
      this.presenceMeanwhile.slice(since).forEach(e => (e.isOnline ? ids.add(e.userId) : ids.delete(e.userId)));
    }
    if (--this.onlineReadings <= 0) {
      this.onlineReadings = 0;
      this.presenceMeanwhile = [];
    }
  }

  private onPresence(event: PresenceEvent): void {
    if (this.onlineReadings > 0) this.presenceMeanwhile.push(event);
    this.setOnline(event.userId, event.isOnline);
  }

  /**
   * Asks once whether this server has group chats. Every chat of a build that
   * has them says whether it is one; with no chat to look at, the list of group
   * calls is asked for, which only such a build answers.
   */
  private probeGroups(conversations: ChatConversation[]): void {
    if (this.groupsProbed) return;
    this.groupsProbed = true;

    if (conversations.length) {
      this.groupsAvailable.set(conversations[0].isGroup !== undefined);
      return;
    }

    const me = this.me;
    this.http.get<GroupCall[]>(`${environment.apiUrl}/api/Call/active`).subscribe({
      next: () => { if (me && me === this.me) this.groupsAvailable.set(true); },
      error: () => { /* a build without groups: their controls stay hidden */ }
    });
  }

  /**
   * Loads the user's friends, for the lists that start a chat or fill a group.
   * Every friend is listed: being offline never takes anyone off these lists.
   *
   * A failure is tried again twice by itself. The friends already listed stay
   * listed meanwhile; with none listed, the state says the list could not be
   * loaded so the screen does not claim the user has no friends.
   */
  loadFriends(): void {
    const session = this.session;
    const me = this.me;
    clearTimeout(this.friendsRetry);
    this.friendsRetry = undefined;
    if (this.friendsState() !== 'ready') this.friendsState.set('loading');

    this.friendService.getMyFriends().subscribe({
      next: rows => {
        if (session !== this.session) return;
        this.friendsFailures = 0;
        this.friends.set(rows.map(row => {
          const friendIsSender = row.senderId !== me;
          return {
            id: row.friendId ?? (friendIsSender ? row.senderId : row.receiverId),
            fullName: row.friendName ?? (friendIsSender ? row.senderName : row.receiverName) ?? t('Friend'),
            profilePictureUrl: row.friendProfilePictureUrl ??
              (friendIsSender ? row.senderProfilePictureUrl : row.receiverProfilePictureUrl)
          };
        }).sort((a, b) => a.fullName.localeCompare(b.fullName)));
        this.friendsState.set('ready');
      },
      error: () => {
        if (session !== this.session) return;

        if (this.friendsFailures < FRIENDS_RETRY_MS.length) {
          this.friendsRetry = setTimeout(() => {
            this.friendsRetry = undefined;
            this.loadFriends();
          }, FRIENDS_RETRY_MS[this.friendsFailures++]);
          return;
        }

        this.friendsFailures = 0;
        if (this.friendsState() !== 'ready') this.friendsState.set('failed');
      }
    });
  }

  // ── Reading state ───────────────────────────────────────────────────────────

  conversation(id: string): ChatConversation | undefined {
    return this.allConversations().find(c => c.id === id);
  }

  thread(id: string): ChatThread {
    return this.threads()[id] ?? EMPTY_THREAD;
  }

  isOnline(userId: string): boolean { return this.onlineIds().has(userId); }
  isTyping(conversationId: string): boolean { return !!this.typingUsers()[conversationId]?.length; }
  isOpen(conversationId: string): boolean { return this.openIds().includes(conversationId); }
  /** A message just arrived for this bubble: its text is shown beside it for a moment. */
  isPeeking(conversationId: string): boolean { return this.peekIds().has(conversationId); }

  /** "typing…" for a friend; for a group who it is ("Omar is typing…", "2 people are typing…"). Empty when nobody is. */
  typingText(conversationId: string): string {
    const ids = this.typingUsers()[conversationId] ?? [];
    if (!ids.length) return '';

    const conversation = this.conversation(conversationId);
    if (!conversation?.isGroup) return t('typing…');
    return typingLabel(ids.map(id => conversation.participants?.find(p => p.id === id)?.fullName ?? ''));
  }

  // ── Bubbles and windows ─────────────────────────────────────────────────────

  /** Opens the chat with a friend, creating it on the first time. */
  openWith(friendId: string): Observable<ChatConversation> {
    const known = this.allConversations().find(c => !c.isGroup && c.friend.id === friendId);
    if (known) {
      this.open(known.id);
      return of(known);
    }

    return this.http.post<ChatConversation>(`${this.apiUrl}/with/${friendId}`, {}).pipe(
      tap(conversation => {
        this.upsertConversation(conversation);
        this.open(conversation.id);
      }));
  }

  /** Shows a chat as an open window (and as a bubble). The oldest window makes room on a narrow screen. */
  open(id: string): void {
    this.addHead(id);

    const maxOpen = typeof window !== 'undefined' && window.innerWidth >= WIDE_SCREEN_PX ? 2 : 1;
    this.openIds.update(ids => [...ids.filter(x => x !== id), id].slice(-maxOpen));

    if (!this.thread(id).loaded) this.loadMessages(id);
    this.markRead(id);
    this.hidePeek(id);
  }

  /** Back to a bubble. */
  minimise(id: string): void {
    this.openIds.update(ids => ids.filter(x => x !== id));
  }

  toggle(id: string): void {
    this.isOpen(id) ? this.minimise(id) : this.open(id);
  }

  /** Takes the bubble off the screen. The chat itself stays in the list. */
  close(id: string): void {
    this.minimise(id);
    this.heads.update(ids => ids.filter(x => x !== id));
    this.saveHeads();
  }

  private addHead(id: string): void {
    if (this.heads().includes(id)) return;

    // The newest bubble is on top; the oldest closed one drops off when there are too many.
    const heads = [id, ...this.heads()];
    while (heads.length > MAX_HEADS) {
      const index = heads.map(h => this.isOpen(h)).lastIndexOf(false);
      heads.splice(index < 1 ? heads.length - 1 : index, 1);
    }
    this.heads.set(heads);
    this.saveHeads();
  }

  // ── Groups ──────────────────────────────────────────────────────────────────

  /** Creates a group with these friends and opens its chat. The server's refusal is the error. */
  createGroup(name: string, memberIds: string[]): Observable<ChatConversation> {
    return this.http.post<ChatConversation>(`${this.apiUrl}/groups`, { name: name.trim(), memberIds }).pipe(
      tap(conversation => {
        this.upsertConversation(conversation);
        this.open(conversation.id);
      }));
  }

  /** Admins only. */
  renameGroup(id: string, name: string): Observable<ChatConversation> {
    return this.http.put<ChatConversation>(`${this.apiUrl}/${id}/name`, { name: name.trim() })
      .pipe(tap(conversation => this.upsertConversation(conversation)));
  }

  /** Any member adds their own friends. */
  addMembers(id: string, userIds: string[]): Observable<ChatConversation> {
    return this.http.post<ChatConversation>(`${this.apiUrl}/${id}/members`, { userIds })
      .pipe(tap(conversation => this.upsertConversation(conversation)));
  }

  /** Admins only. */
  removeMember(id: string, userId: string): Observable<ChatConversation> {
    return this.http.delete<ChatConversation>(`${this.apiUrl}/${id}/members/${userId}`)
      .pipe(tap(conversation => this.upsertConversation(conversation)));
  }

  /** Admins only. */
  makeAdmin(id: string, userId: string): Observable<ChatConversation> {
    return this.http.put<ChatConversation>(`${this.apiUrl}/${id}/members/${userId}/admin`, {})
      .pipe(tap(conversation => this.upsertConversation(conversation)));
  }

  /** The chat disappears here at once; the others see a line saying the user left. */
  leaveGroup(id: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${id}/leave`, {}).pipe(tap(() => this.dropConversation(id)));
  }

  // ── Messages ────────────────────────────────────────────────────────────────

  /** Loads the newest page of a chat. `quiet` keeps what is shown until the answer is there. */
  loadMessages(id: string, quiet = false): void {
    if (this.thread(id).loading) return;
    if (!quiet) this.patchThread(id, t => ({ ...t, loading: true }));

    this.fetchPage(id).subscribe(page => {
      if (!page) return this.patchThread(id, t => ({ ...t, loading: false }));

      // Messages still being sent from this tab are not in the answer yet.
      const unsent = this.thread(id).messages.filter(m => m.state);
      this.patchThread(id, () => ({
        messages: [...page.messages, ...unsent], hasMore: page.hasMore, loading: false, loaded: true
      }));
    });
  }

  /** Loads the page before the oldest message shown. Answers how many were added. */
  loadOlder(id: string): Observable<number> {
    const thread = this.thread(id);
    const oldest = thread.messages.find(m => !m.state);
    if (!thread.hasMore || thread.loading || !oldest) return of(0);

    this.patchThread(id, t => ({ ...t, loading: true }));
    return this.fetchPage(id, oldest.id).pipe(
      map(page => {
        this.patchThread(id, t => ({
          ...t,
          messages: [...(page?.messages ?? []), ...t.messages],
          hasMore: page ? page.hasMore : t.hasMore,
          loading: false
        }));
        return page?.messages.length ?? 0;
      }));
  }

  private fetchPage(id: string, before?: string): Observable<MessagePage | null> {
    const params: Record<string, string> = { limit: String(PAGE_SIZE) };
    if (before) params['before'] = before;

    return this.http.get<MessagePage>(`${this.apiUrl}/${id}/messages`, { params })
      .pipe(catchError(() => of(null)));
  }

  /**
   * Sends a message. It is shown at once and confirmed when the server answers
   * (or when its live event arrives, whichever is first).
   */
  send(conversationId: string, text: string): void {
    const body = text.trim();
    if (!body || !this.me) return;

    const clientId = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const local: ChatMessage = {
      id: clientId, conversationId, senderId: this.me, body, clientId,
      createdAt: new Date().toISOString(), state: 'sending'
    };
    this.patchThread(conversationId, t => ({ ...t, messages: [...t.messages, local] }));
    // The message ends "is typing" at the others; the next key says it again without waiting.
    this.typingSentAt.delete(conversationId);

    this.http.post<ChatMessage>(`${this.apiUrl}/${conversationId}/messages`, { body, clientId }).subscribe({
      next: saved => this.onMessage({ ...saved, clientId }),
      error: (err: HttpErrorResponse) => {
        this.replaceMessage(conversationId, clientId, m => ({ ...m, state: 'failed' }));
        // 403: they stopped being friends, or the user was taken out of the group, while the window was open.
        if (err.status === 403) this.patchConversation(conversationId, c => ({ ...c, canSend: false }));
      }
    });
  }

  /** Sends a message again that could not be sent. */
  retry(message: ChatMessage): void {
    this.patchThread(message.conversationId, t => ({ ...t, messages: t.messages.filter(m => m.id !== message.id) }));
    this.send(message.conversationId, message.body);
  }

  edit(message: ChatMessage, text: string): Observable<ChatMessage> {
    return this.http.put<ChatMessage>(`${this.apiUrl}/messages/${message.id}`, { body: text.trim() })
      .pipe(tap(saved => this.onMessageChanged(saved)));
  }

  remove(message: ChatMessage): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/messages/${message.id}`)
      .pipe(tap(() => this.onMessageChanged({ ...message, body: '', isDeleted: true })));
  }

  /** Marks a chat as read: here at once, on the server for the friend's "Seen". */
  markRead(id: string): void {
    const conversation = this.conversation(id);
    if (!conversation || conversation.unreadCount === 0) return;

    this.patchConversation(id, c => ({ ...c, unreadCount: 0 }));
    this.http.put(`${this.apiUrl}/${id}/read`, {}).subscribe({ error: () => { /* the next load corrects it */ } });
  }

  /** Call while the user types; the friend is told at most every few seconds. */
  typing(conversationId: string): void {
    const now = Date.now();
    if (now - (this.typingSentAt.get(conversationId) ?? 0) < TYPING_SENT_EVERY_MS) return;

    this.typingSentAt.set(conversationId, now);
    this.realtime.sendTyping(conversationId);
  }

  // ── Live events ─────────────────────────────────────────────────────────────

  private onMessage(message: ChatMessage): void {
    const id = message.conversationId;
    const mine = message.senderId === this.me;
    if (!mine) this.hideTyping(id, message.senderId);

    // The copy shown while sending (same clientId) or the same message arriving twice is replaced.
    this.patchThread(id, t => {
      if (!t.loaded && !t.messages.length) return t;
      const index = t.messages.findIndex(m => m.id === message.id || (!!message.clientId && m.id === message.clientId));
      const messages = index < 0
        ? [...t.messages, message]
        : t.messages.map((m, i) => (i === index ? message : m));
      return { ...t, messages };
    });

    const conversation = this.conversation(id);
    if (!conversation) {
      // A friend wrote for the first time, or the user was put into a group:
      // the server knows the chat, this tab does not yet.
      this.fetchConversation(id, () => { if (!mine) this.addHead(id); });
      return;
    }

    const alreadyCounted = conversation.lastMessage?.id === message.id;
    const reading = this.isOpen(id) && typeof document !== 'undefined' && document.visibilityState === 'visible';
    // The record of a group call is already read for whoever took part; only the server knows who did.
    const groupCall = !!message.callOutcome && message.callParticipants != null;
    this.patchConversation(id, c => ({
      ...c,
      lastMessage: message,
      lastMessageAt: message.createdAt,
      unreadCount: mine || reading || alreadyCounted || groupCall ? c.unreadCount : c.unreadCount + 1
    }));

    if (mine) return;
    if (reading) {
      this.http.put(`${this.apiUrl}/${id}/read`, {}).subscribe({ error: () => { /* next load corrects it */ } });
    } else if (groupCall) {
      this.http.get<ChatConversation>(`${this.apiUrl}/${id}`).subscribe({
        next: fetched => {
          this.patchConversation(id, c => ({ ...c, unreadCount: fetched.unreadCount }));
          if (fetched.unreadCount) this.addHead(id);
        },
        error: () => { /* the next load corrects it */ }
      });
    } else {
      // The chat pops up as a bubble, like a messenger chat head, with the message beside it for a moment.
      this.addHead(id);
      this.showPeek(id);
    }
  }

  private onMessageChanged(message: ChatMessage): void {
    const id = message.conversationId;
    this.replaceMessage(id, message.id, () => message);

    const conversation = this.conversation(id);
    if (!conversation) return;

    if (conversation.lastMessage?.id === message.id) this.patchConversation(id, c => ({ ...c, lastMessage: message }));

    // An unread message that was deleted no longer counts; the server knows the new number.
    if (message.isDeleted && message.senderId !== this.me && conversation.unreadCount > 0) {
      this.http.get<ChatConversation>(`${this.apiUrl}/${id}`).subscribe({
        next: fetched => this.patchConversation(id, c => ({ ...c, unreadCount: fetched.unreadCount })),
        error: () => { /* keep the count */ }
      });
    }
  }

  private onRead(conversationId: string, userId: string, readAt: string): void {
    this.patchConversation(conversationId, c => {
      const marked = applyRead(c, userId, readAt);
      if (userId === this.me) return { ...marked, unreadCount: 0 };          // read in another tab of this account
      return c.isGroup ? marked : { ...marked, friendLastReadAt: readAt };   // the friend has seen it
    });
  }

  private onGroupChanged(change: ChatGroupEvent): void {
    const id = change.conversationId;
    if (!this.conversation(id)) {
      // A group this tab has not heard of: the user was just put into it.
      this.fetchConversation(id);
      return;
    }

    this.patchConversation(id, c => applyGroupChange(c, change, this.me));
    change.participants.filter(p => p.isOnline).forEach(p => this.setOnline(p.id, true));
  }

  /** Someone joined or left the call of a group: the chat shows who is in it. */
  private onCallMembers(event: GroupCallMemberEvent): void {
    const conversation = this.conversation(event.conversationId);
    // Not in the list: the user left the group and is being told they are out of its call.
    if (!conversation) return;

    const call = applyCallMembers(conversation.activeCall, event);
    if (call) this.patchConversation(conversation.id, c => ({ ...c, activeCall: call }));
    else if (event.participants.length) this.fetchConversation(conversation.id);
  }

  /** Loads one chat from the server into the list. */
  private fetchConversation(id: string, then?: (conversation: ChatConversation) => void): void {
    const waiting = this.fetching.get(id);
    if (waiting) {
      if (then) waiting.push(then);
      return;
    }

    this.fetching.set(id, then ? [then] : []);
    this.http.get<ChatConversation>(`${this.apiUrl}/${id}`).subscribe({
      next: fetched => {
        const callbacks = this.fetching.get(id);
        // Signed out meanwhile.
        if (!callbacks) return;

        this.fetching.delete(id);
        this.upsertConversation(fetched);
        callbacks.forEach(callback => callback(fetched));
      },
      error: () => this.fetching.delete(id)
    });
  }

  /** Takes a chat off this screen for good: the user left the group or was removed from it. */
  private dropConversation(id: string): void {
    this.hideTyping(id);
    this.hidePeek(id);
    this.typingSentAt.delete(id);

    this.openIds.update(ids => ids.filter(x => x !== id));
    this.heads.update(ids => ids.filter(x => x !== id));
    this.saveHeads();
    this.allConversations.update(list => list.filter(c => c.id !== id));
    this.threads.update(all => Object.fromEntries(Object.entries(all).filter(([key]) => key !== id)));
  }

  private showTyping(conversationId: string, userId: string): void {
    if (userId === this.me) return;

    this.typingUsers.update(all => {
      const ids = all[conversationId] ?? [];
      return ids.includes(userId) ? all : { ...all, [conversationId]: [...ids, userId] };
    });

    const key = `${conversationId}|${userId}`;
    clearTimeout(this.typingTimers.get(key));
    this.typingTimers.set(key, setTimeout(() => this.hideTyping(conversationId, userId), TYPING_SHOWN_MS));
  }

  /** One person stopped typing, or (without a person) the chat is gone. */
  private hideTyping(conversationId: string, userId?: string): void {
    const ids = this.typingUsers()[conversationId] ?? [];
    const gone = userId ? ids.filter(id => id === userId) : ids;
    if (!gone.length) return;

    gone.forEach(id => {
      const key = `${conversationId}|${id}`;
      clearTimeout(this.typingTimers.get(key));
      this.typingTimers.delete(key);
    });
    this.typingUsers.update(all => ({ ...all, [conversationId]: ids.filter(id => !gone.includes(id)) }));
  }

  private showPeek(conversationId: string): void {
    this.peekIds.update(ids => new Set(ids).add(conversationId));
    clearTimeout(this.peekTimers.get(conversationId));
    this.peekTimers.set(conversationId, setTimeout(() => this.hidePeek(conversationId), PEEK_SHOWN_MS));
  }

  private hidePeek(conversationId: string): void {
    clearTimeout(this.peekTimers.get(conversationId));
    this.peekTimers.delete(conversationId);
    if (!this.peekIds().has(conversationId)) return;

    this.peekIds.update(ids => { const next = new Set(ids); next.delete(conversationId); return next; });
  }

  private setOnline(userId: string, isOnline: boolean): void {
    this.onlineIds.update(ids => {
      const next = new Set(ids);
      isOnline ? next.add(userId) : next.delete(userId);
      return next;
    });
  }

  // ── State helpers ───────────────────────────────────────────────────────────

  private pick(ids: string[]): ChatConversation[] {
    const all = this.allConversations();
    return ids.map(id => all.find(c => c.id === id)).filter((c): c is ChatConversation => !!c);
  }

  private upsertConversation(conversation: ChatConversation): void {
    this.allConversations.update(list =>
      list.some(c => c.id === conversation.id)
        ? list.map(c => (c.id === conversation.id ? conversation : c))
        : [...list, conversation]);
    onlineIn(conversation).forEach(id => this.setOnline(id, true));
  }

  private patchConversation(id: string, change: (c: ChatConversation) => ChatConversation): void {
    this.allConversations.update(list => list.map(c => (c.id === id ? change(c) : c)));
  }

  private patchThread(id: string, change: (t: ChatThread) => ChatThread): void {
    this.threads.update(all => ({ ...all, [id]: change(all[id] ?? EMPTY_THREAD) }));
  }

  private replaceMessage(conversationId: string, messageId: string, change: (m: ChatMessage) => ChatMessage): void {
    this.patchThread(conversationId, t => ({ ...t, messages: t.messages.map(m => (m.id === messageId ? change(m) : m)) }));
  }

  // The bubbles survive a reload, per account, in this browser.
  private get headsKey(): string { return `miqat.chat.heads.${this.me}`; }

  private saveHeads(): void {
    if (!this.me) return;
    try { localStorage.setItem(this.headsKey, JSON.stringify(this.heads())); } catch { /* private mode */ }
  }

  private restoreHeads(): void {
    let stored: string | null = null;
    let saved: unknown = [];
    try {
      stored = localStorage.getItem(this.headsKey);
      saved = JSON.parse(stored ?? '[]');
    } catch { /* unreadable: start empty */ }

    const known = new Set(this.allConversations().map(c => c.id));
    const heads = (Array.isArray(saved) ? saved : []).filter((id): id is string => typeof id === 'string' && known.has(id));

    // The very first time in this browser, unread chats come up as bubbles so
    // the chat is noticed. After that the bubbles are the user's own choice: one
    // they closed stays closed until a new message arrives (the button keeps the count).
    const unread = stored === null
      ? this.conversations().filter(c => c.unreadCount > 0).slice(0, 3).map(c => c.id)
      : [];
    this.heads.set([...unread, ...heads].slice(0, MAX_HEADS));
    if (stored === null) this.saveHeads();
  }
}

/** The people of a chat the server says are online. */
function onlineIn(conversation: ChatConversation): string[] {
  const people = conversation.isGroup ? [] : [conversation.friend];
  return [...people, ...(conversation.participants ?? [])].filter(p => p.isOnline).map(p => p.id);
}
