import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, output, signal
} from '@angular/core';
import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';

import { currentNumerals, latinDigits, locale, num, t, tCount } from '../../../core/i18n/i18n';
import { NumPipe, TCountPipe, TPipe } from '../../../core/i18n/t.pipe';
import { LocalPrefsService } from '../../../core/services/local-prefs.service';
import { estimateMinutes, formatEstimate, visibleTags } from '../../../core/utils/task-estimate';
import { TaskDto } from '../../../models/api.models';
import { TasksStore } from '../tasks-store';
import {
  BOARD_STATUSES, NEXT_STATUS, blockLabel, dayNumber, dueLabel, initials, isClosed, isDone, isLate, priorityLevel,
  priorityPhrase, statusLabel, timeValue, weekdayDate
} from '../task-view';

/** The Done column shows this many, newest first; the rest are in the Logbook. */
const DONE_LIMIT = 30;
/** Labels shown on a card. */
const LABEL_LIMIT = 2;

/**
 * The board (design/miqat-2.0: V2-Board): one column per status, cards that are
 * dragged between them or sent on with their arrow, optional rows by project and
 * a work-in-progress limit per column that the user chooses.
 */
@Component({
  selector: 'app-task-board',
  standalone: true,
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, CdkDragPlaceholder, TPipe, TCountPipe, NumPipe],
  templateUrl: './task-board.html',
  styleUrl: './task-board.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskBoard {
  readonly store = inject(TasksStore);
  private prefs = inject(LocalPrefsService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The tasks to lay out, already narrowed by the page's filters. */
  readonly tasks = input.required<TaskDto[]>();
  /** One row of columns per project ("Rows by project"). */
  readonly lanes = input(false);
  readonly selectedId = input<string | null>(null);

  readonly pick = output<TaskDto>();
  /** "n older in the Logbook" was pressed. */
  readonly openLogbook = output<void>();

  /** A work-in-progress limit per column, kept in this browser; null is no limit. */
  private readonly limits = new Map(
    BOARD_STATUSES.map(status => [status.value, this.prefs.value<number | null>(`board.wip.${status.value}`, null)]));

  /**
   * A number field draws 0-9 whatever the page says, so with Arabic digits the limit
   * is a text field that takes digits of either kind.
   */
  readonly arabDigits = currentNumerals() === 'arab';

  /** The column whose limit is being edited. */
  readonly limitEditor = signal<string | null>(null);

  private readonly onBoard = computed(() => {
    const known = new Set(BOARD_STATUSES.map(status => status.value));
    return this.tasks().filter(task => known.has(task.status));
  });

  /** Tasks the board leaves out: cancelled ones. */
  readonly leftOut = computed(() => this.tasks().length - this.onBoard().length);

  /** Done tasks beyond the newest thirty. */
  private readonly olderDone = computed(() => {
    const done = this.onBoard().filter(isDone).sort((a, b) => this.completedValue(b) - this.completedValue(a));
    return new Set(done.slice(DONE_LIMIT).map(task => task.id));
  });
  readonly olderDoneCount = computed(() => this.olderDone().size);

  private readonly shown = computed(() => {
    const hidden = this.olderDone();
    return this.onBoard().filter(task => !hidden.has(task.id));
  });

  readonly heads = computed(() => {
    const shown = this.shown();
    return BOARD_STATUSES.map(status => {
      const inColumn = shown.filter(task => task.status === status.value);
      const count = inColumn.length;
      const limit = this.limits.get(status.value)!();
      const over = !!limit && count > limit;
      return {
        status: status.value,
        title: status.label,
        count,
        est: formatEstimate(inColumn.reduce((sum, task) => sum + (estimateMinutes(task) ?? 0), 0)),
        limit,
        over,
        wipLabel: !limit ? ''
          : over ? t('{count} / {limit} · over limit', { count, limit })
          : t('{count} / {limit} WIP', { count, limit }),
        wipPercent: limit ? Math.min(100, (count / limit) * 100) : 0
      };
    });
  });

  readonly rows = computed(() => {
    const shown = this.shown();
    const zone = this.store.zone();
    const now = this.store.now();
    const hour24 = this.store.hour24();

    const lanes = this.lanes() ? this.projectLanes(shown) : [{ key: 'all', title: '', color: null, tasks: shown }];

    return lanes.map(lane => ({
      key: lane.key,
      title: lane.title,
      color: lane.color,
      count: tCount(lane.tasks.length, '{n} task', '{n} tasks'),
      cols: BOARD_STATUSES.map(status => ({
        status: status.value,
        label: lane.title ? t('{status}, {project}', { status: status.label, project: lane.title }) : status.label,
        cards: lane.tasks
          .filter(task => task.status === status.value)
          .sort((a, b) => this.order(a, b))
          .map(task => this.card(task, zone, now, hour24))
      }))
    }));
  });

  private projectLanes(tasks: TaskDto[]) {
    const lanes = new Map<string, { key: string; title: string; color: string | null; tasks: TaskDto[] }>();
    for (const task of tasks) {
      const key = task.groupId || 'none';
      let lane = lanes.get(key);
      if (!lane) {
        const title = task.groupId ? this.store.groupName(task) || t('Project') : t('No project');
        lane = { key, title, color: this.store.groupColor(task), tasks: [] };
        lanes.set(key, lane);
      }
      lane.tasks.push(task);
    }
    // Projects by name; tasks outside any project last.
    return [...lanes.values()].sort((a, b) =>
      (a.key === 'none' ? 1 : 0) - (b.key === 'none' ? 1 : 0) || a.title.localeCompare(b.title, locale()));
  }

  private card(task: TaskDto, zone: string, now: Date, hour24: boolean) {
    const done = isDone(task);
    const total = task.subtaskCount ?? 0;
    const ticked = Math.min(task.completedSubtaskCount ?? 0, total);
    const block = isClosed(task) ? '' : blockLabel(task, zone, now, hour24, true);
    const next = NEXT_STATUS[task.status];
    const labels = visibleTags(task.tags);

    return {
      task,
      done,
      level: priorityLevel(task.priority),
      priorityLabel: priorityPhrase(task.priority),
      next,
      moveLabel: next ? t('Move “{title}” to {status}', { title: task.title, status: statusLabel(next) }) : '',
      project: this.store.groupName(task),
      color: this.store.groupColor(task),
      labels: labels.slice(0, LABEL_LIMIT),
      moreLabels: Math.max(0, labels.length - LABEL_LIMIT),
      hasSub: total > 0 && !done,
      subLabel: num(`${ticked}/${total}`),
      subPercent: total ? Math.round((ticked / total) * 100) : 0,
      when: block || this.dateOf(task, zone, now, hour24),
      isBlock: !!block,
      late: isLate(task, now),
      blocked: !!task.isBlocked && !isClosed(task),
      comments: task.commentCount ?? 0,
      who: task.assignedToUserId ? initials(task.assignedToUserName) : '',
      whoName: task.assignedToUserName || ''
    };
  }

  /** "Fri 13 Nov" for a deadline further off; the list's short label otherwise. */
  private dateOf(task: TaskDto, zone: string, now: Date, hour24: boolean): string {
    const due = task.dueDate && !isClosed(task) ? new Date(task.dueDate) : null;
    if (due && !Number.isNaN(due.getTime()) && dayNumber(due, zone) - dayNumber(now, zone) > 1) {
      return weekdayDate(due, zone);
    }
    return dueLabel(task, zone, now, hour24);
  }

  /** Done: newest first. Open: time block, then deadline. */
  private order(a: TaskDto, b: TaskDto): number {
    if (isDone(a) && isDone(b)) return this.completedValue(b) - this.completedValue(a);
    return Math.min(timeValue(a.startDate), timeValue(a.dueDate)) - Math.min(timeValue(b.startDate), timeValue(b.dueDate));
  }

  private completedValue(task: TaskDto): number {
    const value = new Date(task.completedAt ?? task.updatedAt ?? task.createdAt).getTime();
    return Number.isNaN(value) ? 0 : value;
  }

  // ── Moving ─────────────────────────────────────────────────────────────────

  drop(event: CdkDragDrop<string>): void {
    const task = event.item.data as TaskDto | undefined;
    if (task) this.store.move(task, event.container.data);
  }

  moveOn(task: TaskDto): void {
    const next = NEXT_STATUS[task.status];
    if (next) this.store.move(task, next);
  }

  // ── Work-in-progress limit ─────────────────────────────────────────────────

  toggleLimitEditor(status: string): void {
    this.limitEditor.update(open => (open === status ? null : status));
  }

  setLimit(status: string, value: string | number | null): void {
    const limit = Math.floor(Number(typeof value === 'string' ? latinDigits(value) : value));
    this.limits.get(status)?.set(value !== null && value !== '' && limit > 0 ? Math.min(limit, 99) : null);
  }

  stepLimit(status: string, step: 1 | -1): void {
    const current = this.limits.get(status)?.() ?? 0;
    this.setLimit(status, Math.max(1, current + step));
  }

  textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  @HostListener('document:pointerdown', ['$event'])
  onOutside(event: Event): void {
    if (!this.limitEditor()) return;
    const inside = (event.target as Element | null)?.closest?.('.head');
    if (!inside || !this.host.nativeElement.contains(inside)) this.limitEditor.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.limitEditor.set(null);
  }
}
