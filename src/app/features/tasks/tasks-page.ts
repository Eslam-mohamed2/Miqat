import { Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import {
  CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList, CdkDropListGroup
} from '@angular/cdk/drag-drop';
import { TaskService } from '../../core/services/task.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { GroupService } from '../../core/services/group.service';
import { GroupDto, TaskDto } from '../../models/api.models';
import { TaskWindowComponent } from '../dashboard/task-window/task-window';
import { apiErrorMessage } from '../../core/http/api-error';

export type ViewMode = 'list' | 'kanban';
type SortKey = 'title' | 'status' | 'priority' | 'dueDate';

interface StatusColumn {
  /** Exactly the string the API stores — see TaskStatus in the backend enum. */
  value: string;
  label: string;
  color: string;
}

const VIEW_STORAGE_KEY = 'miqat.tasks.view';

@Component({
  selector: 'app-tasks-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule, MatDialogModule,
    CdkDropListGroup, CdkDropList, CdkDrag, CdkDragPlaceholder
  ],
  templateUrl: './tasks-page.html',
  styleUrl: './tasks-page.scss'
})
export class TasksPage implements OnInit {
  private taskService = inject(TaskService);
  private groupService = inject(GroupService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private realtime = inject(RealtimeService);
  private destroyRef = inject(DestroyRef);

  /**
   * Values match the backend TaskStatus enum exactly (`In_progress`, `On_hold`),
   * because that is what the API both emits and accepts. Labels are the display
   * form; never send a label back.
   */
  readonly statuses: StatusColumn[] = [
    { value: 'Pending',     label: 'Pending',     color: '#f4a835' },
    { value: 'In_progress', label: 'In Progress', color: '#7c8ef5' },
    { value: 'Completed',   label: 'Completed',   color: '#2ec4a0' },
    { value: 'On_hold',     label: 'On Hold',     color: '#8b8b8b' },
    { value: 'Cancelled',   label: 'Cancelled',   color: '#ef4444' }
  ];

  readonly priorities = ['Low', 'Medium', 'High', 'Critical'];

  tasks = signal<TaskDto[]>([]);
  groups = signal<GroupDto[]>([]);
  loading = signal(true);
  errorMessage = signal('');

  view = signal<ViewMode>(this.restoreView());
  search = signal('');
  priorityFilter = signal('All');
  groupFilter = signal('All');

  sortKey = signal<SortKey>('dueDate');
  sortAsc = signal(true);

  /** Ids with an in-flight status write, so a card can show it is saving. */
  savingIds = signal<ReadonlySet<string>>(new Set());

  filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const priority = this.priorityFilter();
    const group = this.groupFilter();

    return this.tasks().filter(t => {
      if (priority !== 'All' && t.priority !== priority) return false;
      if (group !== 'All' && t.groupId !== group) return false;
      if (!term) return true;
      return (t.title ?? '').toLowerCase().includes(term)
        || (t.description ?? '').toLowerCase().includes(term)
        || (t.tags ?? '').toLowerCase().includes(term);
    });
  });

  /** One bucket per status, in board order. */
  columns = computed(() =>
    this.statuses.map(status => ({
      ...status,
      tasks: this.filtered().filter(t => t.status === status.value)
    }))
  );

  /** Anything whose status is not one of the five known values. */
  unknownStatusCount = computed(() => {
    const known = new Set(this.statuses.map(s => s.value));
    return this.filtered().filter(t => !known.has(t.status)).length;
  });

  sorted = computed(() => {
    const key = this.sortKey();
    const dir = this.sortAsc() ? 1 : -1;

    // Priority and status sort by their real order, not alphabetically —
    // "Critical" before "Low" is the only ordering that means anything here.
    const priorityRank = new Map(this.priorities.map((p, i) => [p, i]));
    const statusRank = new Map(this.statuses.map((s, i) => [s.value, i]));

    return [...this.filtered()].sort((a, b) => {
      let result: number;
      switch (key) {
        case 'priority':
          result = (priorityRank.get(a.priority) ?? -1) - (priorityRank.get(b.priority) ?? -1);
          break;
        case 'status':
          result = (statusRank.get(a.status) ?? -1) - (statusRank.get(b.status) ?? -1);
          break;
        case 'dueDate':
          result = this.dueValue(a.dueDate) - this.dueValue(b.dueDate);
          break;
        default:
          result = (a.title ?? '').localeCompare(b.title ?? '');
      }
      return result * dir;
    });
  });

  stats = computed(() => {
    const all = this.filtered();
    const done = all.filter(t => t.status === 'Completed').length;
    return {
      total: all.length,
      done,
      overdue: all.filter(t => this.isOverdue(t)).length,
      percent: all.length ? Math.round((done / all.length) * 100) : 0
    };
  });

  ngOnInit() {
    this.loadTasks();
    this.loadGroups();

    // A teammate creating, moving or deleting a task re-syncs the board live.
    // A full reload is deliberate: the event only says *something* changed, and
    // refetching is cheap next to reconciling partial state.
    this.realtime.taskChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadTasks(true));
  }

  /** `silent` skips the skeleton — used for live re-syncs behind a full board. */
  loadTasks(silent = false) {
    if (!silent) this.loading.set(true);
    this.errorMessage.set('');
    // getTasks() hits /api/Task, which is scoped to the signed-in user.
    // getAllTasks() (/api/Task/all) is [Authorize(Roles = "Admin")] and 403s
    // for everyone else, so it is not usable here.
    this.taskService.getTasks().subscribe({
      next: data => {
        this.tasks.set(data ?? []);
        this.loading.set(false);
      },
      error: err => {
        this.tasks.set([]);
        this.errorMessage.set(apiErrorMessage(err, 'Could not load tasks.'));
        this.loading.set(false);
      }
    });
  }

  private loadGroups() {
    this.groupService.getGroups().subscribe({
      next: data => this.groups.set(data ?? []),
      error: () => this.groups.set([])
    });
  }

  setView(mode: ViewMode) {
    this.view.set(mode);
    try {
      localStorage?.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      // Private mode or storage disabled — the choice just will not persist.
    }
  }

  private restoreView(): ViewMode {
    try {
      return localStorage?.getItem(VIEW_STORAGE_KEY) === 'kanban' ? 'kanban' : 'list';
    } catch {
      return 'list';
    }
  }

  sortBy(key: SortKey) {
    if (this.sortKey() === key) {
      this.sortAsc.update(v => !v);
    } else {
      this.sortKey.set(key);
      this.sortAsc.set(true);
    }
  }

  /**
   * Moves a card to another column and persists the new status.
   *
   * The list is updated first so the card lands immediately, then reverted if the
   * write fails — dragging should never leave the board showing something the
   * server did not accept.
   */
  onDrop(event: CdkDragDrop<TaskDto[]>, newStatus: string) {
    const task = event.item.data as TaskDto | undefined;
    if (task) this.changeStatus(task, newStatus);
  }

  /** The status dropdown in list view — same move, without needing a pointer. */
  moveTo(task: TaskDto, newStatus: string) {
    this.changeStatus(task, newStatus);
  }

  private changeStatus(task: TaskDto, newStatus: string) {
    if (task.status === newStatus) return;

    const previousStatus = task.status;
    this.applyStatus(task.id, newStatus);
    this.markSaving(task.id, true);
    this.errorMessage.set('');

    this.taskService.updateTask(task.id, { ...task, status: newStatus }).subscribe({
      next: () => this.markSaving(task.id, false),
      error: err => {
        this.applyStatus(task.id, previousStatus);
        this.markSaving(task.id, false);
        this.errorMessage.set(apiErrorMessage(err, 'Could not move that task.'));
      }
    });
  }

  private applyStatus(id: string, status: string) {
    this.tasks.update(list => list.map(t => (t.id === id ? { ...t, status } : t)));
  }

  private markSaving(id: string, saving: boolean) {
    this.savingIds.update(current => {
      const next = new Set(current);
      if (saving) next.add(id); else next.delete(id);
      return next;
    });
  }

  isSaving(id: string): boolean {
    return this.savingIds().has(id);
  }

  openCreate() {
    const ref = this.dialog.open(TaskWindowComponent, {
      width: '600px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container',
      autoFocus: false
    });
    ref.afterClosed().subscribe(result => {
      if (result) this.loadTasks();
    });
  }

  /**
   * Opening a task now means the full page, not the modal — the discussion,
   * the people who can see it and the mention box do not fit in a dialog. The
   * dialog stays reachable from the row's edit button for a quick field change.
   */
  openTask(task: TaskDto) {
    this.router.navigate(['/tasks', task.id]);
  }

  openEdit(task: TaskDto, event?: Event) {
    event?.stopPropagation();
    const ref = this.dialog.open(TaskWindowComponent, {
      width: '600px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container',
      autoFocus: false,
      data: { task }
    });
    ref.afterClosed().subscribe(result => {
      if (result) this.loadTasks();
    });
  }

  deleteTask(task: TaskDto, event?: Event) {
    event?.stopPropagation();
    if (!confirm(`Delete "${task.title}"?`)) return;

    const snapshot = this.tasks();
    this.tasks.update(list => list.filter(t => t.id !== task.id));
    this.taskService.deleteTask(task.id).subscribe({
      error: err => {
        this.tasks.set(snapshot);
        this.errorMessage.set(apiErrorMessage(err, 'Could not delete that task.'));
      }
    });
  }

  clearFilters() {
    this.search.set('');
    this.priorityFilter.set('All');
    this.groupFilter.set('All');
  }

  hasActiveFilters(): boolean {
    return !!this.search().trim() || this.priorityFilter() !== 'All' || this.groupFilter() !== 'All';
  }

  // ── display helpers ────────────────────────────────────────────────────────

  statusLabel(value: string): string {
    return this.statuses.find(s => s.value === value)?.label ?? value ?? 'Unknown';
  }

  statusColor(value: string): string {
    return this.statuses.find(s => s.value === value)?.color ?? '#8b8b8b';
  }

  priorityColor(priority: string): string {
    switch (priority) {
      case 'Critical': return '#ef4444';
      case 'High':     return '#f4845f';
      case 'Medium':   return '#f4a835';
      default:         return '#2ec4a0';
    }
  }

  groupName(task: TaskDto): string {
    if (task.groupName) return task.groupName;
    return this.groups().find(g => g.id === task.groupId)?.name ?? '';
  }

  isOverdue(task: TaskDto): boolean {
    if (!task.dueDate || task.status === 'Completed' || task.status === 'Cancelled') return false;
    return new Date(task.dueDate).getTime() < Date.now();
  }

  formatDue(dateStr: string): string {
    if (!dateStr) return 'No due date';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return 'No due date';

    const today = new Date();
    const days = Math.round(
      (this.startOfDay(date) - this.startOfDay(today)) / 86_400_000
    );

    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days === -1) return 'Yesterday';
    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days <= 7) return `In ${days}d`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  tagList(tags: string): string[] {
    return (tags ?? '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  trackById(_index: number, task: TaskDto): string {
    return task.id;
  }

  private startOfDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  /** Missing due dates sort last rather than to 1970. */
  private dueValue(dateStr: string): number {
    if (!dateStr) return Number.MAX_SAFE_INTEGER;
    const value = new Date(dateStr).getTime();
    return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
  }
}
