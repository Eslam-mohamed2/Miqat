import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, of } from 'rxjs';
import { catchError, debounceTime } from 'rxjs/operators';

import { AuthService } from '../../core/services/auth.service';
import { CalendarService } from '../../core/services/calendar.service';
import { GroupService } from '../../core/services/group.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { TaskService } from '../../core/services/task.service';
import { ToastService } from '../../core/services/toast.service';
import { UserService } from '../../core/services/user.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { t } from '../../core/i18n/i18n';
import { zonedParts, zonedTimeToUtc } from '../../core/utils/time-zone';
import { CalendarItemDto, CalendarSettingsDto, GroupDto, TaskDto } from '../../models/api.models';
import { Stretch, clockMinutes, firstFreeStart, roundUpToQuarter } from './free-slot';
import { blockMinutes, dayTimeLabel, isClosed, isDone, nextPriority, priorityLabel } from './task-view';

/** A row stays where it was this long after it is ticked, so the tick can be seen. */
const SETTLE_MS = 1100;
/** How long a card that just landed in a board column keeps its landing animation. */
const LAND_MS = 500;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** What the "Schedule" pop-up is asked to show: which task, and the control it opens from. */
export interface ScheduleRequest {
  task: TaskDto;
  anchor: DOMRect;
}

/** A place on the calendar for a block. */
export interface FreeSlot {
  start: Date;
  end: Date;
}

/**
 * The tasks on screen and everything that changes them.
 *
 * One per page (provided by the page component), shared by the list, the board
 * and the detail panel. A change shows at once and is put back, with the reason,
 * when the API refuses it.
 */
@Injectable()
export class TasksStore {
  private api = inject(TaskService);
  private groupApi = inject(GroupService);
  private calendarApi = inject(CalendarService);
  private users = inject(UserService);
  private toasts = inject(ToastService);
  private realtime = inject(RealtimeService);
  private destroyRef = inject(DestroyRef);

  readonly myId = inject(AuthService).getCurrentUserId();
  /** Dates are read in the profile's time zone, not the device's. */
  readonly zone = this.users.timeZone;

  readonly tasks = signal<TaskDto[]>([]);
  readonly groups = signal<GroupDto[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  /** A task opened by its link that is not in the list (someone else's, shared by a mention). */
  private readonly extra = signal<TaskDto | null>(null);

  /** Ticks every minute, so "today", "late" and the next free slot stay true. */
  readonly now = signal(new Date());

  /** Working hours and the clock format; null on API builds without calendar settings. */
  readonly settings = signal<CalendarSettingsDto | null>(null);
  readonly hour24 = computed(() => this.settings()?.use24HourClock ?? true);

  /** Events of today and tomorrow, for the free slot and the day's load. */
  readonly events = signal<CalendarItemDto[]>([]);

  /**
   * Tasks just ticked, as they were before: the lists keep them in place for a
   * moment instead of moving them the instant the box is pressed.
   */
  readonly settling = signal<ReadonlyMap<string, TaskDto>>(new Map());

  /** The id whose box was just ticked, for the draw-and-pop animation. */
  readonly justCompleted = signal<string | null>(null);
  /** The id of the card that just landed in a board column. */
  readonly justMoved = signal<string | null>(null);

  readonly scheduleRequest = signal<ScheduleRequest | null>(null);

  private source: () => Observable<TaskDto[]> = () => this.api.getTasks();
  private started = false;

  /**
   * Loads everything and keeps it current. `source` narrows the list to one
   * project's tasks; left out, it is every task of the signed-in user.
   */
  start(source?: () => Observable<TaskDto[]>): void {
    if (source) this.source = source;
    this.reload();
    if (this.started) return;
    this.started = true;

    this.loadGroups();
    this.loadDay();

    // A teammate creating, moving or deleting a task re-syncs the page. A full
    // reload is deliberate: the event only says that something changed.
    this.realtime.taskChanged$
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.reload(true);
        this.loadGroups();
      });

    this.realtime.eventChanged$
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadDay());

    const clock = setInterval(() => this.now.set(new Date()), MINUTE_MS);
    this.destroyRef.onDestroy(() => clearInterval(clock));
  }

  /** `silent` keeps what is on screen while the fresh list is on its way. */
  reload(silent = false): void {
    if (!silent) this.loading.set(true);
    this.error.set('');

    this.source().subscribe({
      next: list => {
        this.tasks.set(list ?? []);
        this.loading.set(false);
      },
      error: err => {
        if (!silent) this.tasks.set([]);
        this.error.set(apiErrorMessage(err, t('Could not load tasks.')));
        this.loading.set(false);
      }
    });
  }

  loadGroups(): void {
    this.groupApi.getGroups().subscribe({
      next: list => this.groups.set(list ?? []),
      error: () => { /* the project list keeps what it has */ }
    });
  }

  private loadDay(): void {
    this.calendarApi.getSettings().pipe(catchError(() => of(null)))
      .subscribe(settings => { if (settings) this.settings.set(settings); });

    const from = this.dayStart(0);
    this.calendarApi.getFeed(from, new Date(from.getTime() + 2 * DAY_MS), false)
      .pipe(catchError(() => of([] as CalendarItemDto[])))
      .subscribe(items => this.events.set(items.filter(item => item.kind === 'Event')));
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  find(id: string | null | undefined): TaskDto | null {
    if (!id) return null;
    return this.tasks().find(task => task.id === id) ?? (this.extra()?.id === id ? this.extra() : null);
  }

  /** Asks the API for one task and keeps the answer, whether or not it is in the list. */
  open(id: string): Observable<TaskDto> {
    return new Observable<TaskDto>(observer => {
      const request = this.api.getTaskById(id).subscribe({
        next: task => {
          if (task) this.put(task, true);
          observer.next(task);
          observer.complete();
        },
        error: err => observer.error(err)
      });
      return () => request.unsubscribe();
    });
  }

  groupColor(task: TaskDto): string | null {
    return task.groupColor || this.groups().find(group => group.id === task.groupId)?.color || null;
  }

  groupName(task: TaskDto): string {
    return task.groupName || this.groups().find(group => group.id === task.groupId)?.name || '';
  }

  // ── Changes ────────────────────────────────────────────────────────────────

  /**
   * Saves a change to a task. The API replaces the whole task on every save, so
   * the task's other values travel with it.
   */
  save(task: TaskDto, changes: Partial<TaskDto>, failText = t('That change was not saved.')): Promise<boolean> {
    const before = this.find(task.id) ?? task;
    const next = { ...before, ...changes };
    this.put(next);

    return new Promise(resolve => {
      this.api.updateTask(task.id, next).subscribe({
        next: () => {
          // The answer is empty; the server's copy has the names and stamps it works out.
          this.open(task.id).subscribe({ error: () => { /* the local copy stays */ } });
          resolve(true);
        },
        error: err => {
          this.put(before);
          this.toasts.show(apiErrorMessage(err, failText), { tone: 'var(--mq-late)' });
          resolve(false);
        }
      });
    });
  }

  /** Ticks or unticks a task. Completing can be undone from the toast. */
  toggleDone(task: TaskDto): void {
    if (isDone(task)) {
      void this.save(task, { status: 'Pending', completedAt: null });
      return;
    }

    const before = task;
    this.settle(before);
    this.justCompleted.set(task.id);

    void this.save(task, { status: 'Completed', completedAt: new Date().toISOString() }).then(saved => {
      if (!saved) return;
      this.toasts.show(t('Completed “{title}”', { title: task.title }), {
        undo: () => void this.save(this.find(task.id) ?? task, { status: before.status, completedAt: null })
      });
    });
  }

  setStatus(task: TaskDto, status: string): void {
    if (task.status === status) return;
    if (status === 'Completed') {
      this.toggleDone(task);
      return;
    }
    void this.save(task, { status, completedAt: null }, t('Could not move that task.'));
  }

  /** A card dropped in a board column, or sent on with its arrow. */
  move(task: TaskDto, status: string): void {
    if (task.status === status) return;
    this.justMoved.set(task.id);
    setTimeout(() => { if (this.justMoved() === task.id) this.justMoved.set(null); }, LAND_MS);
    const before = task.status;
    const completedAt = status === 'Completed' ? new Date().toISOString() : null;

    void this.save(task, { status, completedAt }, t('Could not move that task.')).then(saved => {
      if (!saved || status !== 'Completed') return;
      this.toasts.show(t('Completed “{title}”', { title: task.title }), {
        undo: () => void this.save(this.find(task.id) ?? task, { status: before, completedAt: null })
      });
    });
  }

  setPriority(task: TaskDto, priority: string): void {
    if (task.priority === priority) return;
    void this.save(task, { priority });
  }

  /** Shift P: the next priority up, back to Low after Critical. */
  cyclePriority(task: TaskDto): void {
    const priority = nextPriority(task.priority);
    void this.save(task, { priority }).then(saved => {
      if (saved) {
        this.toasts.show(
          t('{priority} priority: “{title}”', { priority: priorityLabel(priority), title: task.title }), { duration: 2200 });
      }
    });
  }

  /**
   * Gives the task a block on the calendar, or takes it away (`start` null).
   * The API does not accept a block that starts after the deadline, so a
   * deadline that would be in the way moves to the end of the block.
   */
  schedule(task: TaskDto, start: Date | null): void {
    const before = { startDate: task.startDate ?? null, dueDate: task.dueDate };

    if (!start) {
      void this.save(task, { startDate: null }).then(saved => {
        if (saved) this.toasts.show(t('Removed from your calendar'), { undo: () => void this.save(this.find(task.id) ?? task, before) });
      });
      return;
    }

    const end = new Date(start.getTime() + blockMinutes(task) * MINUTE_MS);
    const due = task.dueDate ? new Date(task.dueDate) : null;
    const deadlineMoves = !!due && due.getTime() < start.getTime();
    const changes: Partial<TaskDto> = { startDate: start.toISOString() };
    if (deadlineMoves) changes.dueDate = end.toISOString();

    void this.save(task, changes, t('That time could not be set.')).then(saved => {
      if (!saved) return;
      const when = dayTimeLabel(start, this.zone(), this.now(), this.hour24());
      this.toasts.show(
        deadlineMoves
          ? t('Scheduled for {when} · deadline moved to match', { when })
          : t('Scheduled for {when}', { when }),
        { undo: () => void this.save(this.find(task.id) ?? task, before) }
      );
    });
  }

  /** Moves the deadline to tomorrow, keeping its time of day. */
  postpone(task: TaskDto): void {
    const before = { dueDate: task.dueDate, startDate: task.startDate ?? null };
    const due = task.dueDate ? new Date(task.dueDate) : null;
    const clock = due ? zonedParts(due, this.zone()) : { hour: 23, minute: 59 };
    const tomorrow = zonedParts(new Date(this.dayStart(1).getTime() + DAY_MS / 2), this.zone());
    const next = zonedTimeToUtc(tomorrow.year, tomorrow.month, tomorrow.day, clock.hour, clock.minute, this.zone());

    // A block planned for today no longer belongs to a task that moved to tomorrow.
    void this.save(task, { dueDate: next.toISOString(), startDate: null }).then(saved => {
      if (saved) this.toasts.show(t('Moved to tomorrow: “{title}”', { title: task.title }), { undo: () => void this.save(this.find(task.id) ?? task, before) });
    });
  }

  create(task: Partial<TaskDto>): Observable<TaskDto> {
    return new Observable<TaskDto>(observer => {
      const request = this.api.createTask(task).subscribe({
        next: created => {
          if (created?.id) this.tasks.update(list => [created, ...list.filter(item => item.id !== created.id)]);
          observer.next(created);
          observer.complete();
        },
        error: err => observer.error(err)
      });
      return () => request.unsubscribe();
    });
  }

  /** Deletes after asking. Resolves true when the task is gone. */
  remove(task: TaskDto): Promise<boolean> {
    const question = t('Delete “{title}” and its discussion? This cannot be undone.', { title: task.title });
    if (!confirm(question)) return Promise.resolve(false);

    const snapshot = this.tasks();
    this.tasks.update(list => list.filter(item => item.id !== task.id));

    return new Promise(resolve => {
      this.api.deleteTask(task.id).subscribe({
        next: () => {
          if (this.extra()?.id === task.id) this.extra.set(null);
          this.toasts.show(t('Deleted “{title}”', { title: task.title }));
          resolve(true);
        },
        error: err => {
          this.tasks.set(snapshot);
          this.toasts.show(apiErrorMessage(err, t('Could not delete that task.')), { tone: 'var(--mq-late)' });
          resolve(false);
        }
      });
    });
  }

  /** Values the checklist and the dependencies report after they save by themselves. */
  patchLocal(id: string, changes: Partial<TaskDto>): void {
    const task = this.find(id);
    if (task) this.put({ ...task, ...changes });
  }

  private put(task: TaskDto, keepIfUnlisted = false): void {
    const listed = this.tasks().some(item => item.id === task.id);
    if (listed) {
      this.tasks.update(list => list.map(item => (item.id === task.id ? task : item)));
    } else if (keepIfUnlisted || this.extra()?.id === task.id) {
      this.extra.set(task);
    }
  }

  private settle(before: TaskDto): void {
    this.settling.update(map => new Map(map).set(before.id, before));
    setTimeout(() => {
      this.settling.update(map => {
        const next = new Map(map);
        next.delete(before.id);
        return next;
      });
      if (this.justCompleted() === before.id) this.justCompleted.set(null);
    }, SETTLE_MS);
  }

  // ── The day ────────────────────────────────────────────────────────────────

  /** Midnight of today (0), tomorrow (1) ... in the profile's time zone. */
  dayStart(offsetDays: number): Date {
    const today = zonedParts(this.now(), this.zone());
    const midnight = zonedTimeToUtc(today.year, today.month, today.day, 0, 0, this.zone());
    if (!offsetDays) return midnight;
    // Noon of the wanted day, then back to its own midnight: safe across a clock change.
    const noon = zonedParts(new Date(midnight.getTime() + offsetDays * DAY_MS + DAY_MS / 2), this.zone());
    return zonedTimeToUtc(noon.year, noon.month, noon.day, 0, 0, this.zone());
  }

  /** The working hours of a day, as instants. 09:00 to 17:00 when none are saved. */
  workHours(offsetDays: number): Stretch {
    const midnight = this.dayStart(offsetDays).getTime();
    const from = clockMinutes(this.settings()?.workDayStart, 9 * 60);
    const until = clockMinutes(this.settings()?.workDayEnd, 17 * 60);
    return { start: midnight + from * MINUTE_MS, end: midnight + Math.max(until, from) * MINUTE_MS };
  }

  /** Meetings (not declined, not all-day) of today and tomorrow. */
  readonly meetings = computed<Stretch[]>(() =>
    this.events()
      .filter(item => !item.isAllDay && item.myResponse !== 'Declined')
      .map(item => ({ start: new Date(item.start).getTime(), end: new Date(item.end).getTime() }))
      .filter(stretch => Number.isFinite(stretch.start) && stretch.end > stretch.start));

  /** The blocks other open tasks already have. */
  private blocksExcept(taskId: string): Stretch[] {
    return this.tasks()
      .filter(task => task.id !== taskId && task.startDate && !isClosed(task))
      .map(task => {
        const start = new Date(task.startDate!).getTime();
        return { start, end: start + blockMinutes(task) * MINUTE_MS };
      })
      .filter(stretch => Number.isFinite(stretch.start));
  }

  /**
   * The next place the task fits: later today inside working hours, clear of
   * meetings and of other tasks' blocks, otherwise tomorrow. null when both days are full.
   */
  nextFreeSlot(task: TaskDto): FreeSlot | null {
    const minutes = blockMinutes(task);
    const busy = [...this.meetings(), ...this.blocksExcept(task.id)];
    const now = roundUpToQuarter(this.now().getTime());

    for (const offset of [0, 1]) {
      const hours = this.workHours(offset);
      const window = { start: Math.max(hours.start, now), end: hours.end };
      const start = firstFreeStart(busy, window, minutes);
      if (start !== null) return { start: new Date(start), end: new Date(start + minutes * MINUTE_MS) };
    }
    return null;
  }

  /** Opens the "Schedule" pop-up for a task, next to the control that asked. */
  askSchedule(task: TaskDto, anchor: Element | null): void {
    const rect = anchor?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 3, 0, 0);
    this.scheduleRequest.set({ task, anchor: rect });
  }
}
