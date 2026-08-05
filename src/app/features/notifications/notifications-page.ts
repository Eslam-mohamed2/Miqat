import { Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { NotificationService } from '../../core/services/notification.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { UiService } from '../../core/services/ui.service';
import { NotificationDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';

type Filter = 'all' | 'unread';

/** How each notification type is presented: icon, accent, and grouping label. */
interface TypeStyle {
  icon: string;
  color: string;
  label: string;
}

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.scss',
  animations: [
    trigger('listAnim', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(-8px)' }),
          stagger('40ms', [
            animate('220ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ])
  ]
})
export class NotificationsPage implements OnInit {
  private notificationService = inject(NotificationService);
  private uiService = inject(UiService);
  private router = inject(Router);
  private realtime = inject(RealtimeService);
  private destroyRef = inject(DestroyRef);

  /**
   * Keyed by the exact NotificationType names the API serialises.
   * The previous map used 'task' / 'mention' / 'system', none of which the API
   * ever sends, so every row fell through to the same grey bell icon.
   */
  private readonly typeStyles: Record<string, TypeStyle> = {
    GroupInvite:           { icon: 'group_add',       color: '#7c8ef5', label: 'Project' },
    TaskAssigned:          { icon: 'assignment_ind',  color: '#2ec4a0', label: 'Task' },
    TaskCompleted:         { icon: 'task_alt',        color: '#2ec4a0', label: 'Task' },
    TaskDueSoon:           { icon: 'alarm',           color: '#f4845f', label: 'Task' },
    MentionedInTask:       { icon: 'alternate_email', color: '#f4a835', label: 'Mention' },
    FriendRequestSent:     { icon: 'person_add',      color: '#7c8ef5', label: 'Friend' },
    FriendRequestAccepted: { icon: 'how_to_reg',      color: '#2ec4a0', label: 'Friend' },
    UserBlocked:           { icon: 'block',           color: '#ef4444', label: 'Friend' }
  };

  private readonly fallbackStyle: TypeStyle = {
    icon: 'notifications', color: '#8b8b8b', label: 'Other'
  };

  notifications = signal<NotificationDto[]>([]);
  loading = signal(true);
  loadingMore = signal(false);
  totalCount = signal(0);
  private pageIndex = 0;
  private readonly pageSize = 20;

  hasMore = computed(() => this.notifications().length < this.totalCount());
  errorMessage = signal('');
  filter = signal<Filter>('all');
  openMenuId = signal<string | null>(null);

  unreadCount = computed(() => this.notifications().filter(n => !n.isRead).length);

  visible = computed(() =>
    this.filter() === 'unread'
      ? this.notifications().filter(n => !n.isRead)
      : this.notifications()
  );

  /**
   * New / Earlier, the way Facebook splits its list. "New" is the last 24 hours;
   * anything unread counts as new regardless of age so it cannot get buried.
   */
  groups = computed(() => {
    const dayAgo = Date.now() - 86_400_000;
    const isNew = (n: NotificationDto) =>
      !n.isRead || new Date(n.createdAt).getTime() >= dayAgo;

    const items = this.visible();
    return [
      { key: 'new',     title: 'New',     items: items.filter(isNew) },
      { key: 'earlier', title: 'Earlier', items: items.filter(n => !isNew(n)) }
    ].filter(group => group.items.length > 0);
  });

  ngOnInit() {
    this.loadNotifications();

    // Reloading page 0 (rather than prepending the payload) keeps ids and read
    // state authoritative — the push carries no id.
    this.realtime.notification$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadNotifications(true));
  }

  /** `silent` skips the skeleton — used when a realtime push refreshes the feed. */
  loadNotifications(silent = false) {
    // First page only; the rest arrives via loadMore(). The page used to pull
    // the entire feed in one request, which cannot survive a real history.
    this.pageIndex = 0;
    if (!silent) this.loading.set(true);
    this.errorMessage.set('');
    this.notificationService.getPaged(0, this.pageSize).subscribe({
      next: page => {
        this.notifications.set(page.items ?? []);
        this.totalCount.set(page.totalCount ?? page.items?.length ?? 0);
        this.loading.set(false);
      },
      error: err => {
        this.notifications.set([]);
        this.errorMessage.set(apiErrorMessage(err, 'Could not load notifications.'));
        this.loading.set(false);
      }
    });
  }

  loadMore() {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    this.notificationService.getPaged(this.pageIndex + 1, this.pageSize).subscribe({
      next: page => {
        this.pageIndex += 1;
        // Deduped by id: a notification created between two page fetches shifts
        // the pages and would otherwise appear twice.
        this.notifications.update(current => {
          const seen = new Set(current.map(n => n.id));
          return [...current, ...(page.items ?? []).filter(n => !seen.has(n.id))];
        });
        this.totalCount.set(page.totalCount ?? this.totalCount());
        this.loadingMore.set(false);
      },
      error: err => {
        this.loadingMore.set(false);
        this.errorMessage.set(apiErrorMessage(err, 'Could not load more notifications.'));
      }
    });
  }

  /** Row click: mark it read, then go wherever it points. */
  open(n: NotificationDto) {
    if (!n.isRead) this.markAsRead(n.id);
    this.navigateTo(n);
  }

  private navigateTo(n: NotificationDto) {
    const entity = (n.linkedEntityType ?? '').toLowerCase();

    if (entity === 'group' && n.linkedEntityId) {
      this.uiService.openProjectDetails(n.linkedEntityId);
      return;
    }
    if (entity === 'taskitem') {
      this.router.navigate(['/tasks']);
      return;
    }
    if (entity === 'friendship') {
      // The person is more useful than the friendship record itself.
      this.router.navigate(n.triggeredByUserId ? ['/profile', n.triggeredByUserId] : ['/friends']);
      return;
    }
    if (n.type === 'MentionedInTask') {
      this.router.navigate(['/mentions']);
    }
  }

  markAsRead(id: string) {
    this.notifications.update(list => list.map(n => (n.id === id ? { ...n, isRead: true } : n)));
    this.notificationService.markAsRead(id).subscribe({ error: () => this.loadNotifications() });
  }

  markAllRead() {
    const snapshot = this.notifications();
    this.notifications.update(list => list.map(n => ({ ...n, isRead: true })));
    this.notificationService.markAllAsRead().subscribe({
      error: err => {
        this.notifications.set(snapshot);
        this.errorMessage.set(apiErrorMessage(err, 'Could not mark all as read.'));
      }
    });
  }

  dismiss(n: NotificationDto, event: Event) {
    event.stopPropagation();
    this.openMenuId.set(null);

    const snapshot = this.notifications();
    this.notifications.update(list => list.filter(x => x.id !== n.id));
    this.notificationService.deleteNotification(n.id).subscribe({
      error: err => {
        this.notifications.set(snapshot);
        this.errorMessage.set(apiErrorMessage(err, 'Could not remove that notification.'));
      }
    });
  }

  markOne(n: NotificationDto, event: Event) {
    event.stopPropagation();
    this.openMenuId.set(null);
    if (!n.isRead) this.markAsRead(n.id);
  }

  toggleMenu(id: string, event: Event) {
    event.stopPropagation();
    this.openMenuId.update(current => (current === id ? null : id));
  }

  closeMenu() {
    this.openMenuId.set(null);
  }

  // ── display helpers ────────────────────────────────────────────────────────

  private styleFor(type?: string): TypeStyle {
    return this.typeStyles[type ?? ''] ?? this.fallbackStyle;
  }

  typeIcon(type?: string): string { return this.styleFor(type).icon; }
  typeColor(type?: string): string { return this.styleFor(type).color; }
  typeLabel(type?: string): string { return this.styleFor(type).label; }

  /** Initials for the avatar, falling back to the notification's own title. */
  initials(n: NotificationDto): string {
    const source = n.triggeredByUserName || n.title || '?';
    return source.split(' ').filter(Boolean).slice(0, 2)
      .map(word => word[0]).join('').toUpperCase();
  }

  /**
   * A stable colour per actor, so the same person always gets the same avatar
   * tint instead of one that changes between renders.
   */
  avatarColor(n: NotificationDto): string {
    const palette = ['#7c8ef5', '#2ec4a0', '#f4a835', '#f4845f', '#ef4444', '#9b6dff'];
    const key = n.triggeredByUserName || n.id;
    let hash = 0;
    for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return palette[hash % palette.length];
  }

  formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';

    const diffMin = Math.floor((Date.now() - date.getTime()) / 60_000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;

    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d`;
    if (diffDay < 365) return `${Math.floor(diffDay / 7)}w`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  trackById(_index: number, n: NotificationDto): string {
    return n.id;
  }
}
