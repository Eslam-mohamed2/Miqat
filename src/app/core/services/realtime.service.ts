import { Injectable, inject } from '@angular/core';
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
  /** The connection is gone and is not coming back by itself. */
  readonly closed$ = new Subject<void>();

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
    this.connection.on('projectCommentChanged', (payload: ProjectCommentEvent) =>
      this.projectCommentChanged$.next(payload));
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
    this.connection.on('chatGroupChanged', (payload: ChatGroupEvent) => this.chatGroupChanged$.next(payload));
    this.connection.on('chatGroupRemoved', (payload: { conversationId: string }) => this.chatGroupRemoved$.next(payload));
    this.connection.on('groupCallStarted', (payload: GroupCall) => this.groupCallStarted$.next(payload));
    this.connection.on('groupCallIncoming', (payload: GroupCallIncomingEvent) => this.groupCallIncoming$.next(payload));
    this.connection.on('groupCallJoined', (payload: GroupCallMemberEvent) => this.groupCallJoined$.next(payload));
    this.connection.on('groupCallLeft', (payload: GroupCallMemberEvent) => this.groupCallLeft$.next(payload));
    this.connection.on('groupCallEnded', (payload: GroupCallRef) => this.groupCallEnded$.next(payload));
    this.connection.on('groupCallDismissed', (payload: GroupCallRef) => this.groupCallDismissed$.next(payload));
    this.connection.on('groupCallSignal', (payload: GroupCallSignalEvent) => this.groupCallSignal$.next(payload));
    this.connection.onreconnected(() => this.reconnected$.next());
    // Not when the app itself hangs up (sign-out).
    const connection = this.connection;
    connection.onclose(() => { if (this.connection === connection) this.closed$.next(); });

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
    if (connection) {
      try {
        await connection.stop();
      } catch {
        /* already gone */
      }
    }
  }
}
