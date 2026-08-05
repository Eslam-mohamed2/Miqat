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

    try {
      await this.connection.start();
    } catch {
      // Best-effort: the app is fully usable without the live channel — polling
      // and manual refresh still work. Reconnect handles later recovery.
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
