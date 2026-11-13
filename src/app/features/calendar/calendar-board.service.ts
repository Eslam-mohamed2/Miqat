import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from '../../core/services/auth.service';
import { CalendarDataService } from '../../core/services/calendar-data.service';
import {
  CalendarSelection, CalendarStateService, PERSONAL_CALENDAR_ID
} from '../../core/services/calendar-state.service';
import { LocalPrefsService } from '../../core/services/local-prefs.service';
import { TaskService } from '../../core/services/task.service';
import { ToastService } from '../../core/services/toast.service';
import { UserService } from '../../core/services/user.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { t, tCount } from '../../core/i18n/i18n';
import { DayOfWeekName, TaskDto } from '../../models/api.models';
import { HijriDate, hijriDate, hijriDayLabel, hijriFullLabel, hijriRangeLabel } from '../../core/utils/hijri';
import { OccasionDay, countryName, hasHolidays, isMuslimMajority, occasionsByDay } from '../../core/utils/occasions';
import { countryOfZone } from '../../core/utils/zone-country';
import {
  PRAYER_METHODS, PrayerMethod, PrayerName, placeForZone, prayerLabel, prayerTimes
} from '../../core/utils/prayer-times';
import { estimateMinutes, formatEstimate } from '../../core/utils/task-estimate';
import {
  allDaySpan, dayKeyInZone, dayKeyOfCell, formatShortTimeInZone, formatTimeInZone, isValidTimeZone, timeZoneLabel,
  zonedParts, zonedTimeToUtc
} from '../../core/utils/time-zone';
import { CalendarChip, CalendarEntry, chipsByDay } from './calendar-chips';
import { dateWords, dayAndMonth, firstFreeStart, longDate, shortDate, weekdayName, zoneCity } from './calendar-layout';

/** The names the API uses for the days of the week (values, never shown). */
const DAY_NAMES: DayOfWeekName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MINUTE = 60_000;

/** The length of a time block for a task that has no estimate. */
export const DEFAULT_BLOCK_MINUTES = 30;

/** One day as every view of the calendar draws it. */
export interface BoardDay {
  /** A plain local date that stands for the day on the wall calendar. */
  date: Date;
  key: string;
  /** "Sun" */
  dow: string;
  number: number;
  /** "Thursday, 12 November 2026", for labels. */
  label: string;
  /** "2 Jumada II" */
  hijri: string;
  isToday: boolean;
  isSelected: boolean;
  isWorkDay: boolean;
  inMonth: boolean;
  chips: CalendarChip[];
  /** What counts toward how full the day is: everything but declined invitations. */
  count: number;
  /** Public holidays and special occasions; they are not the user's items and count toward nothing. */
  occasions: OccasionDay[];
  /** A public holiday falls on it. */
  isHoliday: boolean;
}

/** A prayer time as it is drawn on one day. */
export interface DayPrayer {
  name: PrayerName;
  at: Date;
  /** Minutes from midnight in the calendar's zone. */
  minute: number;
  /** "Dhuhr 11:39" */
  label: string;
}

/** A task waiting for a time block ("To plan"). */
export interface PlanTask {
  task: TaskDto;
  project: string;
  color: string;
  /** "45m", or '' when the task has no estimate. */
  estimate: string;
  /** "9d late", "Fri", "24 Nov" or ''. */
  due: string;
  late: boolean;
}

const isOpen = (task: TaskDto) => task.status !== 'Completed' && task.status !== 'Cancelled';

/**
 * What the calendar's parts (header, side column, the views, the detail panel) show,
 * worked out once from the shared state and data: one time zone, the visible items,
 * the layers, the tasks that wait for a time block. It also gives a task its block.
 */
@Injectable({ providedIn: 'root' })
export class CalendarBoard {
  private state = inject(CalendarStateService);
  private data = inject(CalendarDataService);
  private users = inject(UserService);
  private prefs = inject(LocalPrefsService);
  private taskApi = inject(TaskService);
  private toasts = inject(ToastService);
  private readonly myId = inject(AuthService).getCurrentUserId();

  /** Moved on by the page twice a minute: the now line and every "starts in". */
  readonly now = signal(new Date());

  /** True while the detail panel has room beside the grid (set by the page). */
  readonly panelVisible = signal(false);

  /** The task being dragged from "To plan", so a drop target knows what it gets. */
  readonly dragging = signal<TaskDto | null>(null);

  // ── Time ───────────────────────────────────────────────────────────────────

  /**
   * The one zone the whole calendar uses: the one picked in the hour column,
   * otherwise the profile's. Events are created in it too, so "09:00" in the
   * editor is the same 09:00 the grid shows.
   */
  readonly zone = computed(() => this.state.displayZone() ?? this.users.timeZone());
  readonly zoneLabel = computed(() => timeZoneLabel(this.zone()));
  readonly hour24 = this.data.use24HourClock;

  readonly todayKey = computed(() => dayKeyInZone(this.now(), this.zone()));
  readonly nowMinute = computed(() => {
    const parts = zonedParts(this.now(), this.zone());
    return parts.hour * 60 + parts.minute;
  });

  /** Days the user works, 0 (Sunday) to 6. Every day counts until the settings are known. */
  readonly workDays = computed<ReadonlySet<number>>(() => {
    const names = this.data.settings()?.workDays;
    if (!names) return new Set([0, 1, 2, 3, 4, 5, 6]);
    return new Set(names.map(name => DAY_NAMES.indexOf(name)).filter(index => index >= 0));
  });

  /** The working day, in minutes from midnight. */
  readonly workStart = computed(() => this.clockMinutes(this.data.settings()?.workDayStart, 9 * 60));
  readonly workEnd = computed(() => this.clockMinutes(this.data.settings()?.workDayEnd, 17 * 60));

  private clockMinutes(value: string | undefined, fallback: number): number {
    const match = /^(\d{2}):(\d{2})/.exec(value ?? '');
    return match ? +match[1] * 60 + +match[2] : fallback;
  }

  /** The moment a day's clock shows the given minute, in the calendar's zone. */
  instantOn(cell: Date, minute: number): Date {
    return zonedTimeToUtc(
      cell.getFullYear(), cell.getMonth() + 1, cell.getDate(), Math.floor(minute / 60), minute % 60, this.zone());
  }

  time(date: Date): string {
    return formatTimeInZone(date, this.zone(), this.hour24());
  }

  shortTime(date: Date): string {
    return formatShortTimeInZone(date, this.zone(), this.hour24());
  }

  /** "Thu 12 Nov" */
  shortDay(date: Date): string {
    return shortDate(date, this.zone());
  }

  /** "Fri 20 Nov" for the first day of an all-day event, whatever zone it was made in. */
  shortAllDay(start: Date, end: Date): string {
    const span = allDaySpan(start, end, this.zone());
    return this.shortDay(this.instantOn(new Date(span.year, span.month - 1, span.day), 12 * 60));
  }

  // ── Layers ─────────────────────────────────────────────────────────────────

  /** Where prayer times are worked out for: the main city of the profile's time zone. */
  readonly place = computed(() => placeForZone(this.users.timeZone()));
  readonly prayerMethod = computed<PrayerMethod>(() => this.prefs.prayerMethod() ?? this.place()?.method ?? 'MWL');
  readonly prayerOn = computed(() => this.prefs.prayerTimes() && !!this.place());
  readonly prayerHint = computed(() => {
    const place = this.place();
    return place
      ? `${place.city} · ${PRAYER_METHODS[this.prayerMethod()].label}`
      : t('No city is known for {city}', { city: zoneCity(this.users.timeZone()) });
  });

  readonly hijriOn = this.prefs.hijriDates;

  readonly occasionsOn = this.prefs.occasions;

  /** The country whose holidays show: the one picked in Settings, otherwise the profile time zone's. */
  readonly occasionsCountry = computed(() => this.prefs.occasionsCountry() ?? countryOfZone(this.users.timeZone()));

  /** "Egypt · from your time zone", or why only some occasions show. */
  readonly occasionsHint = computed(() => {
    const code = this.occasionsCountry();
    const islamic = this.prefs.hijriDates() || isMuslimMajority(code);
    if (!code) {
      const city = zoneCity(this.users.timeZone());
      return islamic
        ? t('Islamic occasions · no country is known for {city}', { city })
        : t('No country is known for {city}', { city });
    }
    if (!hasHolidays(code)) {
      const name = countryName(code);
      return islamic
        ? t('Islamic occasions · no holidays are built in for {country}', { country: name })
        : t('No holidays are built in for {country}', { country: name });
    }
    return this.prefs.occasionsCountry()
      ? countryName(code)
      : t('{country} · from your time zone', { country: countryName(code) });
  });

  /** Emptied whenever the country, the Hijri calendar or the Hijri layer changes. */
  private readonly occasionCache = computed(() => ({
    query: {
      country: this.occasionsCountry(), hijriCalendar: this.prefs.hijriCalendar(), hijriLayer: this.prefs.hijriDates()
    },
    days: new Map<string, OccasionDay[]>()
  }));

  /** The public holidays and occasions of a day (`yyyy-mm-dd`); none while the layer is off. */
  occasionsOf(key: string): OccasionDay[] {
    if (!this.occasionsOn()) return [];
    const cache = this.occasionCache();
    let found = cache.days.get(key);
    if (!found) {
      found = occasionsByDay(key, key, cache.query).get(key) ?? [];
      cache.days.set(key, found);
    }
    return found;
  }

  /** The zone of the second hour column, or null when it is off or the same as the first. */
  readonly secondZone = computed(() => {
    const zone = this.prefs.secondZoneId();
    return this.prefs.secondZone() && isValidTimeZone(zone) && zone !== this.zone() ? zone : null;
  });

  /** Emptied whenever the place, the method or the zone changes. */
  private readonly prayerCache = computed(() => {
    this.place();
    this.prayerMethod();
    this.zone();
    this.hour24();
    return new Map<string, DayPrayer[]>();
  });

  /** The five prayers of a day, with their place on that day's time grid. */
  prayersOn(cell: Date): DayPrayer[] {
    const place = this.place();
    if (!place) return [];

    const cache = this.prayerCache();
    const key = dayKeyOfCell(cell);
    let found = cache.get(key);
    if (!found) {
      const zone = this.zone();
      found = prayerTimes(cell.getFullYear(), cell.getMonth() + 1, cell.getDate(), place, this.prayerMethod())
        .filter(prayer => prayer.name !== 'Sunrise' && dayKeyInZone(prayer.at, zone) === key)
        .map(prayer => {
          const parts = zonedParts(prayer.at, zone);
          return {
            name: prayer.name,
            at: prayer.at,
            minute: parts.hour * 60 + parts.minute,
            label: `${prayerLabel(prayer.name)} ${this.shortTime(prayer.at)}`
          };
        });
      cache.set(key, found);
    }
    return found;
  }

  /** Noon of a day in the calendar's zone: a safe instant to ask "which date is this" in any calendar. */
  private noon(cell: Date): Date {
    return this.instantOn(cell, 12 * 60);
  }

  /** Day, month name and year of a day in the Hijri calendar the user chose. */
  hijri(cell: Date): HijriDate {
    return hijriDate(this.noon(cell), this.zone(), this.prefs.hijriCalendar());
  }

  hijriDay(cell: Date): string {
    return hijriDayLabel(this.noon(cell), this.zone(), this.prefs.hijriCalendar());
  }

  hijriFull(cell: Date): string {
    return hijriFullLabel(this.noon(cell), this.zone(), this.prefs.hijriCalendar());
  }

  hijriRange(from: Date, to: Date): string {
    return hijriRangeLabel(this.noon(from), this.noon(to), this.zone(), this.prefs.hijriCalendar());
  }

  // ── What is on the calendar ────────────────────────────────────────────────

  private readonly hiddenCalendars = computed(() =>
    new Set(this.data.calendars().filter(calendar => !calendar.isVisible).map(calendar => calendar.id)));

  private isProjectShown(groupId: string | null | undefined): boolean {
    return !this.state.hiddenCalendarIds().has(groupId || PERSONAL_CALENDAR_ID);
  }

  /**
   * The feed without what the side column has switched off (events by calendar,
   * tasks by project; events in someone else's calendar always show), plus the
   * time blocks of tasks. A task with a block is drawn as that block, so its due
   * time is not drawn a second time.
   */
  readonly entries = computed<CalendarEntry[]>(() => {
    const hiddenCalendars = this.hiddenCalendars();
    const tasks = this.data.tasks();
    const blocked = new Map(tasks.filter(task => task.startDate).map(task => [task.id, task]));
    const entries: CalendarEntry[] = [];

    for (const item of this.data.items()) {
      if (item.kind === 'Event') {
        if (!hiddenCalendars.has(item.calendarId ?? '')) entries.push(item);
        continue;
      }
      if (!this.isProjectShown(item.groupId)) continue;

      const block = blocked.get(item.id);
      if (block?.dueDate && new Date(block.dueDate).getTime() === new Date(item.end).getTime()) continue;
      // The feed starts a task at its start date; on the calendar it is its due time.
      entries.push({ ...item, start: item.end });
    }

    for (const task of blocked.values()) {
      if (task.status === 'Cancelled' || !this.isProjectShown(task.groupId)) continue;
      const start = new Date(task.startDate!);
      if (Number.isNaN(start.getTime())) continue;
      const minutes = estimateMinutes(task) ?? DEFAULT_BLOCK_MINUTES;

      entries.push({
        kind: 'Task', id: task.id, title: task.title,
        start: start.toISOString(), end: new Date(start.getTime() + minutes * MINUTE).toISOString(),
        isAllDay: false, isRecurring: false,
        color: task.groupColor || null, groupId: task.groupId || null, groupName: task.groupName || null,
        isOwner: false, attendeeCount: 0,
        status: task.status, priority: task.priority, isOverdue: task.isOverdue ?? false,
        planned: true
      });
    }
    return entries;
  });

  /** Every day's items, keyed by `yyyy-mm-dd` in the calendar's zone. */
  readonly chips = computed(() => chipsByDay(this.entries(), {
    zone: this.zone(), hour24: this.hour24(), groups: this.data.groups()
  }));

  /** One day with what falls on it. */
  day(cell: Date, month = this.state.currentMonth()): BoardDay {
    const key = dayKeyOfCell(cell);
    const chips = this.chips().get(key) ?? [];
    const occasions = this.occasionsOf(key);
    return {
      date: cell,
      key,
      occasions,
      isHoliday: occasions.some(day => day.occasion.kind === 'holiday'),
      dow: weekdayName(cell.getDay()),
      number: cell.getDate(),
      label: longDate(cell, undefined, true),
      hijri: this.hijriOn() ? this.hijriDay(cell) : '',
      isToday: key === this.todayKey(),
      isSelected: key === dayKeyOfCell(this.state.selectedDate()),
      isWorkDay: this.workDays().has(cell.getDay()),
      inMonth: cell.getMonth() === month.getMonth(),
      chips,
      count: chips.filter(chip => !chip.declined).length
    };
  }

  /** The first day of the week the focused day is in. */
  readonly weekStart = computed(() => {
    const selected = this.state.selectedDate();
    const back = (selected.getDay() - this.data.weekStart() + 7) % 7;
    return new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() - back);
  });

  /** The seven days of the focused week. */
  readonly week = computed<BoardDay[]>(() => {
    const start = this.weekStart();
    return Array.from({ length: 7 }, (_, index) =>
      this.day(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)));
  });

  /** The focused day on its own. */
  readonly focusedDay = computed(() => this.day(this.state.selectedDate()));

  /** The first cell of the month grid: the start of the week that holds the 1st. */
  readonly monthStart = computed(() => {
    const month = this.state.currentMonth();
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const back = (first.getDay() - this.data.weekStart() + 7) % 7;
    return new Date(first.getFullYear(), first.getMonth(), 1 - back);
  });

  /** The weeks the month on screen touches (four to six rows). */
  readonly monthWeeks = computed<BoardDay[][]>(() => {
    const month = this.state.currentMonth();
    const start = this.monthStart();
    const weeks: BoardDay[][] = [];
    for (let week = 0; week < 6; week++) {
      const first = new Date(start.getFullYear(), start.getMonth(), start.getDate() + week * 7);
      // A row that begins after the month's last day belongs to the next month.
      if (week > 0 && (first.getMonth() !== month.getMonth() || first.getFullYear() !== month.getFullYear())) break;
      weeks.push(Array.from({ length: 7 }, (_, index) =>
        this.day(new Date(first.getFullYear(), first.getMonth(), first.getDate() + index), month)));
    }
    return weeks;
  });

  // ── Selection ──────────────────────────────────────────────────────────────

  /** The event going on now or coming next (declined ones aside), from what is loaded. */
  readonly nextUp = computed<CalendarEntry | null>(() => {
    const now = this.now().getTime();
    return this.entries()
      .filter(entry => entry.kind === 'Event' && !entry.isAllDay && entry.myResponse !== 'Declined'
        && new Date(entry.end).getTime() > now)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0] ?? null;
  });

  /**
   * What the detail panel shows: what was picked, otherwise, while the panel is on
   * screen, what is next in the week or day on show.
   */
  readonly shown = computed<CalendarSelection | null>(() => {
    const picked = this.state.selection();
    if (picked || !this.panelVisible() || this.state.view() === 'month') return picked;

    const next = this.nextUp();
    if (!next) return null;
    if (this.state.view() !== 'agenda') {
      const key = dayKeyInZone(new Date(next.start), this.zone());
      const days = this.state.view() === 'day' ? [this.focusedDay()] : this.week();
      if (!days.some(day => day.key === key)) return null;
    }
    return { kind: 'Event', id: next.id, item: next };
  });

  /** True for the block whose details are on show. */
  isShown(chip: CalendarChip): boolean {
    const shown = this.shown();
    if (!shown || shown.kind !== chip.kind || shown.id !== chip.id) return false;
    // One date of a repeating event, not the whole series.
    const date = shown.item?.occurrenceStart;
    return !date || !chip.item.occurrenceStart || date === chip.item.occurrenceStart;
  }

  pick(chip: CalendarChip) {
    this.state.select({ kind: chip.kind, id: chip.id, item: chip.item });
  }

  // ── Tasks that wait for a time block ───────────────────────────────────────

  /** The user's own open tasks with no time block: late ones first, then by due date. */
  readonly toPlan = computed<PlanTask[]>(() => {
    const now = this.now().getTime();
    const dueTime = (task: TaskDto) => task.dueDate ? new Date(task.dueDate).getTime() : Number.POSITIVE_INFINITY;

    return this.data.tasks()
      .filter(task => isOpen(task) && !task.startDate && this.isProjectShown(task.groupId)
        // A task handed to someone else is theirs to plan.
        && (!task.assignedToUserId || !this.myId || task.assignedToUserId === this.myId))
      .sort((a, b) => dueTime(a) - dueTime(b) || a.title.localeCompare(b.title))
      .map(task => {
        const due = task.dueDate ? new Date(task.dueDate) : null;
        const late = !!due && due.getTime() < now;
        return {
          task,
          project: task.groupName || t('Personal'),
          color: task.groupColor || 'var(--mq-accent-text)',
          estimate: formatEstimate(estimateMinutes(task)),
          due: due ? (late ? this.lateLabel(now - due.getTime()) : this.dueLabel(due, now)) : '',
          late
        };
      });
  });

  /** "5 tasks · 5h 45m": the estimates that are known, added up. */
  readonly toPlanSummary = computed(() => {
    const list = this.toPlan();
    const minutes = list.reduce((sum, row) => sum + (estimateMinutes(row.task) ?? 0), 0);
    const count = tCount(list.length, '{n} task', '{n} tasks');
    return minutes ? `${count} · ${formatEstimate(minutes)}` : count;
  });

  private lateLabel(milliseconds: number): string {
    const days = Math.floor(milliseconds / 86_400_000);
    if (days >= 1) return tCount(days, '{n}d late', '{n}d late');
    const hours = Math.floor(milliseconds / 3_600_000);
    return hours >= 1 ? tCount(hours, '{n}h late', '{n}h late') : t('late');
  }

  private dueLabel(due: Date, now: number): string {
    const zone = this.zone();
    if (dayKeyInZone(due, zone) === this.todayKey()) return t('Today');
    const withinWeek = due.getTime() - now < 7 * 86_400_000;
    return withinWeek
      ? dateWords(due, { weekday: 'short', timeZone: zone })['weekday']
      : dayAndMonth(due, 'short', zone);
  }

  /** The task behind a block or a due time, when the task list has it. */
  taskOf(id: string): TaskDto | null {
    return this.data.tasks().find(task => task.id === id) ?? null;
  }

  // ── Giving a task its block ────────────────────────────────────────────────

  /**
   * Blocks time for a task from `start`, for as long as its estimate says. The
   * API refuses a block that starts after the due date, so a task planned past
   * its deadline gets the end of the block as its new due date.
   */
  planTask(task: TaskDto, start: Date) {
    const minutes = estimateMinutes(task) ?? DEFAULT_BLOCK_MINUTES;
    const due = task.dueDate ? new Date(task.dueDate) : null;
    const dueMoves = !!due && due.getTime() < start.getTime();
    const dueDate = dueMoves ? new Date(start.getTime() + minutes * MINUTE).toISOString() : task.dueDate;

    const when = t('{day}, {time}', { day: this.shortDay(start), time: this.time(start) });
    this.saveBlock(task, { startDate: start.toISOString(), dueDate }, dueMoves
      ? t('Planned for {when}. The due date moved with it.', { when })
      : t('Planned for {when}.', { when }));
  }

  /**
   * Blocks time on a day without naming an hour: the first free stretch inside
   * working hours (from now on, when the day is today), otherwise the start of
   * the working day.
   */
  planTaskOnDay(task: TaskDto, cell: Date) {
    const minutes = estimateMinutes(task) ?? DEFAULT_BLOCK_MINUTES;
    const key = dayKeyOfCell(cell);
    const busy = (this.chips().get(key) ?? [])
      .filter(chip => !chip.allDay && !chip.declined && chip.id !== task.id && chip.endMin > chip.startMin);
    const from = key === this.todayKey() ? Math.max(this.workStart(), this.nowMinute()) : this.workStart();

    const start = firstFreeStart(busy, minutes, from, this.workEnd())
      ?? firstFreeStart(busy, minutes, from, 24 * 60)
      ?? this.workStart();
    this.planTask(task, this.instantOn(cell, start));
  }

  /** Takes the block away again; the task goes back to "To plan". */
  unplanTask(task: TaskDto) {
    this.saveBlock(task, { startDate: null, dueDate: task.dueDate }, t('Time block removed.'));
  }

  private saveBlock(task: TaskDto, changes: Pick<TaskDto, 'startDate' | 'dueDate'>, message: string, canUndo = true) {
    const before: Pick<TaskDto, 'startDate' | 'dueDate'> = { startDate: task.startDate ?? null, dueDate: task.dueDate };
    const changed = { ...task, ...changes };

    this.data.patchTask(task.id, changes);
    this.taskApi.updateTask(task.id, changed).subscribe({
      next: () => {
        this.data.reloadTasks();
        this.data.reloadItems();
        this.toasts.show(message, canUndo
          ? { undo: () => this.saveBlock(changed, before, t('Put back as it was.'), false) }
          : {});
      },
      error: err => {
        this.data.patchTask(task.id, before);
        this.toasts.show(apiErrorMessage(err, t('The task was not changed.')), { tone: 'var(--mq-late)' });
      }
    });
  }
}
