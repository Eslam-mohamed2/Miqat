import {
  Component, ChangeDetectionStrategy, Input, Output, EventEmitter,
  OnChanges, SimpleChanges, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { NotificationService } from '../../core/services/notification.service';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { NotificationDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';
import { notificationTarget } from '../../core/utils/notification-target';

/** Icon and colour per family of notification type the API sends. */
const TYPE_LOOKS: { test: (type: string) => boolean; icon: string; color: string }[] = [
  { test: type => type === 'Reminder' || type === 'TaskDueSoon', icon: 'alarm',           color: '#f4845f' },
  { test: type => type === 'EventCancelled',                     icon: 'event_busy',      color: '#ef4444' },
  { test: type => type.startsWith('Event'),                      icon: 'event',           color: '#7c8ef5' },
  { test: type => type.includes('Mention'),                      icon: 'alternate_email', color: '#f4a835' },
  { test: type => type.startsWith('Task'),                       icon: 'task_alt',        color: '#2ec4a0' },
  { test: type => type.startsWith('Group'),                      icon: 'group_add',       color: '#7c8ef5' },
  { test: type => type.startsWith('Friend'),                     icon: 'person_add',      color: '#7c8ef5' }
];
const DEFAULT_LOOK = { icon: 'notifications', color: '#888888' };

@Component({
  selector: 'app-notification-panel',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './notification-panel.html',
  styleUrl: './notification-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms cubic-bezier(0.4,0,0.2,1)', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('250ms cubic-bezier(0.4,0,0.2,1)', style({ transform: 'translateX(100%)', opacity: 0 }))
      ])
    ]),
    trigger('fadeBackdrop', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease', style({ opacity: 0 }))
      ])
    ]),
    trigger('listAnim', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(-12px)' }),
          stagger('50ms', [
            animate('250ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ]),
    trigger('itemLeave', [
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateX(40px)', height: '0', margin: '0', padding: '0' }))
      ])
    ])
  ]
})
export class NotificationPanel implements OnChanges {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();

  private notificationService = inject(NotificationService);
  private router = inject(Router);

  notifications = signal<NotificationDto[]>([]);
  loading = signal(true);
  errorMessage = signal('');
  dismissedIds = signal<Set<string>>(new Set());

  visibleNotifications = computed(() => {
    const dismissed = this.dismissedIds();
    return this.notifications().filter(n => !dismissed.has(n.id));
  });

  unreadCount = computed(() => this.visibleNotifications().filter(n => !n.isRead).length);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isOpen']?.currentValue === true) {
      this.loadNotifications();
    }
  }

  loadNotifications() {
    this.loading.set(true);
    this.errorMessage.set('');
    this.notificationService.getNotifications().subscribe({
      next: (data) => {
        this.notifications.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        // Previously this substituted invented notifications, which made an outage
        // look like a working feed. Surface the failure instead.
        this.notifications.set([]);
        this.errorMessage.set(apiErrorMessage(err, 'Could not load notifications.'));
        this.loading.set(false);
      }
    });
  }

  markAsRead(id: string) {
    this.notificationService.markAsRead(id).subscribe();
    this.notifications.update(list =>
      list.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
  }

  markAllRead() {
    this.notificationService.markAllAsRead().subscribe();
    this.notifications.update(list => list.map(n => ({ ...n, isRead: true })));
  }

  dismiss(id: string) {
    this.notificationService.deleteNotification(id).subscribe();
    this.dismissedIds.update(s => new Set([...s, id]));
  }

  close() {
    this.closed.emit();
  }

  /**
   * Marks the notification read and opens what it is about - the same place the
   * notifications page takes it. One that names nothing opens that page instead.
   */
  open(n: NotificationDto) {
    if (!n.isRead) this.markAsRead(n.id);
    const target = notificationTarget(n);
    this.close();
    if (target) this.router.navigate(target.commands, target.queryParams ? { queryParams: target.queryParams } : {});
    else this.router.navigate(['/notifications']);
  }

  viewAll() {
    this.close();
    this.router.navigate(['/notifications']);
  }

  // The three helpers below used to be keyed by 'task' / 'mention' / 'system',
  // names the API never sends, so every row got the same grey bell.
  private look(type?: string) {
    return TYPE_LOOKS.find(entry => entry.test(type ?? '')) ?? DEFAULT_LOOK;
  }

  getTypeIcon(type?: string): string {
    return this.look(type).icon;
  }

  getTypeColor(type?: string): string {
    return this.look(type).color;
  }

  /** The type's colour at 12%, behind its icon. */
  getTypeBg(type?: string): string {
    return `color-mix(in srgb, ${this.look(type).color} 12%, transparent)`;
  }

  formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  }
}
