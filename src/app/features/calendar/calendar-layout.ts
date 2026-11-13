import { TimeSlotDto } from '../../models/api.models';
import { isRtl, locale, num, t } from '../../core/i18n/i18n';
import { PrayerTime } from '../../core/utils/prayer-times';
import { formatDuration } from '../../core/utils/task-estimate';
import { zonedParts } from '../../core/utils/time-zone';
import { CalendarChip } from './calendar-chips';

/** Height of one hour on the week and day grids (design/miqat-2.0: Main, V2-MobileDay). */
export const HOUR_PX = 56;
export const PHONE_HOUR_PX = 60;

const DAY_MINUTES = 24 * 60;

/** How a day's blocks are sized; the defaults are the week grid's. */
export interface PlaceOptions {
  hourPx: number;
  /** The shortest block, so a 15-minute meeting can still be read and pressed. */
  minHeight: number;
  /** Space above a block and what is taken off its height, so neighbours do not touch. */
  topOffset: number;
  trim: number;
  /** Space between a block and the edges of its column. */
  inset: number;
}

const WEEK_GRID: PlaceOptions = { hourPx: HOUR_PX, minHeight: 24, topOffset: 1, trim: 3, inset: 3 };
export const PHONE_DAY: PlaceOptions = { hourPx: PHONE_HOUR_PX, minHeight: 26, topOffset: 2, trim: 4, inset: 0 };

/** One block with its place on a day column. */
export interface PlacedChip {
  chip: CalendarChip;
  top: number;
  height: number;
  left: string;
  width: string;
  /** Laid over a neighbour: drawn with a gap of the page colour around it. */
  stacked: boolean;
}

interface Slot {
  chip: CalendarChip;
  start: number;
  end: number;
  column: number;
}

/**
 * Places the timed items of one day. Items that overlap share the column's width:
 * two or three are laid over each other like cards (each keeps two thirds of the
 * width, as in the design); more than that stand side by side.
 */
export function placeDay(chips: CalendarChip[], options: PlaceOptions = WEEK_GRID): PlacedChip[] {
  const { hourPx, minHeight, topOffset, trim, inset } = options;
  // What the shortest block stands for in minutes: two items closer than that would cover each other.
  const minMinutes = (minHeight + trim) / hourPx * 60;

  const timed = chips
    .filter(chip => !chip.allDay)
    .sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));

  const placed: PlacedChip[] = [];
  let cluster: Slot[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const columns = cluster.reduce((most, slot) => Math.max(most, slot.column + 1), 1);
    for (const slot of cluster) {
      const { chip, column } = slot;
      const box = columnBox(column, columns, inset);
      placed.push({
        chip,
        top: chip.startMin / 60 * hourPx + topOffset,
        height: Math.max(minHeight, (chip.endMin - chip.startMin) / 60 * hourPx - trim),
        left: box.left,
        width: box.width,
        stacked: columns > 1 && columns <= 3 && column > 0
      });
    }
    cluster = [];
  };

  for (const chip of timed) {
    const start = chip.startMin;
    const end = Math.max(chip.endMin, start + minMinutes);
    if (cluster.length && start >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }

    let column = 0;
    while (cluster.some(slot => slot.column === column && slot.end > start)) column++;
    cluster.push({ chip, start, end, column });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length) flush();

  return placed;
}

function columnBox(column: number, columns: number, inset: number): { left: string; width: string } {
  if (columns === 1) return { left: `${inset}px`, width: `calc(100% - ${inset * 2}px)` };

  if (columns <= 3) {
    const step = 34 / (columns - 1);
    return {
      left: column === 0 ? `${inset}px` : `${step * column}%`,
      width: `calc(66% - ${inset}px)`
    };
  }

  const share = 100 / columns;
  return { left: `calc(${share * column}% + ${inset}px)`, width: `calc(${share}% - ${inset * 2}px)` };
}

/** ISO week number of a date (weeks start on Monday; week 1 holds the year's first Thursday). */
export function isoWeek(date: Date): number {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/**
 * The number of the week a row of seven days shows. A row can start on any day
 * (Sunday here, Monday elsewhere), so its middle day decides.
 */
export function weekNumberOfRow(firstDay: Date): number {
  return isoWeek(new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + 3));
}

/** How full a day is, for the mark under a date: 0 for nothing on it, then 1 to 3. */
export function loadLevel(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  return count <= 4 ? 2 : 3;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * The words of a date in the interface language, to be put in the order the
 * calendar writes them: `dateWords(day, { weekday: 'short', day: 'numeric' })`
 * gives `{ weekday: 'Thu', day: '12' }`, in Arabic `{ weekday: 'الخميس', day: '١٢' }`.
 * Without a zone the date is read as a calendar cell (a plain local date).
 */
export function dateWords(date: Date | number, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const key = `${locale()}|${JSON.stringify(options)}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale(), options);
    dateFormatters.set(key, formatter);
  }
  const words: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') words[part.type] = part.value;
  }
  return words;
}

/** "Thursday, 12 November", with the year when asked. */
export function longDate(date: Date, timeZone?: string, withYear = false): string {
  const words = dateWords(date, {
    weekday: 'long', day: 'numeric', month: 'long', year: withYear ? 'numeric' : undefined, timeZone
  });
  return withYear ? t('{weekday}, {day} {month} {year}', words) : t('{weekday}, {day} {month}', words);
}

/** "Thu 12 Nov", with the year when asked. */
export function shortDate(date: Date | number, timeZone?: string, withYear = false): string {
  const words = dateWords(date, {
    weekday: 'short', day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined, timeZone
  });
  return `${words['weekday']} ${words['day']} ${words['month']}${withYear ? ` ${words['year']}` : ''}`;
}

/** "12 November", or "12 Nov". */
export function dayAndMonth(date: Date | number, month: 'long' | 'short' = 'long', timeZone?: string): string {
  const words = dateWords(date, { day: 'numeric', month, timeZone });
  return `${words['day']} ${words['month']}`;
}

/** "November 2026" */
export function monthAndYear(date: Date): string {
  const words = dateWords(date, { month: 'long', year: 'numeric' });
  return `${words['month']} ${words['year']}`;
}

/** "November" */
export function monthName(date: Date): string {
  return dateWords(date, { month: 'long' })['month'];
}

/**
 * The name of a weekday (0 = Sunday): "Thursday", "Thu" or "T". Arabic has no
 * short form, so "short" is the whole name there and "narrow" its letter.
 */
export function weekdayName(day: number, width: 'long' | 'short' | 'narrow' = 'short'): string {
  // 1 November 2026 is a Sunday.
  return dateWords(new Date(2026, 10, 1 + day), { weekday: width })['weekday'];
}

/** An hour on the hour column: "9 AM", or "09:00" on a 24-hour clock. */
export function hourLabel(hour: number, hour24: boolean): string {
  if (hour24) return num(`${String(hour).padStart(2, '0')}:00`);
  return hour < 12 ? t('{h} AM', { h: hour % 12 || 12 }) : t('{h} PM', { h: hour % 12 || 12 });
}

/**
 * What a person typed (a title, a name, a place), ready to stand inside an Arabic
 * sentence: kept apart from the words around it, so its own direction does not
 * move the sentence's punctuation. English needs nothing and gets the text as it is.
 */
export function isolate(text: string | null | undefined): string {
  const value = text ?? '';
  // U+2068 FIRST STRONG ISOLATE … U+2069 POP DIRECTIONAL ISOLATE
  return isRtl() && value ? `\u2068${value}\u2069` : value;
}

/** A list in one line: "Thursday, Eid al-Fitr, 3 items". */
export function listOf(items: string[]): string {
  return items.filter(Boolean).join(t(', '));
}

/** "Africa/Cairo" -> "Cairo". */
export function zoneCity(zone: string): string {
  return zone.split('/').pop()?.replace(/_/g, ' ') || zone;
}

/** A three-letter tag for the hour column: "Africa/Cairo" -> "CAI", "America/New_York" -> "NY". */
export function zoneCode(zone: string): string {
  const words = zoneCity(zone).split(/[\s-]+/).filter(Boolean);
  const code = words.length > 1 ? words.map(word => word[0]).join('') : (words[0] ?? zone);
  return code.slice(0, 3).toUpperCase();
}

/** Minutes a zone's clock is ahead of UTC at an instant. */
export function zoneOffsetMinutes(zone: string, at: Date): number {
  const parts = zonedParts(at, zone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** "2 h behind", "1 h 30 min ahead", or '' when both clocks show the same time. */
export function zoneDifferenceLabel(zone: string, base: string, at: Date): string {
  const minutes = zoneOffsetMinutes(zone, at) - zoneOffsetMinutes(base, at);
  if (!minutes) return '';
  const amount = formatDuration(Math.abs(minutes));
  return minutes < 0 ? t('{amount} behind', { amount }) : t('{amount} ahead', { amount });
}

const MEETING_HOSTS: [RegExp, string][] = [
  [/(^|\.)meet\.google\.com$/, 'Google Meet'],
  [/(^|\.)zoom\.(us|com)$/, 'Zoom'],
  [/(^|\.)teams\.(microsoft|live)\.com$/, 'Microsoft Teams'],
  [/(^|\.)webex\.com$/, 'Webex'],
  [/(^|\.)whereby\.com$/, 'Whereby']
];

/** When an event's place is a web address: what to call it and where "Join" goes. */
export function joinLink(location: string | null | undefined): { label: string; url: string } | null {
  const value = (location ?? '').trim();
  if (!/^https?:\/\/\S+$/i.test(value)) return null;
  try {
    const host = new URL(value).hostname.toLowerCase();
    const known = MEETING_HOSTS.find(([pattern]) => pattern.test(host));
    return { label: known ? known[1] : host.replace(/^www\./, ''), url: value };
  } catch {
    return null;
  }
}

/** "2 h 06 min", "6 min": how long until something starts. */
export function countdownLabel(milliseconds: number): string {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours
    ? t('{h} h {m} min', { h: hours, m: num(String(rest).padStart(2, '0')) })
    : t('{m} min', { m: rest });
}

/**
 * "EM" for "Eslam Mohamed". Arabic letters join when they stand side by side
 * ("م" and "ع" would read as the word "مع"), so a non-joiner keeps them apart.
 */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const second = parts[1]?.[0] ?? '';
  // U+200C ZERO WIDTH NON-JOINER
  const apart = second && /[\u0600-\u06FF]/.test(first + second) ? '\u200C' : '';
  return (first + apart + second).toUpperCase();
}

/**
 * The first start, in minutes from midnight, of a free stretch of `length` minutes
 * between `from` and `to`; null when the day has none.
 */
export function firstFreeStart(
  busy: { startMin: number; endMin: number }[], length: number, from: number, to: number, step = 15
): number | null {
  const last = Math.min(to, DAY_MINUTES) - length;
  for (let start = Math.ceil(from / step) * step; start <= last; start += step) {
    const end = start + length;
    if (!busy.some(block => block.startMin < end && block.endMin > start)) return start;
  }
  return null;
}

/** The first prayer that starts while something is going on, or null. Sunrise is not a prayer. */
export function prayerDuring<T extends PrayerTime>(start: Date, end: Date, prayers: T[]): T | null {
  return prayers.find(prayer =>
    prayer.name !== 'Sunrise' && prayer.at.getTime() >= start.getTime() && prayer.at.getTime() < end.getTime()) ?? null;
}

/** Where to move a start to, in minutes from midnight: the next half hour at least 15 minutes after the prayer. */
export function startAfterPrayer(prayerMinute: number): number {
  return Math.ceil((prayerMinute + 15) / 30) * 30;
}

/**
 * True when nobody is busy between `from` and `to`. `own` is the meeting being
 * moved: it is in everyone's busy times already and does not count against itself.
 */
export function everyoneFree(
  busyByPerson: TimeSlotDto[][], from: number, to: number, own: { start: number; end: number }
): boolean {
  for (const slots of busyByPerson) {
    for (const slot of slots) {
      const start = Math.max(new Date(slot.start).getTime(), from);
      const end = Math.min(new Date(slot.end).getTime(), to);
      if (start >= end) continue;
      if (start < own.start || end > own.end) return false;
    }
  }
  return true;
}
