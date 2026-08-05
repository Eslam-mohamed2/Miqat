import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { TaskService } from '../../../core/services/task.service';
import { GroupService } from '../../../core/services/group.service';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { MemberDto, TaskDto } from '../../../models/api.models';
import { apiErrorMessage } from '../../../core/http/api-error';
import { CommentThread } from '../../../shared/comment-thread/comment-thread';
import { TaskWindowComponent } from '../../dashboard/task-window/task-window';

/** Backend TaskStatus values. "InProgress" is not one of them. */
const STATUSES = ['Pending', 'In_progress', 'Completed', 'On_hold', 'Cancelled'] as const;
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;

/**
 * A task on a page of its own.
 *
 * The dialog is fine for a quick add, but a task you are actually working
 * through needs room: the full description, who owns it, who it is assigned to,
 * which project it belongs to and who else can see it, plus the discussion where
 * you can pull a friend in for help.
 */
@Component({
  selector: 'app-task-detail-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatDialogModule, CommentThread],
  templateUrl: './task-detail-page.html',
  styleUrl: './task-detail-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskDetailPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private tasks = inject(TaskService);
  private groups = inject(GroupService);
  private users = inject(UserService);
  private auth = inject(AuthService);
  private realtime = inject(RealtimeService);
  private dialog = inject(MatDialog);
  private destroyRef = inject(DestroyRef);

  readonly statuses = STATUSES;
  readonly priorities = PRIORITIES;

  taskId = signal<string | null>(null);
  /** ?comment=<id> — set when arriving from a "new comment" notification. */
  focusCommentId = signal<string | null>(null);
  task = signal<TaskDto | null>(null);
  members = signal<MemberDto[]>([]);
  loading = signal(true);
  /** Set when the task is missing or the user is not allowed to see it. */
  loadError = signal<string | null>(null);
  saving = signal(false);
  toast = signal<string | null>(null);

  readonly timeZone = this.users.timeZone;
  private readonly myId = this.auth.getCurrentUserId();

  readonly isOwner = computed(() => {
    const t = this.task();
    return !!t && !!this.myId && t.userId === this.myId;
  });

  readonly dueState = computed<'none' | 'overdue' | 'soon' | 'later'>(() => {
    const due = this.task()?.dueDate;
    if (!due) return 'none';
    const ms = new Date(due).getTime() - Date.now();
    if (Number.isNaN(ms)) return 'none';
    if (ms < 0) return 'overdue';
    return ms < 86_400_000 * 2 ? 'soon' : 'later';
  });

  /** Members other than the people already shown as owner/assignee. */
  readonly otherMembers = computed(() => {
    const t = this.task();
    if (!t) return this.members();
    return this.members().filter(m => m.userId !== t.userId && m.userId !== t.assignedToUserId);
  });

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(q => this.focusCommentId.set(q.get('comment')));

    this.route.paramMap
      .pipe(
        switchMap(params => {
          const id = params.get('id');
          this.taskId.set(id);
          this.loading.set(true);
          this.loadError.set(null);
          if (!id) return of(null);
          return this.tasks.getTaskById(id).pipe(
            catchError(err => {
              this.loadError.set(
                err?.status === 403
                  ? 'You do not have access to this task.'
                  : apiErrorMessage(err, 'That task could not be loaded.')
              );
              return of(null);
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(task => {
        this.task.set(task);
        this.loading.set(false);
        if (task?.groupId) this.loadMembers(task.groupId);
        else this.members.set([]);
      });

    // Someone else moving this task should be reflected here without a reload.
    this.realtime.taskChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event?.taskId && event.taskId === this.taskId()) this.reload();
      });
  }

  private loadMembers(groupId: string) {
    this.groups.getMembers(groupId, 0, 50).subscribe({
      next: list => this.members.set(list ?? []),
      error: () => this.members.set([])
    });
  }

  private reload() {
    const id = this.taskId();
    if (!id) return;
    this.tasks.getTaskById(id).subscribe({ next: t => this.task.set(t) });
  }

  private notify(message: string) {
    this.toast.set(message);
    setTimeout(() => this.toast.set(null), 2600);
  }

  // ── Inline edits ──────────────────────────────────────────────────────────

  /**
   * Status and priority are one click each here rather than a round trip through
   * the edit dialog. The change is applied optimistically and rolled back if the
   * API rejects it.
   */
  private patch(changes: Partial<TaskDto>, label: string) {
    const current = this.task();
    const id = this.taskId();
    if (!current || !id || this.saving()) return;

    const snapshot = { ...current };
    this.task.set({ ...current, ...changes });
    this.saving.set(true);

    this.tasks.updateTask(id, { ...current, ...changes }).subscribe({
      next: updated => {
        // Trust the server's copy — it recalculates the denormalised names.
        this.task.set(updated ?? { ...snapshot, ...changes });
        this.saving.set(false);
        this.notify(label);
      },
      error: err => {
        this.task.set(snapshot);
        this.saving.set(false);
        this.notify(apiErrorMessage(err, 'That change was not saved.'));
      }
    });
  }

  setStatus(status: string) {
    if (this.task()?.status === status) return;
    this.patch({ status }, `Moved to ${this.label(status)}`);
  }

  setPriority(priority: string) {
    if (this.task()?.priority === priority) return;
    this.patch({ priority }, `Priority set to ${priority}`);
  }

  openEditor() {
    const current = this.task();
    if (!current) return;
    this.dialog
      .open(TaskWindowComponent, {
        width: '600px',
        maxWidth: '95vw',
        disableClose: true,
        panelClass: 'custom-dialog-container',
        autoFocus: false,
        data: { task: current }
      })
      .afterClosed()
      .subscribe(result => { if (result) this.reload(); });
  }

  remove() {
    const id = this.taskId();
    if (!id || !confirm('Delete this task and its discussion? This cannot be undone.')) return;
    this.tasks.deleteTask(id).subscribe({
      next: () => this.router.navigate(['/tasks']),
      error: err => this.notify(apiErrorMessage(err, 'That task could not be deleted.'))
    });
  }

  // ── Display helpers ───────────────────────────────────────────────────────

  /** "In_progress" is what the API stores; "In progress" is what people read. */
  label(value?: string | null): string {
    return (value ?? '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  }

  slug(value?: string | null): string {
    return (value ?? '').toLowerCase().replace(/[^a-z]/g, '-');
  }

  initials(name?: string | null): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  /** Dates render in the user's profile zone, not the browser's. */
  dateLabel(value?: string | null): string {
    if (!value) return 'No due date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No due date';
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZone: this.timeZone() || undefined
    }).format(date);
  }

  shortDate(value?: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric', month: 'short', year: 'numeric',
      timeZone: this.timeZone() || undefined
    }).format(date);
  }

  tagList(): string[] {
    return (this.task()?.tags ?? '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
  }

  trackByUserId = (_: number, member: MemberDto) => member.userId;
}
