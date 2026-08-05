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
import { GroupDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';

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

  groups = signal<GroupDto[]>([]);
  loading = signal(true);
  errorMessage = signal('');
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
    this.errorMessage.set('');
    this.groupService.getGroups().subscribe({
      next: (data) => {
        this.groups.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        // Invented projects used to appear here on failure, which is worse than
        // showing nothing — they look real and are not.
        this.groups.set([]);
        this.errorMessage.set(apiErrorMessage(err, 'Could not load projects.'));
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

  /**
   * A group's colour, or the shared default when the API sends none.
   * The template appends opacity suffixes to this ('22', '33', '44'), so a null
   * would render as the literal CSS value "null33" rather than falling back.
   */
  getColor(group: GroupDto): string {
    return group.color || '#2ec4a0';
  }
}
