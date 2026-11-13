import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, Injector, afterNextRender, computed, effect,
  inject, signal, untracked
} from '@angular/core';

import { isRtl, t } from '../../../core/i18n/i18n';
import { TPipe } from '../../../core/i18n/t.pipe';
import { formatDuration, estimateMinutes } from '../../../core/utils/task-estimate';
import { dateInputInZone, formatTimeInZone, instantFromInputs, timeInputInZone } from '../../../core/utils/time-zone';
import { TasksStore } from '../tasks-store';
import { DEFAULT_BLOCK_MINUTES, blockMinutes, dayLabel } from '../task-view';

const WIDTH = 320;
const MARGIN = 12;
/** Tall enough for every state of the pop-up; used to decide whether it opens upward. */
const ROOM_NEEDED = 330;

/**
 * "Schedule": gives a task a block on the calendar. It offers the next free slot
 * in the user's working hours (clear of today's meetings and of other tasks'
 * blocks) and lets the user pick a time instead. Opened through
 * `TasksStore.askSchedule()` and placed next to the control that asked.
 */
@Component({
  selector: 'app-schedule-popover',
  standalone: true,
  imports: [TPipe],
  templateUrl: './schedule-popover.html',
  styleUrl: './schedule-popover.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SchedulePopover {
  private store = inject(TasksStore);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private injector = inject(Injector);

  private readonly request = this.store.scheduleRequest;

  /** The task as it is now, so the pop-up follows a change made while it is open. */
  readonly task = computed(() => {
    const asked = this.request()?.task;
    return asked ? this.store.find(asked.id) ?? asked : null;
  });

  readonly dateValue = signal('');
  readonly timeValue = signal('');

  readonly slot = computed(() => {
    const task = this.task();
    return task ? this.store.nextFreeSlot(task) : null;
  });

  readonly slotLabel = computed(() => {
    const slot = this.slot();
    if (!slot) return '';
    const zone = this.store.zone();
    const hour24 = this.store.hour24();
    return t('{day} {from} – {to}', {
      day: dayLabel(slot.start, zone, this.store.now()),
      from: formatTimeInZone(slot.start, zone, hour24),
      to: formatTimeInZone(slot.end, zone, hour24)
    });
  });

  /** "45 min block", or the default length when the task has no estimate. */
  readonly lengthLabel = computed(() => {
    const task = this.task();
    if (!task) return '';
    return estimateMinutes(task)
      ? t('{duration} block', { duration: formatDuration(blockMinutes(task)) })
      : t('No estimate: {n} min block', { n: DEFAULT_BLOCK_MINUTES });
  });

  /** The instant the two fields describe, or null while they are incomplete. */
  readonly picked = computed(() => instantFromInputs(this.dateValue(), this.timeValue(), this.store.zone()));

  /** True when the chosen time is after the deadline: the API then needs the deadline moved. */
  readonly deadlineMoves = computed(() => {
    const due = this.task()?.dueDate ? new Date(this.task()!.dueDate) : null;
    const start = this.picked() ?? this.slot()?.start ?? null;
    return !!due && !!start && due.getTime() < start.getTime();
  });

  /** Where the pop-up goes: under the control, or above it near the bottom of the window. */
  readonly place = computed(() => {
    const anchor = this.request()?.anchor;
    if (!anchor) return null;
    // Its end edge lines up with the control's: the right edge, or the left one in Arabic.
    const wanted = isRtl() ? anchor.left : anchor.right - WIDTH;
    const left = Math.min(Math.max(MARGIN, wanted), window.innerWidth - WIDTH - MARGIN);
    const above = anchor.bottom + ROOM_NEEDED > window.innerHeight && anchor.top > ROOM_NEEDED;
    return {
      left: Math.max(MARGIN, left),
      top: above ? null : anchor.bottom + 6,
      bottom: above ? window.innerHeight - anchor.top + 6 : null
    };
  });

  constructor() {
    // Each time it opens, the fields start at the suggestion (or the block the task has).
    effect(() => {
      const asked = this.request();
      if (!asked) return;

      // Only opening it fills the fields: a later change to the list must not reset them.
      untracked(() => {
        const zone = this.store.zone();
        const start = asked.task.startDate
          ? new Date(asked.task.startDate)
          : this.store.nextFreeSlot(asked.task)?.start ?? null;
        this.dateValue.set(dateInputInZone(start ?? this.store.now(), zone));
        this.timeValue.set(start ? timeInputInZone(start, zone) : '');
      });

      afterNextRender(() => {
        this.host.nativeElement.querySelector<HTMLElement>('.suggest, .field')?.focus();
      }, { injector: this.injector });
    });
  }

  useSlot(): void {
    const task = this.task();
    const slot = this.slot();
    if (!task || !slot) return;
    this.store.schedule(task, slot.start);
    this.close();
  }

  usePicked(): void {
    const task = this.task();
    const start = this.picked();
    if (!task || !start) return;
    this.store.schedule(task, start);
    this.close();
  }

  clear(): void {
    const task = this.task();
    if (task) this.store.schedule(task, null);
    this.close();
  }

  close(): void {
    this.store.scheduleRequest.set(null);
  }

  textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.request()) this.close();
  }
}
