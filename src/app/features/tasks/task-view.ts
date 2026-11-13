import { isArabic, locale, t, tCount } from '../../core/i18n/i18n';
import { TaskDto } from '../../models/api.models';
import { estimateMinutes } from '../../core/utils/task-estimate';
import { formatShortTimeInZone, formatTimeInZone, zonedParts } from '../../core/utils/time-zone';

/**
 * How a task reads on the Tasks screens: the names of its status and priority,
 * which list it belongs to today, and the short labels of its dates.
 *
 * Pure functions, shared by the list, the board, the detail panel and the
 * project page so that none of them can say something different about one task.
 */

export interface StatusOption {
  /** Exactly what the API stores (the TaskStatus enum), never the label. */
  value: string;
  /** What is shown, in the interface language. */
  label: string;
}

/** Every status, in the order the status menu lists them. */
export const STATUSES: StatusOption[] = [
  { value: 'Pending', label: t('To do') },
  { value: 'In_progress', label: t('In progress') },
  { value: 'On_hold', label: t('On hold') },
  { value: 'Completed', label: t('Done@@status') },
  { value: 'Cancelled', label: t('Cancelled') }
];

/** The board's columns. Cancelled tasks are not on the board. */
export const BOARD_STATUSES: StatusOption[] = STATUSES.filter(status => status.value !== 'Cancelled');

/** Where the arrow on a board card sends it. */
export const NEXT_STATUS: Record<string, string> = {
  Pending: 'In_progress',
  In_progress: 'Completed',
  On_hold: 'In_progress'
};

/** The values the API stores. What is shown comes from `priorityLabel()`. */
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;

const PRIORITY_LABELS: Record<string, string> = {
  Low: t('Low'),
  Medium: t('Medium'),
  High: t('High'),
  Critical: t('Critical')
};

/** A priority's name in the interface language ("High"). A task without one is Medium. */
export function priorityLabel(value: string | null | undefined): string {
  return PRIORITY_LABELS[value || 'Medium'] ?? (value as string);
}

/** "High priority", as the pills and the screen-reader labels say it. */
export function priorityPhrase(value: string | null | undefined): string {
  return t('{priority} priority', { priority: priorityLabel(value) });
}

/** Blocks without an estimate take this long on the calendar. */
export const DEFAULT_BLOCK_MINUTES = 30;

const DAY_MS = 86_400_000;

export function statusLabel(value: string | null | undefined): string {
  return STATUSES.find(status => status.value === value)?.label ?? (value || t('To do'));
}

export function isDone(task: TaskDto): boolean {
  return task.status === 'Completed';
}

/** Finished one way or the other: done or cancelled. */
export function isClosed(task: TaskDto): boolean {
  return task.status === 'Completed' || task.status === 'Cancelled';
}

/** Work that can be picked up now: not closed and not on hold. */
export function isOpen(task: TaskDto): boolean {
  return !isClosed(task) && task.status !== 'On_hold';
}

/** How many priority bars a card shows (1 to 3). */
export function priorityLevel(priority: string | null | undefined): number {
  if (priority === 'High' || priority === 'Critical') return 3;
  return priority === 'Medium' ? 2 : 1;
}

/** The priority after this one, wrapping from Critical back to Low. */
export function nextPriority(priority: string | null | undefined): string {
  const index = PRIORITIES.indexOf((priority ?? 'Low') as typeof PRIORITIES[number]);
  return PRIORITIES[(index + 1) % PRIORITIES.length];
}

export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
}

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The day an instant falls on in a zone, as a whole number of days (so days can be subtracted). */
export function dayNumber(date: Date, zone: string): number {
  const parts = zonedParts(date, zone);
  return Math.round(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
}

/** What the lists need to know about a task's dates, worked out once. */
export interface TaskDates {
  due: Date | null;
  start: Date | null;
  /** Days from today to the due day; negative when it has passed. null without a due date. */
  dueIn: number | null;
  /** Days from today to the day of its time block. null without one. */
  startIn: number | null;
  /** Open, and its due day is before today. */
  overdue: boolean;
  /** Open, and due or planned today, or overdue. */
  today: boolean;
  /** Open, and dated later than today. */
  upcoming: boolean;
  /** Open with no date at all. */
  anytime: boolean;
}

export function taskDates(task: TaskDto, zone: string, now: Date): TaskDates {
  const due = parse(task.dueDate);
  const start = parse(task.startDate);
  const todayNumber = dayNumber(now, zone);
  const dueIn = due ? dayNumber(due, zone) - todayNumber : null;
  const startIn = start ? dayNumber(start, zone) - todayNumber : null;
  const open = isOpen(task);

  const overdue = open && dueIn !== null && dueIn < 0;
  // A block that has passed with no deadline behind it still needs a decision today.
  const staleBlock = startIn !== null && startIn < 0 && dueIn === null;
  const today = open && (overdue || dueIn === 0 || startIn === 0 || staleBlock);
  const upcoming = open && !today && ((dueIn !== null && dueIn > 0) || (startIn !== null && startIn > 0));

  return { due, start, dueIn, startIn, overdue, today, upcoming, anytime: open && !due && !start };
}

/** True when the task is open and its deadline (day or time) has passed. */
export function isLate(task: TaskDto, now: Date): boolean {
  if (isClosed(task)) return false;
  const due = parse(task.dueDate);
  return !!due && due.getTime() < now.getTime();
}

/** Midnight and the last minute of a day are how "no particular time" is stored. */
function hasClockTime(date: Date, zone: string): boolean {
  const parts = zonedParts(date, zone);
  const minutes = parts.hour * 60 + parts.minute;
  return minutes !== 0 && minutes !== 23 * 60 + 59;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * A date in the interface language. Arabic is written the way `Intl` writes it
 * ("الجمعة، ١٣ نوفمبر"); English keeps the day before the month with no commas
 * ("Fri 13 Nov 2026"), as the design does, whichever order the locale prefers.
 */
function writeDate(date: Date, zone: string, options: Intl.DateTimeFormatOptions): string {
  const key = locale() + '|' + zone + '|' + JSON.stringify(options);
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale(), { ...options, timeZone: zone });
    dateFormatters.set(key, formatter);
  }
  if (isArabic()) return formatter.format(date);

  const parts = new Map(formatter.formatToParts(date).map(part => [part.type as string, part.value]));
  return ['weekday', 'day', 'month', 'year'].map(type => parts.get(type)).filter(Boolean).join(' ');
}

function weekday(date: Date, zone: string): string {
  return writeDate(date, zone, { weekday: 'short' });
}

/** The year is written only when it is not this one. */
function yearIfOther(date: Date, zone: string, now: Date): 'numeric' | undefined {
  return zonedParts(date, zone).year === zonedParts(now, zone).year ? undefined : 'numeric';
}

function dayAndMonth(date: Date, zone: string, now: Date): string {
  return writeDate(date, zone, { day: 'numeric', month: 'short', year: yearIfOther(date, zone, now) });
}

/**
 * "Fri 13 Nov": a date with its weekday, for a board card and the detail panel.
 * Given `now`, a date in another year says which ("Fri 12 Nov 2027").
 */
export function weekdayDate(date: Date, zone: string, now?: Date): string {
  const year = now ? yearIfOther(date, zone, now) : undefined;
  return writeDate(date, zone, { weekday: 'short', day: 'numeric', month: 'short', year });
}

/** "Thursday, 12 November": the date line above a page title. */
export function longDate(date: Date, zone: string): string {
  if (isArabic()) return writeDate(date, zone, { weekday: 'long', day: 'numeric', month: 'long' });
  return writeDate(date, zone, { weekday: 'long' }) + ', ' + writeDate(date, zone, { day: 'numeric', month: 'long' });
}

/** A day relative to today: "Today", "Tomorrow", "Sun", "24 Nov". */
export function dayLabel(date: Date, zone: string, now: Date): string {
  const days = dayNumber(date, zone) - dayNumber(now, zone);
  if (days === 0) return t('Today');
  if (days === 1) return t('Tomorrow');
  if (days === -1) return t('Yesterday');
  if (days > 1 && days < 7) return weekday(date, zone);
  return dayAndMonth(date, zone, now);
}

/** A day with a clock time that is already written: "Today 17:00", "Sun 09:00". */
function dayWithTime(date: Date, zone: string, now: Date, time: string): string {
  const days = dayNumber(date, zone) - dayNumber(now, zone);
  if (days === 0) return t('Today {time}', { time });
  if (days === 1) return t('Tomorrow {time}', { time });
  if (days === -1) return t('Yesterday {time}', { time });
  return t('{day} {time}', { day: dayLabel(date, zone, now), time });
}

/** A moment relative to today, for sentences: "Today 17:00", "Tomorrow 09:30", "Sun 10:00". */
export function dayTimeLabel(date: Date, zone: string, now: Date, hour24: boolean): string {
  return dayWithTime(date, zone, now, formatTimeInZone(date, zone, hour24));
}

/**
 * The last column of a row: "2d late", "Today 17:00", "Sun", "Done 09:10".
 * Empty when the task has no deadline.
 */
export function dueLabel(task: TaskDto, zone: string, now: Date, hour24: boolean): string {
  if (task.status === 'Cancelled') return t('Cancelled');

  if (isDone(task)) {
    const completed = parse(task.completedAt);
    if (!completed) return t('Done@@status');
    const days = dayNumber(completed, zone) - dayNumber(now, zone);
    const when = days === 0
      ? formatShortTimeInZone(completed, zone, hour24)
      : days > -7 ? weekday(completed, zone) : dayAndMonth(completed, zone, now);
    return t('Done {when}', { when });
  }

  const due = parse(task.dueDate);
  if (!due) return '';
  const days = dayNumber(due, zone) - dayNumber(now, zone);
  if (days < 0) return tCount(-days, '{n}d late', '{n}d late');
  if (days === 0) {
    return hasClockTime(due, zone) ? t('Today {time}', { time: formatShortTimeInZone(due, zone, hour24) }) : t('Today');
  }
  return dayLabel(due, zone, now);
}

/** The deadline in full, for the detail panel: "Today 17:00", "Sun 15 Nov, 09:00". */
export function dueLong(task: TaskDto, zone: string, now: Date, hour24: boolean): string {
  const due = parse(task.dueDate);
  if (!due) return '';
  const days = dayNumber(due, zone) - dayNumber(now, zone);
  const time = hasClockTime(due, zone) ? formatTimeInZone(due, zone, hour24) : '';
  if (days === 0 || days === 1 || days === -1) return time ? dayWithTime(due, zone, now, time) : dayLabel(due, zone, now);

  const day = weekdayDate(due, zone, now);
  return time ? t('{day}, {time}', { day, time }) : day;
}

/** How long the task's block is on the calendar. */
export function blockMinutes(task: TaskDto): number {
  return estimateMinutes(task) ?? DEFAULT_BLOCK_MINUTES;
}

/** The dashed pill of a scheduled task: "17:30" today, "Fri 10:00" on another day. Empty without a block. */
export function blockLabel(task: TaskDto, zone: string, now: Date, hour24: boolean, withDay = false): string {
  const start = parse(task.startDate);
  if (!start) return '';
  const time = formatTimeInZone(start, zone, hour24);
  const days = dayNumber(start, zone) - dayNumber(now, zone);
  if (days === 0 && !withDay) return time;
  if (Math.abs(days) < 7) return t('{day} {time}', { day: weekday(start, zone), time });
  return dayAndMonth(start, zone, now);
}

/** The block from start to end: "Thu 10:00 – 11:15". Only the start when the task has no estimate. */
export function blockRange(task: TaskDto, zone: string, hour24: boolean): string {
  const start = parse(task.startDate);
  if (!start) return '';
  const day = weekday(start, zone);
  const from = formatTimeInZone(start, zone, hour24);
  const minutes = estimateMinutes(task);
  if (!minutes) return t('{day} {time}', { day, time: from });
  const to = formatTimeInZone(new Date(start.getTime() + minutes * 60_000), zone, hour24);
  return t('{day} {from} – {to}', { day, from, to });
}

/** Missing dates sort last rather than to 1970. */
export function timeValue(value: string | null | undefined): number {
  return parse(value)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}
