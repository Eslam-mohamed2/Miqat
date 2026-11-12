import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import {
  HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel
} from '@microsoft/signalr';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

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

/** A chat message as the server sends it: new ("chatMessage") or edited / deleted ("chatMessageChanged"). */
export interface ChatMessageEvent {
  id: string;
  conversationId: string;
  senderId: string;
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
}

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
 * The app's live channel to the server.
 *
 * One connection per session, joined server-side to a per-user group, so every
 * open tab hears about notifications, task changes and new comments the moment
 * they happen instead of on the next poll or reload.
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
  /** The connection came back after a drop: whatever was pushed meanwhile was missed. */
  readonly reconnected$ = new Subject<void>();

  /** Idempotent — the shell calls this on every entry to the signed-in layout. */
  async connect(): Promise<void> {
    if (this.connection && this.connection.state !== HubConnectionState.Disconnected) return;
    if (!this.authService.isLoggedIn()) return;

    this.connection = new HubConnectionBuilder()
      // Same-origin in dev (the proxy forwards /hubs with ws upgrade); the
      // deployed build carries the API origin in environment.apiUrl.
      .withUrl(`${environment.apiUrl}/hubs/miqat`, {
        // Read at (re)connect time, so a refreshed JWT is picked up without
        // tearing the connection down.
        accessTokenFactory: () => this.authService.getToken() ?? ''
      })
      .withAutomaticReconnect([0, 2000, 10_000, 30_000])
      .configureLogging(LogLevel.Warning)
      .build();

    this.connection.on('notification', (payload: RealtimeNotification) =>
      this.notification$.next(payload ?? {}));
    this.connection.on('taskChanged', (payload: TaskChangedEvent) =>
      this.taskChanged$.next(payload));
    this.connection.on('commentAdded', (payload: { taskId: string }) =>
      this.commentAdded$.next(payload));
    this.connection.on('eventChanged', (payload: EventChangedEvent) =>
      this.eventChanged$.next(payload ?? {}));

    this.connection.on('chatMessage', (payload: ChatMessageEvent) => this.chatMessage$.next(payload));
    this.connection.on('chatMessageChanged', (payload: ChatMessageEvent) => this.chatMessageChanged$.next(payload));
    this.connection.on('chatRead', (payload: ChatReadEvent) => this.chatRead$.next(payload));
    this.connection.on('chatTyping', (payload: ChatTypingEvent) => this.chatTyping$.next(payload));
    this.connection.on('presenceChanged', (payload: PresenceEvent) => this.presenceChanged$.next(payload));
    this.connection.on('callIncoming', (payload: CallIncomingEvent) => this.callIncoming$.next(payload));
    this.connection.on('callAccepted', (payload: { callId: string }) => this.callAccepted$.next(payload));
    this.connection.on('callSignal', (payload: CallSignalEvent) => this.callSignal$.next(payload));
    this.connection.on('callEnded', (payload: CallEndedEvent) => this.callEnded$.next(payload));
    this.connection.onreconnected(() => this.reconnected$.next());

    try {
      await this.connection.start();
    } catch {
      // Best-effort: the app is fully usable without the live channel — polling
      // and manual refresh still work. Reconnect handles later recovery.
    }
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
   * with an Error carrying exactly that sentence.
   */
  async invoke<T = void>(method: string, ...args: unknown[]): Promise<T> {
    if (this.connection?.state !== HubConnectionState.Connected) {
      throw new Error('You are offline. Check your connection and try again.');
    }

    try {
      return await this.connection.invoke<T>(method, ...args);
    } catch (err) {
      // SignalR wraps the reason: "An unexpected error occurred invoking 'X' on the server. HubException: <reason>".
      const text = err instanceof Error ? err.message : String(err);
      const marker = 'HubException: ';
      throw new Error(text.includes(marker) ? text.slice(text.indexOf(marker) + marker.length) : 'Something went wrong. Try again.');
    }
  }

  async disconnect(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    if (connection) {
      try {
        await connection.stop();
      } catch {
        /* already gone */
      }
    }
  }
}
