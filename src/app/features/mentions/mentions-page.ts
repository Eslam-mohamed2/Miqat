import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MentionService } from '../../core/services/mention.service';
import { UiService } from '../../core/services/ui.service';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';
import { Router } from '@angular/router';

export interface Mention {
  id: string;
  mentionedByUserName: string;
  entityName: string;
  entityType?: number | string;
  entityId?: string;
  isRead: boolean;
  createdAt: string;
}

@Component({
  selector: 'app-mentions-page',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './mentions-page.html',
  styleUrl: './mentions-page.scss',
  animations: [
    trigger('listAnim', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(-12px)' }),
          stagger('50ms', [
            animate('250ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ])
  ]
})
export class MentionsPage implements OnInit {
  private mentionService = inject(MentionService);
  private router = inject(Router);
  private uiService = inject(UiService);

  mentions = signal<Mention[]>([]);
  loading = signal(true);

  unreadCount = computed(() => this.mentions().filter(m => !m.isRead).length);

  ngOnInit() {
    this.loadMentions();
  }

  loadMentions() {
    this.loading.set(true);
    this.mentionService.getMentions().subscribe({
      next: (data: any[]) => {
        this.mentions.set(data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.mentions.set(this.getMockMentions());
        this.loading.set(false);
      }
    });
  }

  markAsReadAndNavigate(mention: Mention) {
    if (!mention.isRead) {
      this.mentionService.markMentionAsRead(mention.id).subscribe();
      this.mentions.update(list =>
        list.map(m => m.id === mention.id ? { ...m, isRead: true } : m)
      );
    }
    this.navigateToMentionTarget(mention);
  }

  navigateToMentionTarget(mention: Mention) {
    if (!mention.entityId) return;

    const type = String(mention.entityType ?? '').toLowerCase();
    if (type === '2' || type === 'group' || type === 'project') {
      this.uiService.openProjectDetails(mention.entityId);
      return;
    }

    this.router.navigate(['/dashboard']);
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

  private getMockMentions(): Mention[] {
    return [
      { id: '1', mentionedByUserName: 'Ahmed', entityName: 'Website Redesign', entityType: 'project', entityId: '1', isRead: false, createdAt: new Date(Date.now() - 5 * 60000).toISOString() },
      { id: '2', mentionedByUserName: 'Sara', entityName: 'Bug #1042', entityType: 'task', entityId: '2', isRead: false, createdAt: new Date(Date.now() - 30 * 60000).toISOString() },
      { id: '3', mentionedByUserName: 'Omar', entityName: 'Sprint Planning', entityType: 'project', entityId: '3', isRead: true, createdAt: new Date(Date.now() - 3 * 3600000).toISOString() }
    ];
  }
}
