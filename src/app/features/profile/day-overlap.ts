import { locale, num, t } from '../../core/i18n/i18n';
import { timeZoneLabel, zonedParts } from '../../core/utils/time-zone';

/**
 * Hour-of-day maths for the "Your day and theirs" chart. Hours are decimal
 * (9.5 is 09:30) on the viewer's own clock; the chart runs from 06:00 to 22:00.
 */
export const AXIS_START = 6;
export const AXIS_HOURS = 16;

/** A stretch of the day. `end` may pass 24 when it runs over midnight. */
export interface Span {
  start: number;
  end: number;
}

/** "09:30" -> 9.5. Anything unreadable gives the fallback. */
export function clockHours(value: string | null | undefined, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  if (!match) return fallback;
  return Number(match[1]) + Number(match[2]) / 60;
}

/** How far a zone's clock is ahead of UTC at a moment, in hours. */
export function zoneOffsetHours(zone: string, at: Date): number {
  const parts = zonedParts(at, zone);
  const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return Math.round((shown - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000) / 60;
}

/** Hours on someone else's clock, moved onto the viewer's. `ahead` is how far their clock runs ahead. */
export function onViewerClock(span: Span, ahead: number): Span {
  const start = (((span.start - ahead) % 24) + 24) % 24;
  return { start, end: start + (span.end - span.start) };
}

/** Where two stretches coincide, taking a day as a circle. Sorted, on the viewer's clock. */
export function sharedSpans(mine: Span, theirs: Span): Span[] {
  const found: Span[] = [];
  for (const shift of [-24, 0, 24]) {
    const start = Math.max(mine.start, theirs.start + shift);
    const end = Math.min(mine.end, theirs.end + shift);
    if (end - start > 1e-6) found.push({ start, end });
  }
  return found.sort((a, b) => a.start - b.start);
}

/** The parts of a stretch that fall on the chart's axis (a stretch over midnight can show twice). */
export function visibleSpans(span: Span): Span[] {
  const found: Span[] = [];
  for (const shift of [-24, 0, 24]) {
    const start = Math.max(AXIS_START, span.start + shift);
    const end = Math.min(AXIS_START + AXIS_HOURS, span.end + shift);
    if (end - start > 1e-6) found.push({ start, end });
  }
  return found;
}

/** Position of an hour along the axis, in percent. */
export function axisPercent(hour: number): number {
  return Math.max(0, Math.min(100, ((hour - AXIS_START) / AXIS_HOURS) * 100));
}

/** 9.5 -> "09:30", or "9:30 AM" on a 12-hour clock. Hours wrap around the day. */
export function formatClock(hour: number, hour24: boolean): string {
  const total = Math.round((((hour % 24) + 24) % 24) * 60) % 1440;
  const h = Math.floor(total / 60);
  const minutes = String(total % 60).padStart(2, '0');
  if (hour24) return num(`${String(h).padStart(2, '0')}:${minutes}`);
  return t(h < 12 ? '{time} AM' : '{time} PM', { time: num(`${h % 12 || 12}:${minutes}`) });
}

/**
 * "Africa/Cairo" -> "Cairo": the city of the shared zone label ("Cairo (GMT+2)"),
 * so a place is named the same way here and in the time zone pickers.
 */
export function zoneCity(zone: string): string {
  const city = timeZoneLabel(zone).replace(/\s*\([^()]*\)\s*$/, '').trim();
  return city || zone.split('/').pop()?.replace(/_/g, ' ') || zone;
}

/** "2 h behind", "3 h 30 min ahead" or "same time as you". `ahead` is their clock minus the viewer's. */
export function offsetText(ahead: number): string {
  if (Math.abs(ahead) < 1e-6) return t('same time as you');
  const minutes = Math.round(Math.abs(ahead) * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (ahead < 0) return m ? t('{h} h {m} min behind', { h, m }) : t('{h} h behind', { h });
  return m ? t('{h} h {m} min ahead', { h, m }) : t('{h} h ahead', { h });
}

// ── Words from the calendar of the interface language ────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A week day as the API spells it ("Sunday"), named in the interface language: "Sunday" or "Sun". */
export function weekdayLabel(day: string, width: 'long' | 'short' = 'long'): string {
  const index = WEEKDAYS.indexOf(day);
  if (index < 0) return day;
  // 1 January 2023 was a Sunday.
  return new Intl.DateTimeFormat(locale(), { weekday: width, timeZone: 'UTC' })
    .format(new Date(Date.UTC(2023, 0, 1 + index)));
}

/** "13 Nov" or "25 December": the day before the month, as these screens have always written it. */
export function dayMonthLabel(date: Date, timeZone: string, month: 'short' | 'long'): string {
  const parts = new Intl.DateTimeFormat(locale(), { day: 'numeric', month, timeZone }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return t('{day} {month}', { day: part('day'), month: part('month') });
}

/** Several short things in a row: "Sun, Mon, Tue". */
export function listText(items: string[]): string {
  return items.join(t(', '));
}
