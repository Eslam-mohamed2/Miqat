import { Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { GroupService } from '../../core/services/group.service';
import { TaskService } from '../../core/services/task.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { FriendService } from '../../core/services/friend.service';
import { AuthService } from '../../core/services/auth.service';
import { TaskWindowComponent } from '../dashboard/task-window/task-window';
import { GroupDto, MemberDto, TaskDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';

type ViewMode = 'table' | 'board';
type GroupBy = 'none' | 'status' | 'assignee';

interface StatusMeta { value: string; label: string; color: string; }

@Component({
  selector: 'app-project-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatDialogModule, RouterLink],
  templateUrl: './project-page.html',
  styleUrl: './project-page.scss'
})
export class ProjectPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private groupService = inject(GroupService);
  private taskService = inject(TaskService);
  private friendService = inject(FriendService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);
  private realtime = inject(RealtimeService);
  private destroyRef = inject(DestroyRef);

  /** Values match the backend TaskStatus enum exactly. */
  readonly statuses: StatusMeta[] = [
    { value: 'Pending',     label: 'Pending',     color: '#f4a835' },
    { value: 'In_progress', label: 'In Progress', color: '#7c8ef5' },
    { value: 'Completed',   label: 'Completed',   color: '#2ec4a0' },
    { value: 'On_hold',     label: 'On Hold',     color: '#8b8b8b' },
    { value: 'Cancelled',   label: 'Cancelled',   color: '#ef4444' }
  ];

  readonly priorities = ['Low', 'Medium', 'High', 'Critical'];

  projectId = signal('');
  project = signal<GroupDto | null>(null);
  tasks = signal<TaskDto[]>([]);
  members = signal<MemberDto[]>([]);
  /** Friends, used as the pool of people who can be added to the project. */
  allUsers = signal<{ id: string; name: string }[]>([]);

  loading = signal(true);
  errorMessage = signal('');
  savingIds = signal<ReadonlySet<string>>(new Set());

  view = signal<ViewMode>('table');
  groupBy = signal<GroupBy>('status');
  search = signal('');
  statusFilter = signal('All');
  activeSection = signal<'tasks' | 'members'>('tasks');

  isEditingHeader = signal(false);
  headerDraft = { name: '', description: '', color: '#2ec4a0' };

  // ── Derived ────────────────────────────────────────────────────────────────

  filteredTasks = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();

    return this.tasks().filter(task => {
      if (status !== 'All' && task.status !== status) return false;
      if (!term) return true;
      return (task.title ?? '').toLowerCase().includes(term)
        || (task.tags ?? '').toLowerCase().includes(term)
        || (task.assignedToUserName ?? '').toLowerCase().includes(term);
    });
  });

  /**
   * The table's row groups. Notion always shows every configured group even when
   * empty, so a column you can drop into never disappears.
   */
  tableGroups = computed(() => {
    const tasks = this.filteredTasks();

    if (this.groupBy() === 'status') {
      return this.statuses.map(status => ({
        key: status.value,
        title: status.label,
        color: status.color,
        tasks: tasks.filter(t => t.status === status.value)
      }));
    }

    if (this.groupBy() === 'assignee') {
      const names = Array.from(new Set(tasks.map(t => t.assignedToUserName || 'Unassigned')));
      return names.sort().map(name => ({
        key: name,
        title: name,
        color: '#7c8ef5',
        tasks: tasks.filter(t => (t.assignedToUserName || 'Unassigned') === name)
      }));
    }

    return [{ key: 'all', title: 'All tasks', color: '#2ec4a0', tasks }];
  });

  boardColumns = computed(() =>
    this.statuses.map(status => ({
      ...status,
      tasks: this.filteredTasks().filter(t => t.status === status.value)
    }))
  );

  stats = computed(() => {
    const all = this.tasks();
    const done = all.filter(t => t.status === 'Completed').length;
    return {
      total: all.length,
      done,
      overdue: all.filter(t => this.isOverdue(t)).length,
      percent: all.length ? Math.round((done / all.length) * 100) : 0
    };
  });

  /**
   * Who can be assigned a task: the project's own members. That is the correct
   * semantics for a team board — you hand work to people on the project — and it
   * sidesteps GET /api/User, which is admin-only and 403s for everyone else.
   */
  assignableUsers = computed(() =>
    this.members().map(member => ({ id: member.userId, name: member.fullName }))
  );

  /** Friends not already in the project, for the add-member picker. */
  addableUsers = computed(() => {
    const memberIds = new Set(this.members().map(m => m.userId));
    return this.allUsers().filter(user => !memberIds.has(user.id));
  });

  /** Per-member workload, so a lead can see distribution at a glance. */
  memberStats = computed(() => {
    const tasks = this.tasks();
    return this.members().map(member => {
      const assigned = tasks.filter(t => t.assignedToUserId === member.userId);
      const done = assigned.filter(t => t.status === 'Completed').length;
      return {
        member,
        total: assigned.length,
        done,
        percent: assigned.length ? Math.round((done / assigned.length) * 100) : 0
      };
    });
  });

  ngOnInit() {
    // Only changes belonging to this project matter here.
    this.realtime.taskChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event.groupId && event.groupId === this.projectId()) this.reloadTasks();
      });

    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (!id) {
        this.router.navigate(['/dashboard']);
        return;
      }
      this.projectId.set(id);
      this.load(id);
    });
  }

  load(id: string) {
    this.loading.set(true);
    this.errorMessage.set('');

    // One pass so the page renders complete rather than filling in piecemeal.
    // Each stream degrades to an empty value so a single failure cannot blank
    // the whole workspace.
    forkJoin({
      project: this.groupService.getGroupById(id).pipe(catchError(() => of(null))),
      tasks: this.taskService.getTasksByGroup(id).pipe(catchError(() => of([] as TaskDto[]))),
      members: this.groupService.getMembers(id).pipe(catchError(() => of([] as MemberDto[]))),
      // Friends rather than all users: GET /api/User is admin-only.
      users: this.friendService.getFriendUsers(this.authService.getCurrentUserId())
        .pipe(catchError(() => of([] as { id: string; name: string }[])))
    }).subscribe({
      next: result => {
        if (!result.project) {
          this.errorMessage.set('That project could not be found.');
          this.loading.set(false);
          return;
        }
        this.project.set(result.project);
        this.tasks.set(result.tasks ?? []);
        this.members.set(result.members ?? []);
        this.allUsers.set(result.users ?? []);
        this.resetHeaderDraft();
        this.loading.set(false);
      },
      error: err => {
        this.errorMessage.set(apiErrorMessage(err, 'Could not load this project.'));
        this.loading.set(false);
      }
    });
  }

  private reloadTasks() {
    this.taskService.getTasksByGroup(this.projectId()).subscribe({
      next: tasks => this.tasks.set(tasks ?? []),
      error: () => { /* keep what is on screen */ }
    });
  }

  private reloadMembers() {
    this.groupService.getMembers(this.projectId()).subscribe({
      next: members => {
        this.members.set(members);
        this.project.update(p => (p ? { ...p, memberCount: members.length } : p));
      },
      error: () => { /* keep what is on screen */ }
    });
  }

  // ── Task edits ─────────────────────────────────────────────────────────────

  /**
   * Inline cell edit. The row updates first and rolls back if the write fails,
   * so the table never shows a value the server rejected.
   */
  patchTask(task: TaskDto, changes: Partial<TaskDto>) {
    const previous = { ...task };
    const updated = { ...task, ...changes };

    this.tasks.update(list => list.map(t => (t.id === task.id ? updated : t)));
    this.setSaving(task.id, true);
    this.errorMessage.set('');

    this.taskService.updateTask(task.id, updated).subscribe({
      next: () => this.setSaving(task.id, false),
      error: err => {
        this.tasks.update(list => list.map(t => (t.id === task.id ? previous : t)));
        this.setSaving(task.id, false);
        this.errorMessage.set(apiErrorMessage(err, 'Could not save that change.'));
      }
    });
  }

  setStatus(task: TaskDto, status: string) {
    if (task.status !== status) this.patchTask(task, { status });
  }

  setPriority(task: TaskDto, priority: string) {
    if (task.priority !== priority) this.patchTask(task, { priority });
  }

  setAssignee(task: TaskDto, userId: string) {
    const name = this.assignableUsers().find(u => u.id === userId)?.name ?? '';
    this.patchTask(task, { assignedToUserId: userId, assignedToUserName: name });
  }

  toggleDone(task: TaskDto) {
    this.setStatus(task, task.status === 'Completed' ? 'Pending' : 'Completed');
  }

  newTask() {
    const ref = this.dialog.open(TaskWindowComponent, {
      width: '600px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container',
      autoFocus: false,
      data: { groupId: this.projectId() }
    });
    ref.afterClosed().subscribe(result => { if (result) this.reloadTasks(); });
  }

  /** Opening a task goes to its own page; the dialog is only for quick edits. */
  openTask(task: TaskDto) {
    this.router.navigate(['/tasks', task.id]);
  }

  editTask(task: TaskDto) {
    const ref = this.dialog.open(TaskWindowComponent, {
      width: '600px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container',
      autoFocus: false,
      data: { task }
    });
    ref.afterClosed().subscribe(result => { if (result) this.reloadTasks(); });
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

  // ── Members ────────────────────────────────────────────────────────────────

  addMember(userId: string) {
    if (!userId) return;
    this.errorMessage.set('');
    this.groupService.addMember(this.projectId(), userId).subscribe({
      next: () => this.reloadMembers(),
      error: err => this.errorMessage.set(apiErrorMessage(err, 'Could not add that member.'))
    });
  }

  removeMember(member: MemberDto) {
    if (!confirm(`Remove ${member.fullName} from this project?`)) return;

    const snapshot = this.members();
    this.members.update(list => list.filter(m => m.userId !== member.userId));
    this.groupService.removeMember(this.projectId(), member.userId).subscribe({
      next: () => this.reloadMembers(),
      error: err => {
        this.members.set(snapshot);
        this.errorMessage.set(apiErrorMessage(err, 'Could not remove that member.'));
      }
    });
  }

  // ── Header edit ────────────────────────────────────────────────────────────

  toggleHeaderEdit() {
    if (this.isEditingHeader()) this.resetHeaderDraft();
    this.isEditingHeader.update(v => !v);
  }

  private resetHeaderDraft() {
    const p = this.project();
    this.headerDraft = {
      name: p?.name ?? '',
      description: p?.description ?? '',
      color: p?.color || '#2ec4a0'
    };
  }

  saveHeader() {
    const p = this.project();
    if (!p || !this.headerDraft.name.trim()) return;

    const updated = { ...p, ...this.headerDraft };
    this.project.set(updated);
    this.isEditingHeader.set(false);

    this.groupService.updateGroup(p.id, updated).subscribe({
      error: err => {
        this.project.set(p);
        this.errorMessage.set(apiErrorMessage(err, 'Could not save the project.'));
      }
    });
  }

  deleteProject() {
    const p = this.project();
    if (!p) return;
    if (!confirm(`Delete "${p.name}" and everything in it? This cannot be undone.`)) return;

    this.groupService.deleteGroup(p.id).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: err => this.errorMessage.set(apiErrorMessage(err, 'Could not delete this project.'))
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private setSaving(id: string, saving: boolean) {
    this.savingIds.update(current => {
      const next = new Set(current);
      if (saving) next.add(id); else next.delete(id);
      return next;
    });
  }

  isSaving(id: string): boolean { return this.savingIds().has(id); }

  statusLabel(value: string): string {
    return this.statuses.find(s => s.value === value)?.label ?? value ?? '—';
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

  projectColor(): string {
    return this.project()?.color || '#2ec4a0';
  }

  initials(name: string): string {
    return (name || '?').split(' ').filter(Boolean).slice(0, 2)
      .map(word => word[0]).join('').toUpperCase();
  }

  avatarColor(key: string): string {
    const palette = ['#7c8ef5', '#2ec4a0', '#f4a835', '#f4845f', '#ef4444', '#9b6dff'];
    let hash = 0;
    for (const char of key || '') hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return palette[hash % palette.length];
  }

  isOverdue(task: TaskDto): boolean {
    if (!task.dueDate || task.status === 'Completed' || task.status === 'Cancelled') return false;
    return new Date(task.dueDate).getTime() < Date.now();
  }

  formatDue(dateStr: string): string {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '—';

    const days = Math.round(
      (this.startOfDay(date) - this.startOfDay(new Date())) / 86_400_000
    );
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days === -1) return 'Yesterday';
    if (days < 0) return `${Math.abs(days)}d overdue`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  tagList(tags: string): string[] {
    return (tags ?? '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 3);
  }

  private startOfDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  trackById(_index: number, task: TaskDto): string { return task.id; }

  /** memberStats() yields wrapper rows, so this keys off the nested member. */
  trackByMember(_index: number, row: { member: MemberDto }): string { return row.member.userId; }
}
