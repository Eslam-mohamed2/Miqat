import {
  Component, ChangeDetectionStrategy, Input, Output, EventEmitter,
  OnChanges, SimpleChanges, inject, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { NotificationService } from '../../core/services/notification.service';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';

export interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  type?: string; // 'task' | 'mention' | 'system' | 'reminder'
}

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

  notifications = signal<Notification[]>([]);
  loading = signal(true);
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
    this.notificationService.getNotifications().subscribe({
      next: (data: any[]) => {
        this.notifications.set(data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.notifications.set(this.getMockNotifications());
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

  getTypeIcon(type?: string): string {
    const icons: Record<string, string> = {
      task: 'task_alt',
      mention: 'alternate_email',
      system: 'info',
      reminder: 'alarm',
    };
    return icons[type ?? 'system'] ?? 'notifications';
  }

  getTypeColor(type?: string): string {
    const colors: Record<string, string> = {
      task: '#2ec4a0',
      mention: '#7c8ef5',
      system: '#f4a835',
      reminder: '#f4845f',
    };
    return colors[type ?? 'system'] ?? '#888';
  }

  getTypeBg(type?: string): string {
    const bgs: Record<string, string> = {
      task: 'rgba(46,196,160,0.12)',
      mention: 'rgba(124,142,245,0.12)',
      system: 'rgba(244,168,53,0.12)',
      reminder: 'rgba(244,132,95,0.12)',
    };
    return bgs[type ?? 'system'] ?? 'rgba(136,136,136,0.12)';
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

  private getMockNotifications(): Notification[] {
    return [
      { id: '1', title: 'Task assigned to you', message: 'Design Sprint planning assigned by Ahmed', isRead: false, createdAt: new Date(Date.now() - 5 * 60000).toISOString(), type: 'task' },
      { id: '2', title: 'You were mentioned', message: '@you in "Website Redesign" discussion', isRead: false, createdAt: new Date(Date.now() - 30 * 60000).toISOString(), type: 'mention' },
      { id: '3', title: 'Reminder', message: 'Sprint review starts in 1 hour', isRead: false, createdAt: new Date(Date.now() - 60 * 60000).toISOString(), type: 'reminder' },
      { id: '4', title: 'Project update', message: 'Mobile App v2 moved to In Progress', isRead: true, createdAt: new Date(Date.now() - 3 * 3600000).toISOString(), type: 'system' },
      { id: '5', title: 'New comment', message: 'Sara commented on your task', isRead: true, createdAt: new Date(Date.now() - 5 * 3600000).toISOString(), type: 'mention' },
    ];
  }
}
