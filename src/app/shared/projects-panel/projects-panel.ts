import {
  Component, ChangeDetectionStrategy, Input, Output, EventEmitter,
  OnChanges, SimpleChanges, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { GroupService } from '../../core/services/group.service';
import { UiService } from '../../core/services/ui.service';
import { CreateProjectDialog } from '../create-project-dialog/create-project-dialog';
import { trigger, transition, style, animate, query, stagger } from '@angular/animations';

@Component({
  selector: 'app-projects-panel',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatDialogModule],
  templateUrl: './projects-panel.html',
  styleUrl: './projects-panel.scss',
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
    trigger('cardStagger', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(16px)' }),
          stagger('60ms', [
            animate('280ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ])
  ]
})
export class ProjectsPanel implements OnChanges {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  @Output() projectCreated = new EventEmitter<any>();

  private groupService = inject(GroupService);
  private dialog = inject(MatDialog);
  public uiService = inject(UiService);

  groups = signal<any[]>([]);
  loading = signal(true);
  searchQuery = signal('');

  filteredGroups = () => {
    const q = this.searchQuery().toLowerCase();
    if (!q) return this.groups();
    return this.groups().filter(g =>
      g.name?.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q)
    );
  };

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isOpen']?.currentValue === true) {
      this.loadGroups();
    }
  }

  loadGroups() {
    this.loading.set(true);
    this.groupService.getGroups().subscribe({
      next: (data: any[]) => {
        this.groups.set(data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.groups.set(this.getMockGroups());
        this.loading.set(false);
      }
    });
  }

  openCreateDialog() {
    const ref = this.dialog.open(CreateProjectDialog, {
      panelClass: 'custom-dialog-container',
      disableClose: true,
      autoFocus: false
    });

    ref.afterClosed().subscribe(result => {
      if (result) {
        this.groups.update(list => [result, ...list]);
        this.projectCreated.emit(result);
      }
    });
  }

  close() {
    this.closed.emit();
  }

  getInitials(name: string): string {
    return (name ?? '').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  getStatusLabel(group: any): string {
    return group.status ?? 'Active';
  }

  getStatusColor(group: any): string {
    const map: Record<string, string> = {
      Active: '#2ec4a0',
      Paused: '#f4a835',
      Completed: '#7c8ef5',
      Archived: '#555'
    };
    return map[group.status ?? 'Active'] ?? '#2ec4a0';
  }

  private getMockGroups(): any[] {
    return [
      { id: '1', name: 'Website Redesign', description: 'Full overhaul of the marketing site', color: '#2ec4a0', memberCount: 5, taskCount: 12, status: 'Active', createdAt: '2026-03-01' },
      { id: '2', name: 'Mobile App v2', description: 'Next generation mobile experience', color: '#7c8ef5', memberCount: 4, taskCount: 8, status: 'Active', createdAt: '2026-03-15' },
      { id: '3', name: 'API Integration', description: 'Backend connectivity and data sync', color: '#f4a835', memberCount: 3, taskCount: 5, status: 'Paused', createdAt: '2026-02-20' },
      { id: '4', name: 'Brand Identity', description: 'Visual guidelines and assets', color: '#fb7185', memberCount: 2, taskCount: 6, status: 'Completed', createdAt: '2026-01-10' },
    ];
  }
}
