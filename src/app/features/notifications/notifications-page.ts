import { Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { NotificationService } from '../../core/services/notification.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { UiService } from '../../core/services/ui.service';
import { TaskService } from '../../core/services/task.service';
import { GroupService } from '../../core/services/group.service';
import { NoticeService } from '../../core/services/notice.service';
import { GroupDto, NotificationDto, TaskDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';
import { isCalendarNotification, notificationTarget } from '../../core/utils/notification-target';

/** `calendar` is event news and reminders; its pill only shows when there are some. */
type Filter = 'all' | 'unread' | 'calendar';

/** How each notification type is presented: icon, accent, and grouping label. */
interface TypeStyle {
  icon: string;
  color: string;
  label: string;
}

/** What a notification is about, shown on the row and used to decide where a click goes. */
export interface NotificationTopic {
  kind: 'task' | 'project' | 'person' | 'mention' | 'event' | 'account' | 'other';
  /** "Task", "Project", "Friend request" ... */
  label: string;
  icon: string;
  /** The task title, project name or person's name, when it is known. */
  name?: string;
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
  private taskService = inject(TaskService);
  private groupService = inject(GroupService);
  private uiService = inject(UiService);
  private notices = inject(NoticeService);
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
    UserBlocked:           { icon: 'block',           color: '#ef4444', label: 'Friend' },
    EventInvitation:       { icon: 'event',           color: '#7c8ef5', label: 'Event' },
    EventResponse:         { icon: 'event_available', color: '#2ec4a0', label: 'Event' },
    EventChanged:          { icon: 'event_repeat',    color: '#f4a835', label: 'Event' },
    EventCancelled:        { icon: 'event_busy',      color: '#ef4444', label: 'Event' },
    Reminder:              { icon: 'alarm',           color: '#f4845f', label: 'Reminder' }
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
  /** The row being opened, while its target is looked up. */
  openingId = signal<string | null>(null);

  /** Avatars that failed to load fall back to initials. */
  private brokenAvatars = signal<ReadonlySet<string>>(new Set());

  unreadCount = computed(() => this.notifications().filter(n => !n.isRead).length);

  /** Event news and reminders among what is loaded; the "Events" pill shows this. */
  calendarCount = computed(() => this.notifications().filter(isCalendarNotification).length);

  /**
   * The filter in force. "Events" falls back to "All" when the last event
   * notification is removed - its pill disappears then, and a filter with no
   * pill would leave an empty page and no way to see why.
   */
  activeFilter = computed<Filter>(() =>
    this.filter() === 'calendar' && !this.calendarCount() ? 'all' : this.filter());

  visible = computed(() => {
    switch (this.activeFilter()) {
      case 'unread':   return this.notifications().filter(n => !n.isRead);
      case 'calendar': return this.notifications().filter(isCalendarNotification);
      default:         return this.notifications();
    }
  });

  /**
   * New / Earlier. "New" is the last 24 hours; anything unread counts as new
   * regardless of age so it cannot get buried.
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

  // ── Opening a notification ─────────────────────────────────────────────────

  /**
   * Row click: mark it read, go to the thing it is about, and say on arrival which
   * notification brought the user there.
   */
  open(n: NotificationDto) {
    if (this.openingId()) return;
    if (!n.isRead) this.markAsRead(n.id);

    const topic = this.topic(n);
    const arrive = (commands: unknown[], extras: { queryParams?: Record<string, string> } = {}) => {
      this.openingId.set(null);
      this.notices.show({
        icon: this.typeIcon(n.type),
        label: 'From your notifications',
        text: this.sentence(n)
      });
      this.router.navigate(commands, extras);
    };

    // Last resort, used by both steps below: the section the notification belongs to.
    const toSection = () => {
      switch (topic.kind) {
        case 'task':    arrive(['/tasks']); break;
        case 'mention': arrive(['/mentions']); break;
        case 'event':   arrive(['/calendar']); break;
        case 'account': arrive(['/settings']); break;
        case 'person':  arrive(n.triggeredByUserId ? ['/profile', n.triggeredByUserId] : ['/friends']); break;
        case 'project':
          // No page lists every project; the Projects panel does.
          this.openingId.set(null);
          this.notices.show({
            icon: this.typeIcon(n.type), label: 'From your notifications', text: this.sentence(n)
          });
          this.uiService.toggleProjects(true);
          break;
        default:
          // Nothing to open: the row itself is the whole message.
          this.openingId.set(null);
      }
    };

    // 1. The notification names its target outright: a task, a project, a calendar
    //    event (opened on the calendar) or a person.
    const target = notificationTarget(n);
    if (target) {
      arrive(target.commands, target.queryParams ? { queryParams: target.queryParams } : {});
      return;
    }

    // 2. No target on the notification (older ones were stored without one): find
    //    the task or project it names. Dropping the user on a whole list left them
    //    to work out which item the notification meant.
    if ((topic.kind === 'task' || topic.kind === 'project' || topic.kind === 'mention') && topic.name) {
      this.openingId.set(n.id);
      forkJoin({
        tasks: this.taskService.getTasks().pipe(catchError(() => of([] as TaskDto[]))),
        groups: this.groupService.getGroups().pipe(catchError(() => of([] as GroupDto[])))
      }).subscribe(({ tasks, groups }) => {
        const wanted = topic.name!.trim().toLowerCase();
        const task = tasks.find(t => (t.title ?? '').trim().toLowerCase() === wanted);
        const group = groups.find(g => (g.name ?? '').trim().toLowerCase() === wanted);

        if (topic.kind !== 'project' && task) arrive(['/tasks', task.id]);
        else if (group) arrive(['/projects', group.id]);
        else if (task) arrive(['/tasks', task.id]);
        else toSection();
      });
      return;
    }

    // 3. Nothing more specific than the section it belongs to.
    toSection();
  }

  // ── Read state ─────────────────────────────────────────────────────────────

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

  // ── What a notification is about ───────────────────────────────────────────

  /**
   * The topic of a notification: its kind and, when it can be told, the name of
   * the task / project / person. The API sends the name with new notifications
   * (`linkedEntityName`); for older ones it is read out of the message, which
   * quotes it ("Your task 'Launch email campaign' is due in 2 days").
   */
  topic(n: NotificationDto): NotificationTopic {
    const type = n.type ?? '';
    const text = `${n.title ?? ''} ${n.message ?? ''}`;
    const entity = (n.linkedEntityType ?? '').toLowerCase();
    const linkedName = n.linkedEntityName?.trim() || undefined;

    if (/profile (was|has been) updated/i.test(text)) {
      return { kind: 'account', label: 'Your account', icon: 'manage_accounts' };
    }
    if (entity === 'friendship' || type.startsWith('Friend') || type === 'UserBlocked') {
      const label = type === 'FriendRequestSent' ? 'Friend request'
        : type === 'FriendRequestAccepted' ? 'New friend'
        : 'Friends';
      return { kind: 'person', label, icon: 'people', name: n.triggeredByUserName?.trim() || undefined };
    }
    // Event news, and a reminder set on an event. (A reminder set on a task is
    // linked to the task and is caught by the task branch below.)
    if (entity.includes('event') || type.startsWith('Event')) {
      return { kind: 'event', label: 'Event', icon: 'event', name: linkedName ?? this.nameIn(n, t => this.quotedIn(t)) };
    }
    if (entity === 'group' || type.startsWith('Group')) {
      return {
        kind: 'project', label: 'Project', icon: 'folder_special',
        name: linkedName ?? this.nameIn(n, t => this.projectNameIn(t))
      };
    }
    if (type.includes('Mention')) {
      // A mention in a task carries the task; otherwise the message names the project.
      const name = linkedName
        ?? this.nameIn(n, t => this.quotedIn(t))
        ?? this.nameIn(n, t => this.projectNameIn(t));
      return { kind: 'mention', label: 'Mention', icon: 'alternate_email', name };
    }
    if (entity === 'taskitem' || type.startsWith('Task')) {
      return { kind: 'task', label: 'Task', icon: 'task_alt', name: linkedName ?? this.nameIn(n, t => this.taskNameIn(t)) };
    }
    return { kind: 'other', label: this.typeLabel(type), icon: this.typeIcon(type) };
  }

  /**
   * Reads a name out of the message, or failing that the title - one at a time.
   * Joined into one string, a pattern that runs to the end of the title ("Task
   * Assigned: X") carried on through the message and returned both.
   */
  private nameIn(n: NotificationDto, read: (text: string) => string | undefined): string | undefined {
    for (const part of [n.message, n.title]) {
      const found = part ? read(part.trim()) : undefined;
      if (found) return found;
    }
    return undefined;
  }

  /** 'Launch email campaign' out of "Your task 'Launch email campaign' is due in 2 days". */
  private quotedIn(text: string): string | undefined {
    // Double quotes first: event and reminder messages use them ("Sam's birthday"
    // starts in 10 minutes), and the name inside may itself hold an apostrophe.
    return (/["“]([^"”]{2,})["”]/.exec(text) ?? /['‘]([^'’]{2,})['’]/.exec(text))?.[1]?.trim();
  }

  private taskNameIn(text: string): string | undefined {
    return this.quotedIn(text)
      // "You have been assigned task: Social media content"
      ?? /\btask(?: assigned)?:\s*(.+?)\s*$/i.exec(text.trim())?.[1]?.trim();
  }

  /** "Marketing Squad" out of "Carlos joined the Marketing Squad group". */
  private projectNameIn(text: string): string | undefined {
    return /\bthe\s+(.+?)\s+(?:group|project)\b/i.exec(text)?.[1]?.trim();
  }

  /**
   * The message without the actor's name in front. The row prints the name in
   * bold already, and the API's text starts with it too, which read as
   * "Test User Test User sent you a friend request."
   */
  body(n: NotificationDto): string {
    const text = (n.message || n.title || '').trim();
    const actor = n.triggeredByUserName?.trim();
    if (actor && text.toLowerCase().startsWith(actor.toLowerCase())) {
      return text.slice(actor.length).trim();
    }
    return text;
  }

  /** The whole notification as one sentence, for the note shown after opening it. */
  private sentence(n: NotificationDto): string {
    return (n.message || n.title || 'Notification').trim();
  }

  // ── Display helpers ────────────────────────────────────────────────────────

  private styleFor(type?: string): TypeStyle {
    return this.typeStyles[type ?? ''] ?? this.fallbackStyle;
  }

  typeIcon(type?: string): string { return this.styleFor(type).icon; }
  typeColor(type?: string): string { return this.styleFor(type).color; }
  typeLabel(type?: string): string { return this.styleFor(type).label; }

  /** The actor's picture, unless it is missing or failed to load. */
  avatarUrl(n: NotificationDto): string | null {
    const url = n.triggeredByUserProfilePictureUrl;
    return url && !this.brokenAvatars().has(n.id) ? url : null;
  }

  onAvatarError(n: NotificationDto) {
    this.brokenAvatars.update(set => new Set(set).add(n.id));
  }

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
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;

    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    if (diffDay < 365) return `${Math.floor(diffDay / 7)}w ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /** Full date and time, for the tooltip on the relative time. */
  fullTime(dateStr: string): string {
    const date = new Date(dateStr);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
  }

  trackById(_index: number, n: NotificationDto): string {
    return n.id;
  }
}
