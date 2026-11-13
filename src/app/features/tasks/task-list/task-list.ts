import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';

import { isRtl, num, t } from '../../../core/i18n/i18n';
import { TPipe } from '../../../core/i18n/t.pipe';
import { estimateMinutes, formatDuration, formatEstimate } from '../../../core/utils/task-estimate';
import { TaskDto } from '../../../models/api.models';
import { TaskMarks } from '../../../shared/task-marks/task-marks';
import { TasksStore } from '../tasks-store';
import { blockLabel, dueLabel, initials, isClosed, isDone, isLate, priorityLabel } from '../task-view';

/** One folding group of the list ("Overdue", "On your calendar today" ...). */
export interface TaskSection {
  key: string;
  title: string;
  /** The shorter title of the phone design ("On your calendar"). */
  shortTitle?: string;
  /** The colour of the title: late (coral), accent, text or muted. */
  tone: 'late' | 'accent' | 'text' | 'muted';
  tasks: TaskDto[];
  open: boolean;
}

/** Swiping a row this far, in pixels, opens or closes its actions. */
const SWIPE_DISTANCE = 40;

/**
 * The task list (design/miqat-2.0: V2-Tasks and, at phone width, V2-MobileTasks):
 * folding sections of rows with the round checkbox, the project, the estimate,
 * the time block or "Schedule", the deadline and the assignee.
 */
@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [TaskMarks, TPipe],
  templateUrl: './task-list.html',
  styleUrl: './task-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskList {
  readonly store = inject(TasksStore);

  readonly sections = input.required<TaskSection[]>();
  /** The task shown in the detail panel. */
  readonly selectedId = input<string | null>(null);

  readonly pick = output<TaskDto>();
  /** A section's header was pressed. */
  readonly fold = output<string>();

  /** The row whose swipe actions are showing (phones). */
  readonly swipedId = signal<string | null>(null);
  private touchStart: { x: number; y: number } | null = null;

  readonly view = computed(() => {
    const zone = this.store.zone();
    const now = this.store.now();
    const hour24 = this.store.hour24();
    const justCompleted = this.store.justCompleted();

    return this.sections().map(section => {
      const minutes = section.tasks.reduce((sum, task) => sum + (estimateMinutes(task) ?? 0), 0);
      return {
        key: section.key,
        title: section.title,
        shortTitle: section.shortTitle ?? section.title,
        tone: section.tone,
        open: section.open,
        meta: num(section.tasks.length) + (minutes ? ' · ' + formatDuration(minutes) : ''),
        rows: !section.open ? [] : section.tasks.map(task => {
          const done = isDone(task);
          const block = isClosed(task) ? '' : blockLabel(task, zone, now, hour24);
          const project = this.store.groupName(task);
          const named = { title: task.title, priority: priorityLabel(task.priority) };
          return {
            task,
            done,
            closed: isClosed(task),
            justDone: done && justCompleted === task.id,
            checkLabel: done
              ? t('Mark not done: {title}, {priority} priority', named)
              : t('Complete: {title}, {priority} priority', named),
            project,
            color: this.store.groupColor(task),
            est: formatEstimate(estimateMinutes(task)),
            block,
            blockAria: block ? t('On your calendar at {time}: change the time for {title}', { time: block, title: task.title }) : '',
            due: dueLabel(task, zone, now, hour24),
            late: isLate(task, now),
            who: task.assignedToUserId ? initials(task.assignedToUserName) : '',
            whoName: task.assignedToUserName || ''
          };
        })
      };
    });
  });

  toggle(task: TaskDto, event: Event): void {
    event.stopPropagation();
    this.store.toggleDone(task);
  }

  schedule(task: TaskDto, event: Event): void {
    event.stopPropagation();
    this.swipedId.set(null);
    this.store.askSchedule(task, event.currentTarget as Element);
  }

  postpone(task: TaskDto, event: Event): void {
    event.stopPropagation();
    this.swipedId.set(null);
    this.store.postpone(task);
  }

  open(task: TaskDto): void {
    // A tap on a swiped row closes its actions first.
    if (this.swipedId()) {
      this.swipedId.set(null);
      return;
    }
    this.pick.emit(task);
  }

  onTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    this.touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  /**
   * A sideways swipe toward the start edge (left; right in Arabic) shows "Tomorrow"
   * and "Schedule"; the other way hides them.
   */
  onTouchEnd(task: TaskDto, event: TouchEvent): void {
    const start = this.touchStart;
    const touch = event.changedTouches[0];
    this.touchStart = null;
    if (!start || !touch || isClosed(task)) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy)) return;

    const towardStart = isRtl() ? dx > 0 : dx < 0;
    this.swipedId.set(towardStart ? task.id : null);
  }
}
