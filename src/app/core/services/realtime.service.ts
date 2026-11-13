import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import {
  HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel
} from '@microsoft/signalr';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import { serverMessage } from '../http/api-error';
import { t } from '../i18n/i18n';
import { GroupCommentDto } from '../../models/api.models';

/** Pushed when a notification is created for the signed-in user. */
export interface RealtimeNotification {
  title?: string;
  message?: string;
  type?: string;
  linkedEntityId?: string;
  linkedEntityType?: string;
  triggeredByUserName?: string;
}

export interface TaskChangedEvent {
  taskId: string;
  groupId?: string | null;
  action: 'created' | 'updated' | 'deleted';
  title?: string;
}

export interface EventChangedEvent {
  eventId?: string;
  action?: string;
  title?: string;
}

/** What happened in a project's discussion ("projectCommentChanged"), sent to everyone on the project. */
export interface ProjectCommentEvent {
  groupId: string;
  action: 'added' | 'edited' | 'deleted';
  /** The comment as the receiver may see and change it; absent when it was deleted. */
  comment?: GroupCommentDto | null;
  /** The deleted comment and the replies that went with it. */
  deletedIds?: string[];
  /** Comments and replies in the discussion after the change. */
  total: number;
}

/** A person in a chat, without presence. */
export interface ChatUser {
  id: string;
  fullName: string;
  profilePictureUrl?: string | null;
}

/** What happened to a group, on the line the chat shows for it. */
export type GroupEventKind = 'Created' | 'MemberAdded' | 'MemberRemoved' | 'MemberLeft' | 'Renamed';

/** A chat message as the server sends it: new ("chatMessage") or edited / deleted ("chatMessageChanged"). */
export interface ChatMessageEvent {
  id: string;
  conversationId: string;
  senderId: string;
  /** Who sent it. Absent on an API build without group chats. */
  sender?: ChatUser | null;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  isDeleted?: boolean;
  /** The id this app gave the message before it was saved; only on new messages. */
  clientId?: string | null;
  /** Set when the message is the record of a call; the sender is then the caller and there is no text. */
  callOutcome?: 'Completed' | 'Missed' | 'Declined' | null;
  callVideo?: boolean | null;
  callSeconds?: number | null;
  /** On the record of a group call: how many people took part, the starter included. */
  callParticipants?: number | null;
  /** Set when the message is a line about the group itself; the sender is then who did it. */
  groupEvent?: GroupEventKind | null;
  /** The person added or removed. */
  targetUser?: ChatUser | null;
  /** The name given by "Created" and "Renamed". */
  groupName?: string | null;
}

/** One person of a chat, as the chat itself knows them. */
export interface ChatParticipant extends ChatUser {
  isOnline?: boolean;
  isAdmin: boolean;
  joinedAt: string;
  /** This person has read everything sent up to here. */
  lastReadAt?: string | null;
}

/** A group was created, renamed, or its people changed ("chatGroupChanged"). */
export interface ChatGroupEvent {
  conversationId: string;
  name: string;
  createdByUserId: string;
  participants: ChatParticipant[];
}

export interface GroupCallParticipant extends ChatUser { joinedAt: string; }

/** A group call that is going on. */
export interface GroupCall {
  callId: string;
  conversationId: string;
  /** What the starter chose; each person decides about their own camera. */
  video: boolean;
  startedByUserId: string;
  startedAt: string;
  /** Who is in the call right now, in the order they joined. */
  participants: GroupCallParticipant[];
}

/** A group call rings here: an invitation, until this person joins or dismisses it. */
export interface GroupCallIncomingEvent {
  callId: string;
  conversationId: string;
  video: boolean;
  groupName: string;
  from: ChatUser;
}

/** Someone joined or left a group call; `participants` is who is in it now. */
export interface GroupCallMemberEvent {
  callId: string;
  conversationId: string;
  userId: string;
  participants: GroupCallParticipant[];
}

export interface GroupCallRef { callId: string; conversationId: string; }

/** A set-up message from one other browser of a group call. */
export interface GroupCallSignalEvent { callId: string; fromUserId: string; data: any; }

/** A friend is calling: it rings in every open tab until one answers. */
export interface CallIncomingEvent {
  callId: string;
  conversationId: string;
  video: boolean;
  from: { id: string; fullName: string; profilePictureUrl?: string | null };
}

/** A set-up message from the other browser of a call (offer, answer or network candidate). */
export interface CallSignalEvent { callId: string; data: any; }

/** "ended", "declined", "cancelled" (the caller gave up) or "answeredElsewhere" (picked up in another tab). */
export interface CallEndedEvent { callId: string; reason: string; }

export interface ChatReadEvent { conversationId: string; userId: string; readAt: string; }
export interface ChatTypingEvent { conversationId: string; userId: string; }
export interface PresenceEvent { userId: string; isOnline: boolean; }

/**
 * How long to wait before trying to connect again, by the number of tries that
 * failed in a row. The last one repeats: the app never stops trying while
 * someone is signed in.
 */
export const RETRY_DELAYS_MS = [0, 2000, 5000, 10_000, 20_000, 30_000];
/** A drop that lasts this long is told to the app as "lost" (a group call is then left). Trying goes on. */
export const LOST_AFTER_MS = 45_000;

/**
 * The app's live channel to the server.
 *
 * One connection per session, joined server-side to a per-user group, so every
 * open tab hears about notifications, task changes and new comments the moment
 * they happen instead of on the next poll or reload.
 *
 * It keeps itself alive. A start that fails and a connection that drops are
 * tried again, with longer waits between tries, for as long as someone is
 * signed in; coming back to the tab or getting the network back tries at once.
 * The access token it presents is renewed first when it has run out, through
 * the same single renewal the HTTP requests use. While it is down the server
 * counts this person as offline, so staying down is not an option.
 */
@Injectable({
  providedIn: 'root'
})
export class RealtimeService {
  private authService = inject(AuthService);
  private connection: HubConnection | null = null;

  readonly notification$ = new Subject<RealtimeNotification>();
  readonly taskChanged$ = new Subject<TaskChangedEvent>();
  readonly commentAdded$ = new Subject<{ taskId: string }>();
  /** A comment in a project's discussion was added, edited or deleted. An API build without discussions never sends it. */
  readonly projectCommentChanged$ = new Subject<ProjectCommentEvent>();
  /** A calendar event the user can see was created, changed, answered or removed. */
  readonly eventChanged$ = new Subject<EventChangedEvent>();

  // Chat between friends.
  readonly chatMessage$ = new Subject<ChatMessageEvent>();
  readonly chatMessageChanged$ = new Subject<ChatMessageEvent>();
  readonly chatRead$ = new Subject<ChatReadEvent>();
  readonly chatTyping$ = new Subject<ChatTypingEvent>();
  readonly presenceChanged$ = new Subject<PresenceEvent>();
  // Voice and video calls.
  readonly callIncoming$ = new Subject<CallIncomingEvent>();
  readonly callAccepted$ = new Subject<{ callId: string }>();
  readonly callSignal$ = new Subject<CallSignalEvent>();
  readonly callEnded$ = new Subject<CallEndedEvent>();
  // Group chats and the calls inside them. An API build without groups never sends these.
  readonly chatGroupChanged$ = new Subject<ChatGroupEvent>();
  /** The user left a group or was removed from it. */
  readonly chatGroupRemoved$ = new Subject<{ conversationId: string }>();
  readonly groupCallStarted$ = new Subject<GroupCall>();
  readonly groupCallIncoming$ = new Subject<GroupCallIncomingEvent>();
  readonly groupCallJoined$ = new Subject<GroupCallMemberEvent>();
  readonly groupCallLeft$ = new Subject<GroupCallMemberEvent>();
  readonly groupCallEnded$ = new Subject<GroupCallRef>();
  /** The user dismissed a ringing group call in one of their tabs. */
  readonly groupCallDismissed$ = new Subject<GroupCallRef>();
  readonly groupCallSignal$ = new Subject<GroupCallSignalEvent>();
  /** The connection came back after a drop: whatever was pushed meanwhile was missed. */
  readonly reconnected$ = new Subject<void>();
  /**
   * The connection has been away for a while (LOST_AFTER_MS). It is still being
   * tried; what cannot wait for it (a group call) ends now.
   */
  readonly closed$ = new Subject<void>();

  /** True while the connection is up. Lists that it keeps current fall back to asking the server while it is not. */
  readonly connected = signal(false);
  /** The connection is up: for the first time, or again after a drop. */
  readonly connected$ = new Subject<void>();

  /** Between connect() and disconnect(): someone is signed in and the connection is wanted. */
  private wanted = false;
  /** A start is on its way. */
  private starting = false;
  /** Tries that failed in a row. */
  private failures = 0;
  private everConnected = false;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private lostTimer?: ReturnType<typeof setTimeout>;
  private readonly wake = () => this.wakeUp();
  private readonly wakeIfVisible = () => { if (document.visibilityState === 'visible') this.wakeUp(); };

  /** Idempotent — the shell calls this on every entry to the signed-in layout. */
  async connect(): Promise<void> {
    if (this.wanted) {
      this.wakeUp();
      return;
    }
    // An access token that has run out is fine as long as it can be renewed:
    // the connection asks for a fresh one before it presents it.
    if (!this.authService.hasSession()) return;

    this.wanted = true;
    this.failures = 0;
    this.everConnected = false;
    this.connection = this.build();
    this.listenForWakeUps(true);
    await this.start();
  }

  /** The connection itself, not started. Its own method so a test can hand in a stand-in. */
  protected createConnection(): HubConnection {
    return new HubConnectionBuilder()
      // Same-origin in dev (the proxy forwards /hubs with ws upgrade); the
      // deployed build carries the API origin in environment.apiUrl.
      .withUrl(`${environment.apiUrl}/hubs/miqat`, {
        // Asked for at every (re)connect, and again when the server refuses the
        // one in use: a token that has run out is renewed first. A failed
        // renewal fails this try; the next one asks again.
        accessTokenFactory: async () => (await this.authService.freshToken()) ?? ''
      })
      // No withAutomaticReconnect: it gives up after its last delay. The loop
      // below does the same job without an end (see start() and retryLater()).
      .configureLogging(LogLevel.Warning)
      .build();
  }

  /** Makes the connection and wires its events. */
  private build(): HubConnection {
    const connection = this.createConnection();

    connection.on('notification', (payload: RealtimeNotification) =>
      this.notification$.next(payload ?? {}));
    connection.on('taskChanged', (payload: TaskChangedEvent) =>
      this.taskChanged$.next(payload));
    connection.on('commentAdded', (payload: { taskId: string }) =>
      this.commentAdded$.next(payload));
    connection.on('projectCommentChanged', (payload: ProjectCommentEvent) =>
      this.projectCommentChanged$.next(payload));
    connection.on('eventChanged', (payload: EventChangedEvent) =>
      this.eventChanged$.next(payload ?? {}));

    connection.on('chatMessage', (payload: ChatMessageEvent) => this.chatMessage$.next(payload));
    connection.on('chatMessageChanged', (payload: ChatMessageEvent) => this.chatMessageChanged$.next(payload));
    connection.on('chatRead', (payload: ChatReadEvent) => this.chatRead$.next(payload));
    connection.on('chatTyping', (payload: ChatTypingEvent) => this.chatTyping$.next(payload));
    connection.on('presenceChanged', (payload: PresenceEvent) => this.presenceChanged$.next(payload));
    connection.on('callIncoming', (payload: CallIncomingEvent) => this.callIncoming$.next(payload));
    connection.on('callAccepted', (payload: { callId: string }) => this.callAccepted$.next(payload));
    connection.on('callSignal', (payload: CallSignalEvent) => this.callSignal$.next(payload));
    connection.on('callEnded', (payload: CallEndedEvent) => this.callEnded$.next(payload));
    connection.on('chatGroupChanged', (payload: ChatGroupEvent) => this.chatGroupChanged$.next(payload));
    connection.on('chatGroupRemoved', (payload: { conversationId: string }) => this.chatGroupRemoved$.next(payload));
    connection.on('groupCallStarted', (payload: GroupCall) => this.groupCallStarted$.next(payload));
    connection.on('groupCallIncoming', (payload: GroupCallIncomingEvent) => this.groupCallIncoming$.next(payload));
    connection.on('groupCallJoined', (payload: GroupCallMemberEvent) => this.groupCallJoined$.next(payload));
    connection.on('groupCallLeft', (payload: GroupCallMemberEvent) => this.groupCallLeft$.next(payload));
    connection.on('groupCallEnded', (payload: GroupCallRef) => this.groupCallEnded$.next(payload));
    connection.on('groupCallDismissed', (payload: GroupCallRef) => this.groupCallDismissed$.next(payload));
    connection.on('groupCallSignal', (payload: GroupCallSignalEvent) => this.groupCallSignal$.next(payload));

    // The connection dropped. Not when the app itself hangs up (sign-out).
    connection.onclose(() => {
      if (this.connection !== connection) return;

      this.connected.set(false);
      // Told as lost only when it stays away; a short gap is bridged silently.
      clearTimeout(this.lostTimer);
      this.lostTimer = setTimeout(() => this.closed$.next(), LOST_AFTER_MS);
      this.retryLater();
    });

    return connection;
  }

  /** One try. A failure books the next one; nothing is thrown. */
  private async start(): Promise<void> {
    const connection = this.connection;
    if (!connection || !this.wanted || this.starting || connection.state !== HubConnectionState.Disconnected) return;

    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.starting = true;
    try {
      await connection.start();
    } catch {
      // The app is fully usable without the live channel (lists ask the server
      // instead), and the next try is booked here.
      this.starting = false;
      if (this.connection === connection && this.wanted) {
        this.failures++;
        this.retryLater();
      }
      return;
    }
    this.starting = false;
    // Signed out while it was connecting: disconnect() has stopped it.
    if (this.connection !== connection) return;

    this.failures = 0;
    clearTimeout(this.lostTimer);
    const again = this.everConnected;
    this.everConnected = true;
    this.connected.set(true);
    this.connected$.next();
    if (again) this.reconnected$.next();
  }

  private retryLater(): void {
    if (!this.wanted || this.retryTimer !== undefined) return;

    const delay = RETRY_DELAYS_MS[Math.min(this.failures, RETRY_DELAYS_MS.length - 1)];
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.start();
    }, delay);
  }

  /**
   * The tab is looked at again, or the network is back: if the connection is
   * down, try now instead of sitting out the rest of a wait.
   */
  private wakeUp(): void {
    if (!this.wanted || this.starting || this.connection?.state !== HubConnectionState.Disconnected) return;

    this.failures = 0;
    this.start();
  }

  private listenForWakeUps(on: boolean): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const change = on ? 'addEventListener' : 'removeEventListener';
    window[change]('online', this.wake);
    window[change]('focus', this.wake);
    // A page brought back from the browser's back/forward cache has lost its connection.
    window[change]('pageshow', this.wake);
    document[change]('visibilitychange', this.wakeIfVisible);
  }

  /**
   * Tells the others in a chat that the user is typing. Nothing is saved and a
   * lost call costs nothing, so failures are ignored.
   */
  sendTyping(conversationId: string): void {
    if (this.connection?.state !== HubConnectionState.Connected) return;
    this.connection.invoke('Typing', conversationId).catch(() => { /* best effort */ });
  }

  /**
   * Calls a method of the hub and answers what it returns. When the server
   * refuses with a reason ("Sam is not online right now"), the promise rejects
   * with an Error carrying that sentence, in the interface language when the
   * dictionary lists it.
   */
  async invoke<T = void>(method: string, ...args: unknown[]): Promise<T> {
    if (this.connection?.state !== HubConnectionState.Connected) {
      throw new Error(t('You are offline. Check your connection and try again.'));
    }

    try {
      return await this.connection.invoke<T>(method, ...args);
    } catch (err) {
      // SignalR wraps the reason: "An unexpected error occurred invoking 'X' on the server. HubException: <reason>".
      const text = err instanceof Error ? err.message : String(err);
      const marker = 'HubException: ';
      throw new Error(text.includes(marker)
        ? serverMessage(text.slice(text.indexOf(marker) + marker.length))
        : t('Something went wrong. Try again.'));
    }
  }

  async disconnect(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    this.wanted = false;
    this.starting = false;
    this.failures = 0;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    clearTimeout(this.lostTimer);
    this.listenForWakeUps(false);
    this.connected.set(false);
    if (connection) {
      try {
        await connection.stop();
      } catch {
        /* already gone */
      }
    }
  }
}
