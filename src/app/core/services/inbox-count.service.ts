import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, forkJoin, merge, of, timer } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { FriendService } from './friend.service';
import { MentionService } from './mention.service';
import { NotificationService } from './notification.service';
import { RealtimeService } from './realtime.service';

const POLL_INTERVAL_MS = 60_000;

/**
 * How many things are waiting in the Inbox: unread notifications, unread mentions
 * and friend requests. Feeds the dot on the rail's bell and the Inbox tabs.
 *
 * Polled every minute and refreshed the moment a live notification arrives. Each
 * request swallows its own error, so one failed call never freezes the counts.
 */
@Injectable({ providedIn: 'root' })
export class InboxCountService {
  private notifications = inject(NotificationService);
  private mentions = inject(MentionService);
  private friends = inject(FriendService);
  private realtime = inject(RealtimeService);

  readonly unreadNotifications = signal(0);
  readonly unreadMentions = signal(0);
  readonly friendRequests = signal(0);

  readonly total = computed(() => this.unreadNotifications() + this.unreadMentions() + this.friendRequests());

  private subscription?: Subscription;

  /** Called by the app shell, which only exists while someone is signed in. */
  start(): void {
    if (this.subscription) return;

    this.subscription = merge(timer(0, POLL_INTERVAL_MS), this.realtime.notification$)
      .pipe(switchMap(() => this.load()))
      .subscribe(counts => {
        this.unreadNotifications.set(counts.notifications);
        this.unreadMentions.set(counts.mentions);
        this.friendRequests.set(counts.requests);
      });
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }

  /** After the user reads or answers something, so the dot follows straight away. */
  refresh(): void {
    this.load().subscribe(counts => {
      this.unreadNotifications.set(counts.notifications);
      this.unreadMentions.set(counts.mentions);
      this.friendRequests.set(counts.requests);
    });
  }

  private load() {
    return forkJoin({
      notifications: this.notifications.getUnread().pipe(map(list => list.length), catchError(() => of(0))),
      mentions: this.mentions.getUnreadCount().pipe(catchError(() => of(0))),
      requests: this.friends.getPendingRequests().pipe(map(list => list.length), catchError(() => of(0)))
    });
  }
}
