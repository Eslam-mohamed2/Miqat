import {
  ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges,
  computed, inject, signal
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { AuthService } from '../../core/services/auth.service';
import { GroupService } from '../../core/services/group.service';
import { UiService } from '../../core/services/ui.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { GroupDto } from '../../models/api.models';
import { CreateProjectDialog } from '../create-project-dialog/create-project-dialog';
import { formatNumber, isArabic, t, tCount } from '../../core/i18n/i18n';
import { TCountPipe, TPipe } from '../../core/i18n/t.pipe';

/**
 * The projects drawer: every project the user owns or belongs to, with its real
 * progress, a search box and "New project". The app shell mounts it once and
 * anything opens it through `UiService.toggleProjects()`.
 */
@Component({
  selector: 'app-projects-panel',
  standalone: true,
  imports: [TPipe, TCountPipe],
  templateUrl: './projects-panel.html',
  styleUrl: './projects-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectsPanel implements OnChanges {
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  @Output() projectCreated = new EventEmitter<GroupDto>();

  private groupService = inject(GroupService);
  private readonly myId = inject(AuthService).getCurrentUserId();
  private dialog = inject(MatDialog);
  public uiService = inject(UiService);

  groups = signal<GroupDto[]>([]);
  loading = signal(true);
  errorMessage = signal('');
  searchQuery = signal('');

  readonly filteredGroups = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return this.groups();
    return this.groups().filter(group =>
      group.name?.toLowerCase().includes(query) || group.description?.toLowerCase().includes(query));
  });

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isOpen']?.currentValue === true) {
      this.searchQuery.set('');
      this.loadGroups();
    }
  }

  loadGroups() {
    this.loading.set(true);
    this.errorMessage.set('');
    this.groupService.getGroups().subscribe({
      next: (data) => {
        this.groups.set(data ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        // Nothing is shown rather than anything invented: a made-up project looks real.
        this.groups.set([]);
        this.errorMessage.set(apiErrorMessage(err, t('Could not load projects.')));
        this.loading.set(false);
      }
    });
  }

  openCreateDialog() {
    const ref = this.dialog.open(CreateProjectDialog, {
      width: '560px',
      maxWidth: '95vw',
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

  open(group: GroupDto) {
    this.uiService.openProjectDetails(group.id);
  }

  close() {
    this.closed.emit();
  }

  /** Completed count, tolerating an older API that does not send it. */
  completed(group: GroupDto): number {
    return group.completedTaskCount ?? 0;
  }

  percent(group: GroupDto): number {
    if (!group.taskCount) return 0;
    return Math.round((this.completed(group) / group.taskCount) * 100);
  }

  /** "40%", in the chosen digits and with the language's percent sign. */
  percentLabel(group: GroupDto): string {
    return formatNumber(this.percent(group) / 100, { style: 'percent', maximumFractionDigits: 0 });
  }

  /** "Owned by you · 4 members · 12 tasks" */
  meta(group: GroupDto): string {
    const owner = !!this.myId && group.ownerId === this.myId ? t('Owned by you') : this.ownerName(group);
    const members = tCount(group.memberCount, '{n} member', '{n} members');
    const tasks = tCount(group.taskCount, '{n} task', '{n} tasks');
    return [owner, members, tasks].join(' · ');
  }

  /**
   * In an Arabic line a Latin name would otherwise pull the count after it to its own
   * side: the name is isolated (U+2068 … U+2069) so each piece of the line keeps its place.
   */
  private ownerName(group: GroupDto): string {
    if (!group.ownerName) return t('Unknown owner');
    return isArabic() ? '\u2068' + group.ownerName + '\u2069' : group.ownerName;
  }

  textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    // A dialog opened from the drawer takes Escape first.
    if (this.isOpen && !document.querySelector('.cdk-overlay-pane')) this.close();
  }
}
