import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, Subscription, forkJoin, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { ChatMessageEvent, RealtimeService } from './realtime.service';

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
  friend: ChatPerson;
  lastMessage?: ChatMessage | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  /** The friend has read everything sent up to this moment. */
  friendLastReadAt?: string | null;
  /** False once the two are no longer friends: readable, but closed. */
  canSend: boolean;
}

/** The messages of one chat that are loaded so far, oldest first. */
export interface ChatThread {
  messages: ChatMessage[];
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
}

interface MessagePage { messages: ChatMessage[]; hasMore: boolean; }

/**
 * A call as one line of text, for the chat and the chat list:
 * "Video call · 2:05", "Missed voice call", "Voice call · no answer".
 * "mine" is true when the reader is the one who called.
 */
export function describeCall(message: ChatMessageEvent, mine: boolean): string {
  const kind = message.callVideo ? 'video call' : 'voice call';
  const Kind = kind[0].toUpperCase() + kind.slice(1);

  switch (message.callOutcome) {
    case 'Completed': {
      const seconds = message.callSeconds ?? 0;
      return `${Kind} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }
    case 'Declined': return `${Kind} declined`;
    default: return mine ? `${Kind} · no answer` : `Missed ${kind}`;
  }
}

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

/**
 * Chats between friends: the list, the messages, what is unread, who is
 * online, and which chats are docked on the screen as bubbles or open windows.
 *
 * One instance for the whole app, fed by the live connection, so every piece
 * of chat UI shows the same state without asking the server again.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private realtime = inject(RealtimeService);
  private apiUrl = `${environment.apiUrl}/api/Chat`;

  private subscriptions: Subscription[] = [];
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private typingSentAt = new Map<string, number>();
  private peekTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private me: string | null = null;

  /** Null until the server was asked; false on an API build without chat (the UI then hides itself). */
  readonly available = signal<boolean | null>(null);
  private readonly allConversations = signal<ChatConversation[]>([]);
  private readonly threads = signal<Readonly<Record<string, ChatThread>>>({});
  private readonly onlineIds = signal<ReadonlySet<string>>(new Set());
  private readonly typingIds = signal<ReadonlySet<string>>(new Set());
  private readonly peekIds = signal<ReadonlySet<string>>(new Set());

  /** Chats docked on the screen as bubbles, newest first. */
  readonly heads = signal<string[]>([]);
  /** The docked chats whose window is open. */
  readonly openIds = signal<string[]>([]);

  /** Chats that have messages, newest first: what the chat list shows. */
  readonly conversations = computed(() =>
    this.allConversations()
      .filter(c => !!c.lastMessageAt)
      .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')));

  readonly unreadTotal = computed(() => this.allConversations().reduce((sum, c) => sum + c.unreadCount, 0));
  readonly headConversations = computed(() => this.pick(this.heads()));
  readonly openConversations = computed(() => this.pick(this.openIds()));

  get currentUserId(): string | null { return this.me; }

  // ── Start and stop ──────────────────────────────────────────────────────────

  /** Called when the signed-in layout appears. Safe to call again. */
  start(): void {
    if (this.subscriptions.length) return;
    this.me = this.auth.getCurrentUserId();

    this.subscriptions = [
      this.realtime.chatMessage$.subscribe(m => this.onMessage(m)),
      this.realtime.chatMessageChanged$.subscribe(m => this.onMessageChanged(m)),
      this.realtime.chatRead$.subscribe(e => this.onRead(e.conversationId, e.userId, e.readAt)),
      this.realtime.chatTyping$.subscribe(e => this.showTyping(e.conversationId)),
      this.realtime.presenceChanged$.subscribe(e => this.setOnline(e.userId, e.isOnline)),
      // Whatever was pushed while the connection was down was missed.
      this.realtime.reconnected$.subscribe(() => this.refresh())
    ];

    this.refresh();
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
    this.me = null;

    this.available.set(null);
    this.allConversations.set([]);
    this.threads.set({});
    this.onlineIds.set(new Set());
    this.typingIds.set(new Set());
    this.peekIds.set(new Set());
    this.heads.set([]);
    this.openIds.set([]);
  }

  private refresh(): void {
    forkJoin({
      conversations: this.http.get<ChatConversation[]>(this.apiUrl),
      online: this.http.get<string[]>(`${this.apiUrl}/online`)
    }).subscribe({
      next: ({ conversations, online }) => {
        const firstLoad = this.available() !== true;
        // Chats opened here that have no message yet are not in the server's list; keep them.
        const listed = new Set(conversations.map(c => c.id));
        const local = this.allConversations().filter(c => !listed.has(c.id) && !c.lastMessageAt);

        this.allConversations.set([...conversations, ...local]);
        this.onlineIds.set(new Set([...online, ...conversations.filter(c => c.friend.isOnline).map(c => c.friend.id)]));
        this.available.set(true);

        if (firstLoad) this.restoreHeads();
        this.openIds().forEach(id => this.loadMessages(id, true));
      },
      // 404 is an API build without chat; anything else leaves chat hidden rather than half working.
      error: () => { if (this.available() === null) this.available.set(false); }
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
  isTyping(conversationId: string): boolean { return this.typingIds().has(conversationId); }
  isOpen(conversationId: string): boolean { return this.openIds().includes(conversationId); }
  /** A message just arrived for this bubble: its text is shown beside it for a moment. */
  isPeeking(conversationId: string): boolean { return this.peekIds().has(conversationId); }

  // ── Bubbles and windows ─────────────────────────────────────────────────────

  /** Opens the chat with a friend, creating it on the first time. */
  openWith(friendId: string): Observable<ChatConversation> {
    const known = this.allConversations().find(c => c.friend.id === friendId);
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

    this.http.post<ChatMessage>(`${this.apiUrl}/${conversationId}/messages`, { body, clientId }).subscribe({
      next: saved => this.onMessage({ ...saved, clientId }),
      error: (err: HttpErrorResponse) => {
        this.replaceMessage(conversationId, clientId, m => ({ ...m, state: 'failed' }));
        // 403: they stopped being friends while the window was open.
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
    if (!mine) this.hideTyping(id);

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
      // A friend wrote for the first time: the server knows the chat, this tab does not yet.
      this.http.get<ChatConversation>(`${this.apiUrl}/${id}`).subscribe({
        next: fetched => {
          this.upsertConversation(fetched);
          if (!mine) this.addHead(id);
        },
        error: () => { /* nothing to show */ }
      });
      return;
    }

    const alreadyCounted = conversation.lastMessage?.id === message.id;
    const reading = this.isOpen(id) && typeof document !== 'undefined' && document.visibilityState === 'visible';
    this.patchConversation(id, c => ({
      ...c,
      lastMessage: message,
      lastMessageAt: message.createdAt,
      unreadCount: mine || reading || alreadyCounted ? c.unreadCount : c.unreadCount + 1
    }));

    if (mine) return;
    if (reading) {
      this.http.put(`${this.apiUrl}/${id}/read`, {}).subscribe({ error: () => { /* next load corrects it */ } });
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
    this.patchConversation(conversationId, c => userId === this.me
      ? { ...c, unreadCount: 0 }                 // read in another tab of this account
      : { ...c, friendLastReadAt: readAt });     // the friend has seen it
  }

  private showTyping(conversationId: string): void {
    this.typingIds.update(ids => new Set(ids).add(conversationId));
    clearTimeout(this.typingTimers.get(conversationId));
    this.typingTimers.set(conversationId, setTimeout(() => this.hideTyping(conversationId), TYPING_SHOWN_MS));
  }

  private hideTyping(conversationId: string): void {
    clearTimeout(this.typingTimers.get(conversationId));
    this.typingTimers.delete(conversationId);
    if (!this.typingIds().has(conversationId)) return;

    this.typingIds.update(ids => { const next = new Set(ids); next.delete(conversationId); return next; });
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
    if (conversation.friend.isOnline) this.setOnline(conversation.friend.id, true);
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
