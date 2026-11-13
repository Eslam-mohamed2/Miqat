import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, input, output,
  signal
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { ChatService } from '../../../core/services/chat.service';
import { GroupService } from '../../../core/services/group.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/services/toast.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { t } from '../../../core/i18n/i18n';
import { NumPipe, TPipe } from '../../../core/i18n/t.pipe';
import { estimateMinutes, formatDuration, visibleTags } from '../../../core/utils/task-estimate';
import { dateInputInZone } from '../../../core/utils/time-zone';
import { MemberDto } from '../../../models/api.models';
import { CommentThread } from '../../../shared/comment-thread/comment-thread';
import { ItemAttachments } from '../../../shared/item-attachments/item-attachments';
import { ItemReminders } from '../../../shared/item-reminders/item-reminders';
import { ChecklistProgress, TaskChecklist } from '../../../shared/task-checklist/task-checklist';
import { TaskDependencies } from '../../../shared/task-dependencies/task-dependencies';
import { TaskWindowComponent } from '../../dashboard/task-window/task-window';
import { TasksStore } from '../tasks-store';
import {
  PRIORITIES, STATUSES, blockRange, dayLabel, dueLong, initials, isClosed, isLate, priorityLabel, priorityPhrase, statusLabel
} from '../task-view';

type PanelMenu = 'status' | 'priority' | 'more';

/** How often a task repeats, as the API names it and as it is shown. */
const REPEAT_LABELS: Record<string, string> = {
  Daily: t('Daily'),
  Weekly: t('Weekly'),
  Monthly: t('Monthly'),
  Yearly: t('Yearly')
};

/**
 * The detail panel of the selected task (design/miqat-2.0: V2-Tasks, the right
 * column): project, serif title, status and priority, properties, description,
 * subtasks, what blocks it, reminders, files, and the activity with the comment box.
 *
 * On a narrow screen it is the whole page, and over the board it is a drawer;
 * `closable` then shows the way back.
 */
@Component({
  selector: 'app-task-panel',
  standalone: true,
  imports: [RouterLink, TaskChecklist, TaskDependencies, ItemReminders, ItemAttachments, CommentThread, TPipe, NumPipe],
  templateUrl: './task-panel.html',
  styleUrl: './task-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // While chat is on the page's bottom corner its button floats where the comment box ends.
  host: { '[class.clear-chat]': 'chat.cornerInUse()' }
})
export class TaskPanel {
  readonly store = inject(TasksStore);
  readonly chat = inject(ChatService);
  private groups = inject(GroupService);
  private dialog = inject(MatDialog);
  private toasts = inject(ToastService);
  private realtime = inject(RealtimeService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroyRef = inject(DestroyRef);

  readonly taskId = input.required<string>();
  /** ?comment=<id>: set when arriving from a "new comment" notification. */
  readonly focusCommentId = input<string | null>(null);
  readonly closable = input(false);

  readonly closed = output<void>();
  /** The task was deleted from here. */
  readonly removed = output<void>();

  readonly statuses = STATUSES;
  /** The API's values with the names shown for them. */
  readonly priorities = PRIORITIES.map(value => ({ value, label: priorityLabel(value) }));

  readonly loading = signal(true);
  /** Set when the task is missing or the user is not allowed to see it. */
  readonly loadError = signal<string | null>(null);
  /** The API said the task exists but is not shared with this user. */
  readonly denied = signal(false);
  readonly members = signal<MemberDto[]>([]);
  readonly menu = signal<PanelMenu | null>(null);

  readonly task = computed(() => this.store.find(this.taskId()));

  readonly isOwner = computed(() => {
    const task = this.task();
    return !!task && !!this.store.myId && task.userId === this.store.myId;
  });

  /** Project members other than the owner and the assignee, who are shown already. */
  readonly otherMembers = computed(() => {
    const task = this.task();
    if (!task) return [];
    return this.members().filter(member => member.userId !== task.userId && member.userId !== task.assignedToUserId);
  });

  /** Everything the template prints about the task, worked out in one place. */
  readonly view = computed(() => {
    const task = this.task();
    if (!task) return null;

    const zone = this.store.zone();
    const now = this.store.now();
    const hour24 = this.store.hour24();
    const minutes = estimateMinutes(task);
    const start = task.startDate ? new Date(task.startDate) : null;
    const created = new Date(task.createdAt);
    const recurrence = task.recurrence && task.recurrence !== 'None' ? REPEAT_LABELS[task.recurrence] ?? task.recurrence : '';
    const until = task.recurrenceEndDate ? new Date(task.recurrenceEndDate) : null;
    const status = statusLabel(task.status);
    const priority = priorityPhrase(task.priority);

    return {
      status,
      statusAria: t('Status: {status}. Change', { status }),
      priority,
      priorityAria: t('{priority}. Change', { priority }),
      project: this.store.groupName(task),
      color: this.store.groupColor(task),
      assignee: task.assignedToUserId ? task.assignedToUserName || t('Unknown') : '',
      assigneeInitials: initials(task.assignedToUserName),
      due: dueLong(task, zone, now, hour24),
      late: isLate(task, now),
      estimate: minutes ? formatDuration(minutes) : '',
      block: start && !Number.isNaN(start.getTime()) ? blockRange(task, zone, hour24) : '',
      blockDate: start && !Number.isNaN(start.getTime()) ? dateInputInZone(start, zone) : null,
      closed: isClosed(task),
      labels: visibleTags(task.tags),
      repeats: recurrence && until && !Number.isNaN(until.getTime())
        ? t('{repeat} until {day}', { repeat: recurrence, day: dayLabel(until, zone, now) })
        : recurrence,
      owner: task.ownerName || t('Unknown'),
      ownerInitials: initials(task.ownerName),
      created: Number.isNaN(created.getTime()) ? '' : dayLabel(created, zone, now)
    };
  });

  constructor() {
    toObservable(this.taskId)
      .pipe(
        switchMap(id => {
          this.loading.set(true);
          this.loadError.set(null);
          this.denied.set(false);
          this.menu.set(null);
          return this.store.open(id).pipe(
            catchError(err => {
              this.denied.set(err?.status === 403);
              this.loadError.set(
                err?.status === 403
                  ? t('You do not have access to this task.')
                  : apiErrorMessage(err, t('That task could not be loaded.')));
              return of(null);
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.loading.set(false));

    // The people on the task's project, for "Shared with".
    const groupId = computed(() => this.task()?.groupId || null);
    effect(() => {
      const id = groupId();
      this.members.set([]);
      if (!id) return;
      this.groups.getMembers(id, 0, 50).subscribe({
        next: list => { if (groupId() === id) this.members.set(list ?? []); },
        error: () => { /* the row is simply not shown */ }
      });
    });

    // Someone else changing this task shows here without a reload, also when it
    // is not in the list beside the panel.
    this.realtime.taskChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event?.taskId && event.taskId === this.taskId() && event.action !== 'deleted') {
          this.store.open(event.taskId).subscribe({ error: () => { /* keeps what is shown */ } });
        }
      });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  toggleMenu(menu: PanelMenu): void {
    this.menu.update(open => (open === menu ? null : menu));
  }

  setStatus(status: string): void {
    const task = this.task();
    this.menu.set(null);
    if (task) this.store.setStatus(task, status);
  }

  setPriority(priority: string): void {
    const task = this.task();
    this.menu.set(null);
    if (task) this.store.setPriority(task, priority);
  }

  schedule(event: Event): void {
    const task = this.task();
    if (task) this.store.askSchedule(task, event.currentTarget as Element);
  }

  copyLink(): void {
    const link = `${location.origin}/tasks/${this.taskId()}`;
    const copied = navigator.clipboard?.writeText(link);
    if (!copied) {
      this.toasts.show(t('This browser does not allow copying. The link is in the address bar.'), { tone: 'var(--mq-late)' });
      return;
    }
    copied.then(
      () => this.toasts.show(t('Link copied'), { duration: 2200 }),
      () => this.toasts.show(t('The link could not be copied.'), { tone: 'var(--mq-late)' }));
  }

  /** Every field of the task, in the task dialog. */
  edit(): void {
    const task = this.task();
    this.menu.set(null);
    if (!task) return;

    this.dialog
      .open(TaskWindowComponent, {
        width: '600px',
        maxWidth: '95vw',
        disableClose: true,
        panelClass: 'custom-dialog-container',
        autoFocus: false,
        data: { task }
      })
      .afterClosed()
      .subscribe(saved => {
        if (!saved) return;
        this.store.open(task.id).subscribe({ error: () => { /* keeps what is shown */ } });
        this.store.loadGroups();
      });
  }

  remove(): void {
    const task = this.task();
    this.menu.set(null);
    if (!task) return;
    void this.store.remove(task).then(gone => { if (gone) this.removed.emit(); });
  }

  /**
   * The subtasks and the dependencies save by themselves; these keep the task's
   * row and card in step, so no count or "Blocked" mark goes stale.
   */
  onChecklistChanged(progress: ChecklistProgress): void {
    this.store.patchLocal(this.taskId(), { subtaskCount: progress.total, completedSubtaskCount: progress.done });
  }

  onBlockedChanged(isBlocked: boolean): void {
    this.store.patchLocal(this.taskId(), { isBlocked });
  }

  memberInitials(name: string): string {
    return initials(name);
  }

  @HostListener('document:pointerdown', ['$event'])
  onOutside(event: Event): void {
    if (!this.menu()) return;
    const holder = (event.target as Element | null)?.closest?.('.menu-holder');
    if (!holder || !this.host.nativeElement.contains(holder)) this.menu.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menu.set(null);
  }
}
