import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { TaskService } from '../../../core/services/task.service';
import { CalendarService } from '../../../core/services/calendar.service';
import { CalendarDataService } from '../../../core/services/calendar-data.service';
import { MentionService } from '../../../core/services/mention.service';
import { NotificationService } from '../../../core/services/notification.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { UserService } from '../../../core/services/user.service';
import { LocalPrefsService } from '../../../core/services/local-prefs.service';
import { ToastService } from '../../../core/services/toast.service';
import { CalendarItemDto, MentionDto, NotificationDto, TaskDto } from '../../../models/api.models';
import { apiErrorMessage } from '../../../core/http/api-error';
import { formatTimeInZone, zonedTimeToUtc } from '../../../core/utils/time-zone';
import { PRAYER_METHODS, placeForZone, prayerLabel, prayerTimes } from '../../../core/utils/prayer-times';
import { estimateMinutes, formatDuration, formatEstimate } from '../../../core/utils/task-estimate';
import { addDays, todayIn, weekdayOf } from '../../../core/utils/quick-parse';
import { isArabic, locale, num, t, tCount } from '../../../core/i18n/i18n';
import { TCountPipe, TPipe } from '../../../core/i18n/t.pipe';
import {
  DayPlan, PlanOptions, PlanTask, Stretch, blockedStretches, minutesCovered, nearestStart, planDay, samePlan,
  workload
} from '../../../core/utils/day-plan';

/** Pixels per hour of the day column, as in the design. */
const HOUR_PX = 60;
const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;
/** Starts fall on five-minute marks. */
const STEP = 5;
/** Minutes kept free after a meeting ("10 minutes to reset"). */
const BUFFER_MINUTES = 10;
/** Minutes kept free from each prayer time. */
const PRAYER_PAUSE_MINUTES = 15;
/** What a task with no estimate is planned as. */
const DEFAULT_TASK_MINUTES = 30;
/** How many late tasks are listed before "Show more". */
const OVERDUE_SHOWN = 6;
/** The names the API uses for the days of the week (working days). Never shown. */
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type StepState = 'done' | 'now' | 'next';

interface PickRow {
  id: string;
  title: string;
  project: string;
  color: string | null;
  estimate: string;
  /** True when the task has no estimate and half an hour is assumed. */
  assumed: boolean;
  due: string;
  late: boolean;
  on: boolean;
  /** Ticked, but nothing in what is left of the day is long enough. */
  noRoom: boolean;
}

interface PickGroup {
  key: 'planned' | 'today' | 'overdue' | 'mentions';
  title: string;
  late: boolean;
  rows: PickRow[];
  /** Late tasks left out of the list until "Show more" is pressed. */
  hidden: number;
}

interface Block {
  id: string;
  kind: 'meeting' | 'lunch' | 'task';
  title: string;
  time: string;
  tag: string;
  top: number;
  height: number;
  /** Colour of the calendar a meeting is on. */
  tone: string | null;
  start: number;
  minutes: number;
  /** Tasks only: place among the suggestions, for the staggered arrival. */
  order: number;
  /** Meetings at the same time share the width: which column this one is in, and of how many. */
  lane: number;
  lanes: number;
  dragging: boolean;
  landed: boolean;
}

/**
 * "Plan my day" (design/miqat-2.0: V2-PlanDay), on the route that used to be the
 * dashboard.
 *
 * The left column lists what could go into today; ticking a task places it in the
 * free time of the day (see core/utils/day-plan.ts for the rule). "Commit plan"
 * saves each placed task's time block as its start date.
 */
@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [RouterLink, TPipe, TCountPipe],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardPage implements OnInit {
  private taskApi = inject(TaskService);
  private calendarApi = inject(CalendarService);
  private calendarData = inject(CalendarDataService);
  private mentionApi = inject(MentionService);
  private notificationApi = inject(NotificationService);
  private realtime = inject(RealtimeService);
  private users = inject(UserService);
  private toasts = inject(ToastService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  readonly prefs = inject(LocalPrefsService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly committing = signal(false);
  readonly committed = signal(false);
  readonly showAllOverdue = signal(false);

  private readonly tasks = signal<TaskDto[]>([]);
  private readonly events = signal<CalendarItemDto[]>([]);
  /** Open tasks the user was mentioned in and has not read yet, with when. */
  private readonly mentioned = signal<{ task: TaskDto; at: string }[]>([]);
  private readonly now = signal(new Date());

  /** Ids of the ticked tasks. */
  private readonly picked = signal<ReadonlySet<string>>(new Set());
  /** Starts the user chose by dragging, or that were saved earlier: task id to minute of the day. */
  private readonly fixed = signal<ReadonlyMap<string, number>>(new Map());
  /** Which arrangement "Shuffle" is on; 0 is the rule as stated. */
  private readonly variant = signal(0);
  /** The block being dragged and where it is held. */
  private readonly held = signal<{ id: string; start: number } | null>(null);
  private readonly landedId = signal<string | null>(null);
  /** True while a whole plan arrives, so its blocks come in one after the other. */
  readonly staggered = signal(true);

  private drag: { id: string; pointerY: number; start: number; minutes: number; moved: boolean } | null = null;
  /** The first answer decides what is ticked; later reloads leave the user's ticks alone. */
  private defaultsSet = false;

  private readonly zone = this.users.timeZone;
  private readonly hour24 = this.calendarData.use24HourClock;

  // ── The day ────────────────────────────────────────────────────────────────

  private readonly today = computed(() => todayIn(this.now(), this.zone()));
  private readonly dayStart = computed(() => {
    const day = this.today();
    return zonedTimeToUtc(day.year, day.month, day.day, 0, 0, this.zone());
  });

  /** "Thursday, 12 November" */
  readonly dateLabel = computed(() => {
    const parts = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: this.zone() })
      .formatToParts(this.dayStart().getTime() + 12 * 60 * MINUTE);
    const part = (type: string) => parts.find(candidate => candidate.type === type)?.value ?? '';
    return t('{weekday}, {day} {month}', { weekday: part('weekday'), day: part('day'), month: part('month') });
  });

  private readonly workStart = computed(() => this.minutesOf(this.calendarData.settings()?.workDayStart, 9 * 60));
  private readonly workEnd = computed(() => {
    const end = this.minutesOf(this.calendarData.settings()?.workDayEnd, 17 * 60);
    return end > this.workStart() ? end : DAY_MINUTES;
  });
  readonly capacity = computed(() => this.workEnd() - this.workStart());

  private readonly nowMinute = computed(() => this.minuteOf(this.now()));

  /** Today's meetings: events with a time that the user has not declined. */
  private readonly meetings = computed(() => this.events()
    .filter(item => item.kind === 'Event' && !item.isAllDay && item.myResponse !== 'Declined')
    .map(item => ({
      item,
      start: Math.max(0, this.minuteOf(new Date(item.start))),
      end: Math.min(DAY_MINUTES, this.minuteOf(new Date(item.end)))
    }))
    .filter(meeting => meeting.end > meeting.start)
    .sort((a, b) => a.start - b.start));

  private readonly place = computed(() => placeForZone(this.zone()));

  /** The day's prayer times, when the place is known. */
  private readonly prayers = computed(() => {
    const place = this.place();
    if (!place) return [];
    const day = this.today();
    return prayerTimes(day.year, day.month, day.day, place, this.prefs.prayerMethod() ?? place.method)
      .filter(prayer => prayer.name !== 'Sunrise')
      .map(prayer => ({ name: prayer.name, at: prayer.at, minute: this.minuteOf(prayer.at) }));
  });

  readonly planAroundPrayer = computed(() => !!this.place() && this.prefs.planAroundPrayer());

  private readonly lunch = computed<Stretch | null>(() => {
    if (!this.prefs.protectLunch()) return null;
    const start = this.minutesOf(this.prefs.lunchStart(), 13 * 60);
    const end = this.minutesOf(this.prefs.lunchEnd(), 14 * 60);
    return end > start ? { start, end } : null;
  });

  /** The hours on show: one before the working day to two after it, and wider when a meeting needs it. */
  private readonly axis = computed(() => {
    let from = Math.max(0, Math.floor(this.workStart() / 60) - 1);
    let to = Math.min(24, Math.max(Math.ceil(this.workEnd() / 60) + 2, from + 11));
    for (const meeting of this.meetings()) {
      from = Math.min(from, Math.floor(meeting.start / 60));
      to = Math.max(to, Math.ceil(meeting.end / 60));
    }
    return { from: from * 60, to: to * 60 };
  });

  readonly axisHeight = computed(() => ((this.axis().to - this.axis().from) / 60) * HOUR_PX);

  readonly hours = computed(() => {
    const { from, to } = this.axis();
    const labels: { label: string; top: number }[] = [];
    for (let minute = from + 60; minute <= to; minute += 60) {
      labels.push({ label: this.hourLabel(minute), top: this.y(minute) - 7 });
    }
    return labels;
  });

  readonly lines = computed(() => {
    const { from, to } = this.axis();
    const tops: number[] = [];
    for (let minute = from + 60; minute < to; minute += 60) tops.push(this.y(minute));
    return tops;
  });

  readonly prayerLines = computed(() => {
    if (!this.planAroundPrayer()) return [];
    const { from, to } = this.axis();
    return this.prayers()
      .filter(prayer => prayer.minute > from && prayer.minute < to)
      .map(prayer => ({ label: `${prayerLabel(prayer.name)} ${this.time(prayer.at)}`, top: this.y(prayer.minute) }));
  });

  /** Where the "now" line is; null when the hour is not on show. */
  readonly nowLine = computed(() => {
    const minute = this.nowMinute();
    const { from, to } = this.axis();
    return minute >= from && minute <= to ? { top: this.y(minute), label: t('Now, {time}', { time: this.time(this.now()) }) } : null;
  });

  // ── The task picker ────────────────────────────────────────────────────────

  private readonly openTasks = computed(() => this.tasks().filter(task => this.isOpen(task)));

  private readonly sorted = computed(() => {
    const start = this.dayStart().getTime();
    const end = start + DAY_MINUTES * MINUTE;
    const time = (value: string | null | undefined) => {
      const stamp = value ? new Date(value).getTime() : NaN;
      return Number.isNaN(stamp) ? null : stamp;
    };

    const planned: TaskDto[] = [];
    const today: TaskDto[] = [];
    const overdue: TaskDto[] = [];
    for (const task of this.openTasks()) {
      const due = time(task.dueDate);
      const begins = time(task.startDate);
      const plannedToday = begins !== null && begins >= start && begins < end;
      if (due !== null && due < start && !plannedToday) overdue.push(task);
      else if (due !== null && due >= start && due < end) today.push(task);
      else if (plannedToday) planned.push(task);
    }

    const byDue = (a: TaskDto, b: TaskDto) => (time(a.dueDate) ?? 0) - (time(b.dueDate) ?? 0);
    today.sort(byDue);
    // The most recently missed first: those are the ones still on the user's mind.
    overdue.sort((a, b) => byDue(b, a));

    const listed = new Set([...planned, ...today, ...overdue].map(task => task.id));
    const mentions = this.mentioned().filter(entry => !listed.has(entry.task.id));
    return { planned, today, overdue, mentions };
  });

  readonly groups = computed<PickGroup[]>(() => {
    const { planned, today, overdue, mentions } = this.sorted();
    const start = this.dayStart().getTime();
    const shown = this.showAllOverdue() ? overdue : overdue.slice(0, OVERDUE_SHOWN);

    const groups: PickGroup[] = [
      { key: 'planned', title: t('Planned for today'), late: false, hidden: 0, rows: planned.map(task => this.row(task, this.dueLabel(task), false)) },
      { key: 'today', title: t('Due today'), late: false, hidden: 0, rows: today.map(task => this.row(task, this.dueLabel(task), false)) },
      {
        key: 'overdue', title: t('Overdue'), late: true, hidden: overdue.length - shown.length,
        rows: shown.map(task => {
          const days = Math.max(1, Math.ceil((start - new Date(task.dueDate).getTime()) / (DAY_MINUTES * MINUTE)));
          return this.row(task, tCount(days, '{n}d late', '{n}d late'), true);
        })
      },
      { key: 'mentions', title: t('From mentions'), late: false, hidden: 0, rows: mentions.map(entry => this.row(entry.task, this.ago(entry.at), false)) }
    ];
    return groups.filter(group => group.rows.length > 0);
  });

  /** Every task that can be ticked, by id. */
  private readonly candidates = computed(() => {
    const { planned, today, overdue, mentions } = this.sorted();
    return new Map([...planned, ...today, ...overdue, ...mentions.map(entry => entry.task)].map(task => [task.id, task]));
  });

  readonly pickedCount = computed(() => [...this.picked()].filter(id => this.candidates().has(id)).length);

  // ── The plan ───────────────────────────────────────────────────────────────

  private readonly options = computed<PlanOptions>(() => ({
    dayStart: this.workStart(),
    dayEnd: this.workEnd(),
    notBefore: Math.ceil(this.nowMinute() / STEP) * STEP,
    meetings: this.meetings().map(meeting => ({ start: meeting.start, end: meeting.end })),
    bufferAfterMeetings: this.prefs.bufferAfterMeetings() ? BUFFER_MINUTES : 0,
    lunch: this.lunch(),
    prayers: this.planAroundPrayer() ? this.prayers().map(prayer => prayer.minute) : [],
    prayerPause: PRAYER_PAUSE_MINUTES,
    step: STEP
  }));

  private readonly planTasks = computed<PlanTask[]>(() => {
    const fixed = this.fixed();
    return [...this.picked()]
      .map(id => this.candidates().get(id))
      .filter((task): task is TaskDto => !!task)
      .map(task => ({
        id: task.id,
        minutes: this.minutesFor(task),
        due: task.dueDate ? new Date(task.dueDate).getTime() : null,
        fixedStart: fixed.get(task.id) ?? null
      }));
  });

  readonly plan = computed<DayPlan>(() => planDay(this.planTasks(), this.options(), this.variant()));

  readonly blocks = computed<Block[]>(() => {
    const blocks: Block[] = [];
    const held = this.held();

    const lanes = this.lanesOf(this.meetings());
    this.meetings().forEach((meeting, index) => {
      blocks.push({
        id: `m:${meeting.item.id}:${meeting.item.start}`, kind: 'meeting', title: meeting.item.title,
        time: this.time(new Date(meeting.item.start)),
        tag: meeting.item.attendeeCount > 0 ? t('Meeting') : t('Event'),
        top: this.y(meeting.start) + 1, height: this.blockHeight(meeting.end - meeting.start),
        tone: meeting.item.color ?? null, start: meeting.start, minutes: meeting.end - meeting.start,
        order: 0, lane: lanes[index].lane, lanes: lanes[index].lanes, dragging: false, landed: false
      });
    });

    const lunch = this.lunch();
    if (lunch) {
      blocks.push({
        id: 'lunch', kind: 'lunch', title: t('Lunch'), time: this.clock(lunch.start), tag: t('Protected'),
        top: this.y(lunch.start) + 1, height: this.blockHeight(lunch.end - lunch.start),
        tone: null, start: lunch.start, minutes: lunch.end - lunch.start, order: 0, lane: 0, lanes: 1,
        dragging: false, landed: false
      });
    }

    this.plan().placed.forEach((placed, order) => {
      const task = this.candidates().get(placed.id);
      if (!task) return;
      const dragging = held?.id === placed.id;
      const start = dragging ? held!.start : placed.start;
      blocks.push({
        id: placed.id, kind: 'task', title: task.title, time: this.clock(start),
        tag: formatEstimate(placed.end - placed.start),
        top: this.y(start) + 1, height: this.blockHeight(placed.end - placed.start),
        tone: null, start, minutes: placed.end - placed.start, order, lane: 0, lanes: 1,
        dragging, landed: this.landedId() === placed.id
      });
    });
    return blocks;
  });

  // ── Workload ───────────────────────────────────────────────────────────────

  readonly load = computed(() => {
    const meetingMinutes = minutesCovered(this.meetings());
    const taskMinutes = this.planTasks().reduce((sum, task) => sum + task.minutes, 0);
    return workload(meetingMinutes, taskMinutes, this.capacity());
  });

  readonly totalLabel = computed(() => formatDuration(this.load().totalMinutes));
  readonly capacityLabel = computed(() => t('of {duration} workday', { duration: formatDuration(this.capacity()) }));
  readonly meetingLabel = computed(() => formatDuration(this.load().meetingMinutes));
  readonly taskLabel = computed(() => formatDuration(this.load().taskMinutes));
  readonly freeLabel = computed(() => formatDuration(this.load().freeMinutes));
  readonly meterLabel = computed(() => t('Meetings {meetings}, tasks {tasks}, of {duration} workday', {
    meetings: this.meetingLabel(), tasks: this.taskLabel(), duration: formatDuration(this.capacity())
  }));

  /** The lines under the meter. Each is a fact about today, nothing more. */
  readonly verdict = computed<{ text: string; bad: boolean }[]>(() => {
    const load = this.load();
    const lines: { text: string; bad: boolean }[] = [];

    if (load.over) {
      // The task that can wait longest is the one to move.
      const latest = (task: PlanTask) => task.due ?? Number.MAX_SAFE_INTEGER;
      const last = [...this.planTasks()].sort((a, b) => latest(b) - latest(a))[0];
      const title = last ? this.candidates().get(last.id)?.title : '';
      const duration = formatDuration(load.totalMinutes - load.capacityMinutes);
      const next = this.nextWorkDay();
      lines.push({
        text: !title ? t('Over capacity by {duration}.', { duration })
          : next === null ? t('Over capacity by {duration}. Miqat suggests moving “{title}” to tomorrow.', { duration, title })
          : t('Over capacity by {duration}. Miqat suggests moving “{title}” to {weekday}.', { duration, title, weekday: next }),
        bad: true
      });
    } else {
      lines.push({ text: t('Balanced. {duration} left for the unexpected.', { duration: formatDuration(load.freeMinutes) }), bad: false });
    }

    const waiting = this.plan().unplaced.length;
    if (waiting) {
      lines.push({
        text: this.nowMinute() >= this.workEnd()
          ? t('Your working day ended at {time}: nothing more can be placed today.', { time: this.clock(this.workEnd()) })
          : tCount(waiting, '{n} ticked task does not fit in what is left of today.', '{n} ticked tasks do not fit in what is left of today.'),
        bad: true
      });
    }

    const cap = this.prefs.meetingCapHours() * 60;
    if (this.prefs.capMeetings() && load.meetingMinutes > cap) {
      lines.push({
        text: t('Meetings are {duration} over your {hours} h cap.', { duration: formatDuration(load.meetingMinutes - cap), hours: this.prefs.meetingCapHours() }),
        bad: true
      });
    }
    return lines;
  });

  readonly rules = computed(() => {
    const place = this.place();
    const method = place ? PRAYER_METHODS[this.prefs.prayerMethod() ?? place.method].label : '';
    return [
      {
        key: 'buffer', label: t('Buffer after meetings'), hint: tCount(BUFFER_MINUTES, '{n} minute to reset', '{n} minutes to reset'),
        on: this.prefs.bufferAfterMeetings(), disabled: false, why: ''
      },
      {
        key: 'prayer', label: t('Plan around prayer times'),
        hint: place ? `${place.city} · ${method}` : t('Not available for your time zone'),
        on: this.planAroundPrayer(), disabled: !place,
        why: place ? '' : t('Prayer times are worked out for the main city of your time zone, and yours is not on the list')
      },
      {
        key: 'lunch', label: t('Protect lunch'), hint: `${num(this.prefs.lunchStart())} – ${num(this.prefs.lunchEnd())}`,
        on: this.prefs.protectLunch(), disabled: false, why: ''
      },
      {
        key: 'cap', label: t('Cap meetings at {hours} h', { hours: this.prefs.meetingCapHours() }), hint: t('Warn when meetings pass the cap'),
        on: this.prefs.capMeetings(), disabled: false, why: ''
      }
    ];
  });

  // ── Yesterday ──────────────────────────────────────────────────────────────

  /** Built from counts only: what was planned or due yesterday, and how much of it is done. */
  readonly yesterday = computed(() => {
    const end = this.dayStart().getTime();
    const start = end - DAY_MINUTES * MINUTE;
    const within = (value: string | null | undefined) => {
      const stamp = value ? new Date(value).getTime() : NaN;
      return !Number.isNaN(stamp) && stamp >= start && stamp < end;
    };

    const wanted = this.tasks().filter(task => task.status !== 'Cancelled' && (within(task.dueDate) || within(task.startDate)));
    const done = wanted.filter(task => task.status === 'Completed').length;
    const finished = this.tasks().filter(task => within(task.completedAt)).length;

    if (wanted.length) {
      const left = wanted.length - done;
      const rest = left
        ? tCount(left, '{n} still open is listed under Overdue.', '{n} still open are listed under Overdue.')
        : t('Nothing was carried over.');
      const summary = tCount(wanted.length, 'You finished {done} of {n} task planned or due yesterday.',
        'You finished {done} of {n} tasks planned or due yesterday.', { done });
      return `${summary} ${rest}`;
    }
    const nothing = t('Nothing was planned or due yesterday.');
    return finished
      ? `${nothing} ${tCount(finished, 'You completed {n} task anyway.', 'You completed {n} tasks anyway.')}`
      : nothing;
  });

  // ── Steps ──────────────────────────────────────────────────────────────────

  readonly steps = computed(() => {
    const loading = this.loading();
    const picked = this.pickedCount() > 0;
    const done = this.committed();
    const states: [string, StepState][] = [
      [t('Review yesterday'), loading ? 'now' : 'done'],
      [t('Choose tasks'), loading ? 'next' : picked ? 'done' : 'now'],
      [t('Schedule@@step'), done ? 'done' : !loading && picked ? 'now' : 'next'],
      [t('Commit'), done ? 'done' : 'next']
    ];
    return states.map(([label, state], index) => ({ label, state, mark: state === 'done' ? '✓' : num(index + 1) }));
  });

  readonly canCommit = computed(() => !this.committing() && !this.loading() && this.changes().length > 0);
  readonly commitWhy = computed(() => {
    if (this.loading()) return t('Loading your day');
    if (this.changes().length) return '';
    return this.pickedCount() ? t('Nothing to save: these tasks are already planned at these times') : t('Tick at least one task first');
  });

  ngOnInit() {
    this.reload();

    // Working hours and work days, when no other page has loaded them yet.
    if (!this.calendarData.settings()) this.calendarData.reloadLists();
    if (!this.users.currentUser()) this.users.getMe().pipe(catchError(() => of(null))).subscribe();

    // A task or an event changed somewhere else (another member, another tab).
    this.realtime.taskChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.reload(true));
    this.realtime.eventChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.reload(true));

    // The "now" line, and what is still ahead of it.
    const clock = setInterval(() => this.now.set(new Date()), 30_000);
    const settle = setTimeout(() => this.staggered.set(false), 1600);
    this.destroyRef.onDestroy(() => {
      clearInterval(clock);
      clearTimeout(settle);
      this.onBlockUp();
    });
  }

  /** `quiet` reloads without the loading shapes, after a change made elsewhere. */
  reload(quiet = false) {
    if (!quiet) this.loading.set(true);
    this.error.set('');
    const from = this.dayStart();
    const to = new Date(from.getTime() + DAY_MINUTES * MINUTE);

    forkJoin({
      tasks: this.taskApi.getTasks(),
      events: this.calendarApi.getFeed(from, to, false).pipe(catchError(() => of([] as CalendarItemDto[]))),
      mentions: this.mentionApi.getUnreadMentions().pipe(catchError(() => of([] as MentionDto[]))),
      unread: this.notificationApi.getUnread().pipe(catchError(() => of([] as NotificationDto[])))
    }).subscribe({
      next: ({ tasks, events, mentions, unread }) => {
        this.tasks.set(tasks ?? []);
        this.events.set(events ?? []);
        this.readMentions(mentions ?? [], unread ?? [], tasks ?? []);
        if (!this.defaultsSet) this.setDefaults();
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        if (!quiet) this.error.set(apiErrorMessage(err, t('Your tasks could not be loaded.')));
      }
    });
  }

  /** Due today is ticked to begin with; what was planned for today earlier keeps its time. */
  private setDefaults() {
    this.defaultsSet = true;
    const { planned, today } = this.sorted();
    const start = this.dayStart().getTime();
    const fixed = new Map<string, number>();
    for (const task of [...planned, ...today]) {
      const begins = task.startDate ? new Date(task.startDate).getTime() : NaN;
      if (begins >= start && begins < start + DAY_MINUTES * MINUTE) fixed.set(task.id, this.minuteOf(new Date(begins)));
    }
    this.fixed.set(fixed);
    this.picked.set(new Set([...planned, ...today].map(task => task.id)));
  }

  /**
   * The tasks the user was mentioned in and has not read yet. The API keeps one
   * mention per person and task and does not mark it unread again on a second
   * mention, so the unread "you were mentioned" notifications count as well.
   * Both carry a task id only: the tasks are found in the list, or asked for.
   */
  private readMentions(mentions: MentionDto[], unread: NotificationDto[], tasks: TaskDto[]) {
    const wanted = new Map<string, string>();
    for (const n of unread) {
      const onTask = (n.type ?? '').includes('Mention') && (n.linkedEntityType ?? '').toLowerCase() === 'taskitem';
      if (onTask && n.linkedEntityId && !wanted.has(n.linkedEntityId)) wanted.set(n.linkedEntityId, n.createdAt);
    }
    for (const mention of mentions) {
      const type = String(mention.entityType ?? '').toLowerCase();
      const isTask = type === '1' || type === 'task' || type === 'taskitem';
      if (isTask && mention.entityId && !wanted.has(mention.entityId)) wanted.set(mention.entityId, mention.createdAt);
    }

    const known = new Map(tasks.map(task => [task.id, task]));
    const found: { task: TaskDto; at: string }[] = [];
    const missing: string[] = [];
    for (const [id, at] of wanted) {
      const task = known.get(id);
      if (task) found.push({ task, at });
      else missing.push(id);
    }
    this.mentioned.set(found.filter(entry => this.isOpen(entry.task)));

    // A mention can be on a task the user can see without owning it.
    if (!missing.length) return;
    forkJoin(missing.slice(0, 6).map(id => this.taskApi.getTaskById(id).pipe(catchError(() => of(null)))))
      .subscribe(loaded => {
        const extra = loaded
          .filter((task): task is TaskDto => !!task && this.isOpen(task))
          .map(task => ({ task, at: wanted.get(task.id) ?? '' }));
        if (extra.length) this.mentioned.update(list => [...list, ...extra]);
      });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  toggle(id: string) {
    this.committed.set(false);
    this.staggered.set(false);
    this.picked.update(current => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // Ticking a task again plans it afresh.
    if (this.fixed().has(id)) {
      this.fixed.update(current => {
        const next = new Map(current);
        next.delete(id);
        return next;
      });
    }
  }

  /** Another arrangement that obeys the same rule. Starts the user chose stay. */
  shuffle() {
    const current = this.plan();
    const tasks = this.planTasks();
    for (let step = 1; step <= 40; step++) {
      const seed = this.variant() + step;
      const other = planDay(tasks, this.options(), seed);
      // Another order may leave no room for a long task: such an arrangement is not offered.
      if (other.unplaced.length <= current.unplaced.length && !samePlan(other, current)) {
        this.variant.set(seed);
        return;
      }
    }
    this.toasts.show(current.placed.length > 1
      ? t('These tasks fit today in one way only')
      : t('Tick two or more tasks to shuffle them'));
  }

  setRule(key: string, on: boolean) {
    switch (key) {
      case 'buffer': this.prefs.bufferAfterMeetings.set(on); break;
      case 'prayer': this.prefs.planAroundPrayer.set(on); break;
      case 'lunch': this.prefs.protectLunch.set(on); break;
      case 'cap': this.prefs.capMeetings.set(on); break;
    }
  }

  // Dragging a suggested block. It lands on the nearest free start.

  onBlockDown(event: PointerEvent, block: Block) {
    if (block.kind !== 'task' || event.button !== 0) return;
    this.drag = { id: block.id, pointerY: event.clientY, start: block.start, minutes: block.minutes, moved: false };
    // The pointer is followed on the whole page until it is let go, wherever it wanders.
    document.addEventListener('pointermove', this.onBlockMove);
    document.addEventListener('pointerup', this.onBlockUp);
    document.addEventListener('pointercancel', this.onBlockUp);
  }

  private readonly onBlockMove = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag) return;
    const moved = event.clientY - drag.pointerY;
    if (!drag.moved && Math.abs(moved) < 4) return;
    drag.moved = true;
    const { from, to } = this.axis();
    const wanted = Math.round((drag.start + (moved / HOUR_PX) * 60) / STEP) * STEP;
    this.held.set({ id: drag.id, start: Math.min(to - drag.minutes, Math.max(from, wanted)) });
  };

  private readonly onBlockUp = () => {
    document.removeEventListener('pointermove', this.onBlockMove);
    document.removeEventListener('pointerup', this.onBlockUp);
    document.removeEventListener('pointercancel', this.onBlockUp);
    const drag = this.drag;
    const held = this.held();
    this.drag = null;
    this.held.set(null);
    if (drag?.moved && held) this.moveTo(drag.id, held.start, drag.minutes);
  };

  /** Arrow keys move a suggested block a quarter of an hour, past whatever is in the way. */
  onBlockKey(event: KeyboardEvent, block: Block) {
    if (block.kind !== 'task' || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const { from, to } = this.axis();
    const blocked = this.hardBlocks(block.id);
    for (let wanted = block.start + direction * 15; wanted >= from && wanted + block.minutes <= to; wanted += direction * STEP) {
      const start = nearestStart(wanted, block.minutes, blocked, this.earliest(), to, STEP);
      if (start !== null && (direction > 0 ? start > block.start : start < block.start)) {
        this.pin(block.id, start);
        return;
      }
    }
  }

  private moveTo(id: string, wanted: number, minutes: number) {
    const start = nearestStart(wanted, minutes, this.hardBlocks(id), this.earliest(), this.axis().to, STEP);
    if (start === null) {
      this.toasts.show(t('There is no free time long enough for it today'));
      return;
    }
    this.pin(id, start);
  }

  private pin(id: string, start: number) {
    this.committed.set(false);
    this.staggered.set(false);
    this.fixed.update(current => new Map(current).set(id, start));
    this.landedId.set(id);
    setTimeout(() => { if (this.landedId() === id) this.landedId.set(null); }, 400);
  }

  /** What a moved block may not cover: meetings, lunch, prayer times and the other pinned blocks. */
  private hardBlocks(exceptId: string): Stretch[] {
    const blocked = blockedStretches(this.options());
    for (const placed of this.plan().placed) {
      if (placed.fixed && placed.id !== exceptId) blocked.push({ start: placed.start, end: placed.end });
    }
    return blocked;
  }

  private earliest(): number {
    return Math.max(this.axis().from, Math.ceil(this.nowMinute() / STEP) * STEP);
  }

  // ── Commit ─────────────────────────────────────────────────────────────────

  /**
   * What "Commit plan" would save: a start for each placed task, and no start for
   * a task that was planned for today and is now unticked. The API wants a task's
   * start no later than its due date, so a block that ends after the deadline (a
   * late task planned for today) moves the deadline to the end of the block.
   */
  private readonly changes = computed(() => {
    const dayStart = this.dayStart().getTime();
    const changes: { before: TaskDto; after: TaskDto }[] = [];

    for (const placed of this.plan().placed) {
      const task = this.candidates().get(placed.id);
      if (!task) continue;
      const start = new Date(dayStart + placed.start * MINUTE);
      const end = new Date(dayStart + placed.end * MINUTE);
      const due = task.dueDate ? new Date(task.dueDate) : null;
      const startDate = start.toISOString();
      const dueDate = !due || due.getTime() < end.getTime() ? end.toISOString() : task.dueDate;
      const sameStart = !!task.startDate && new Date(task.startDate).getTime() === start.getTime();
      if (!sameStart || dueDate !== task.dueDate) changes.push({ before: task, after: { ...task, startDate, dueDate } });
    }

    // A task that had a block today and is no longer ticked gives its block up.
    const picked = this.picked();
    for (const task of this.candidates().values()) {
      const begins = task.startDate ? new Date(task.startDate).getTime() : NaN;
      const plannedToday = begins >= dayStart && begins < dayStart + DAY_MINUTES * MINUTE;
      if (plannedToday && !picked.has(task.id)) changes.push({ before: task, after: { ...task, startDate: null } });
    }
    return changes;
  });

  commit() {
    if (!this.canCommit()) return;
    const changes = this.changes();
    const placed = this.plan().placed.length;
    const save = (list: TaskDto[]) => forkJoin(list.map(task =>
      this.taskApi.updateTask(task.id, task).pipe(map(() => true), catchError(() => of(false)))));

    this.committing.set(true);
    save(changes.map(change => change.after)).subscribe(results => {
      this.committing.set(false);
      const failed = results.filter(ok => !ok).length;
      if (failed === results.length) {
        this.toasts.show(t('The plan could not be saved. Try again.'), { tone: 'var(--mq-late)' });
        return;
      }

      this.committed.set(true);
      this.rememberCommit();
      this.calendarData.reloadItems();
      const moved = changes.filter(change => change.after.startDate && change.after.dueDate !== change.before.dueDate && change.before.dueDate).length;
      const text = [
        tCount(placed, 'Plan committed: {n} task is on your calendar', 'Plan committed: {n} tasks are on your calendar'),
        moved ? tCount(moved, '{n} late task is now due today', '{n} late tasks are now due today') : '',
        failed ? tCount(failed, '{n} could not be saved', '{n} could not be saved') : ''
      ].filter(Boolean).join(' · ');

      this.toasts.show(text, {
        duration: 8000,
        undo: () => save(changes.map(change => change.before)).subscribe(() => {
          this.calendarData.reloadItems();
          this.toasts.show(t('The plan was taken back'));
        })
      });
      this.router.navigate(['/calendar']);
    });
  }

  /** Days a plan was committed on, for the weekly recap in the Inbox. Kept in the browser. */
  private rememberCommit() {
    const day = this.today();
    const key = `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
    const days = this.prefs.value<string[]>('plan.committedDays', []);
    if (!days().includes(key)) days.set([...days(), key].slice(-60));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private row(task: TaskDto, due: string, late: boolean): PickRow {
    const minutes = estimateMinutes(task);
    const on = this.picked().has(task.id);
    return {
      id: task.id,
      title: task.title,
      project: task.groupName || t('No project'),
      color: task.groupColor || null,
      estimate: formatEstimate(minutes ?? DEFAULT_TASK_MINUTES),
      assumed: minutes === null,
      due,
      late,
      on,
      noRoom: on && this.plan().unplaced.includes(task.id)
    };
  }

  /** Meetings (sorted by start) that overlap are put side by side: a column for each, and how many columns. */
  private lanesOf(meetings: Stretch[]): { lane: number; lanes: number }[] {
    const result = meetings.map(() => ({ lane: 0, lanes: 1 }));
    let cluster: number[] = [];
    let clusterEnd = -1;
    let ends: number[] = [];
    const close = () => {
      for (const index of cluster) result[index].lanes = ends.length;
    };

    meetings.forEach((meeting, index) => {
      if (meeting.start >= clusterEnd) {
        close();
        cluster = [];
        ends = [];
      }
      let lane = ends.findIndex(end => end <= meeting.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = meeting.end;
      result[index].lane = lane;
      cluster.push(index);
      clusterEnd = Math.max(clusterEnd, meeting.end);
    });
    close();
    return result;
  }

  private minutesFor(task: TaskDto): number {
    return estimateMinutes(task) ?? DEFAULT_TASK_MINUTES;
  }

  private isOpen(task: TaskDto): boolean {
    return task.status !== 'Completed' && task.status !== 'Cancelled';
  }

  /** "Today 17:00", or "Today" for a date with no time of its own. */
  private dueLabel(task: TaskDto): string {
    if (!task.dueDate) return '';
    const due = new Date(task.dueDate);
    const start = this.dayStart().getTime();
    const minute = this.minuteOf(due);
    if (due.getTime() >= start + DAY_MINUTES * MINUTE) {
      const parts = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: this.zone() })
        .formatToParts(due);
      const part = (type: string) => parts.find(candidate => candidate.type === type)?.value ?? '';
      return t('Due {date}', { date: `${part('weekday')} ${part('day')} ${part('month')}` });
    }
    return minute <= 0 || minute >= DAY_MINUTES - 1 ? t('Today') : t('Today {time}', { time: this.time(due) });
  }

  /** "20 min ago", "3 h ago", "2 d ago" */
  private ago(value: string): string {
    const stamp = new Date(value).getTime();
    if (Number.isNaN(stamp)) return '';
    const minutes = Math.max(0, Math.floor((this.now().getTime() - stamp) / MINUTE));
    if (minutes < 1) return t('Just now');
    if (isArabic()) {
      // Arabic counts minutes, hours and days in its own forms: the browser knows them.
      const ago = new Intl.RelativeTimeFormat(locale(), { numeric: 'always', style: 'long' });
      if (minutes < 60) return ago.format(-minutes, 'minute');
      if (minutes < DAY_MINUTES) return ago.format(-Math.floor(minutes / 60), 'hour');
      return ago.format(-Math.floor(minutes / DAY_MINUTES), 'day');
    }
    if (minutes < 60) return `${minutes} min ago`;
    if (minutes < DAY_MINUTES) return `${Math.floor(minutes / 60)} h ago`;
    return `${Math.floor(minutes / DAY_MINUTES)} d ago`;
  }

  /** The next day of the user's working week, by name; null when that is tomorrow. */
  private nextWorkDay(): string | null {
    const workDays = this.calendarData.settings()?.workDays as string[] | undefined;
    const today = this.today();
    for (let ahead = 1; ahead <= 7; ahead++) {
      const day = addDays(today, ahead);
      if (!workDays?.length || workDays.includes(WEEKDAY_NAMES[weekdayOf(day)])) {
        return ahead === 1 ? null
          : new Intl.DateTimeFormat(locale(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(day.year, day.month - 1, day.day)));
      }
    }
    return null;
  }

  private minutesOf(value: string | undefined, fallback: number): number {
    const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
    return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
  }

  /** Minutes from the start of the planned day; outside 0..1440 for another day. */
  private minuteOf(date: Date): number {
    return Math.round((date.getTime() - this.dayStart().getTime()) / MINUTE);
  }

  private y(minute: number): number {
    return ((minute - this.axis().from) / 60) * HOUR_PX;
  }

  private blockHeight(minutes: number): number {
    return Math.max(20, (minutes / 60) * HOUR_PX - 3);
  }

  private time(date: Date): string {
    return formatTimeInZone(date, this.zone(), this.hour24());
  }

  /** A minute of the planned day as a clock time. */
  private clock(minute: number): string {
    return this.time(new Date(this.dayStart().getTime() + minute * MINUTE));
  }

  /** "09:00" on the 24-hour clock, "9 AM" otherwise. */
  private hourLabel(minute: number): string {
    if (this.hour24()) return num(`${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:00`);
    const hour = Math.floor(minute / 60) % 24;
    return hour < 12 ? t('{hour} AM', { hour: hour % 12 || 12 }) : t('{hour} PM', { hour: hour % 12 || 12 });
  }
}
