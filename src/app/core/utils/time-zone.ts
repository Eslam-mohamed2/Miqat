/**
 * Time-zone helpers for the calendar.
 *
 * A task's due date is an instant. Which *day* it falls on, and what clock time to
 * print, depends on the zone it is viewed in — so every part of the calendar has to
 * ask the same zone. These helpers are that single place.
 *
 * What they return for the screen (clock times, zone labels) follows the interface
 * language and its digits; what they return for inputs and the API never does.
 */
import { locale, num, t } from '../i18n/i18n';

/** Calendar fields of an instant as seen from a time zone. `month` is 1-12. */
export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
const timeFormatters = new Map<string, Intl.DateTimeFormat>();

/** The zone of the device the app is running on. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * True when the name can be handed to Intl. Profiles can hold free text that is not
 * an IANA zone (for example "UTC+2"), and Intl throws a RangeError on those.
 */
export function isValidTimeZone(zone: string | null | undefined): zone is string {
  const name = zone?.trim();
  if (!name) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** The given zone when Intl accepts it, otherwise the device's zone. */
export function safeTimeZone(zone: string | null | undefined): string {
  return isValidTimeZone(zone) ? zone.trim() : browserTimeZone();
}

/** Year / month / day / hour / minute of an instant in a zone. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    partsFormatters.set(timeZone, formatter);
  }

  const fields: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') fields[part.type] = Number(part.value);
  }
  return {
    year: fields['year'], month: fields['month'], day: fields['day'],
    hour: fields['hour'], minute: fields['minute']
  };
}

/** `yyyy-mm-dd` for a calendar day. `month` is 1-12. */
export function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The day an instant falls on in a zone, as `yyyy-mm-dd`. */
export function dayKeyInZone(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return dayKey(parts.year, parts.month, parts.day);
}

/**
 * The key of a calendar *cell*. Grid cells are plain local dates that stand for a
 * day on the wall calendar, so their own year / month / day are what counts —
 * converting them through a zone would shift them by a day east or west of it.
 */
export function dayKeyOfCell(cell: Date): string {
  return dayKey(cell.getFullYear(), cell.getMonth() + 1, cell.getDate());
}

/** Today's date in a zone, as a local-midnight Date usable as a calendar cell. */
export function todayInZone(timeZone: string): Date {
  const parts = zonedParts(new Date(), timeZone);
  return new Date(parts.year, parts.month - 1, parts.day);
}

/**
 * Clock time of an instant in a zone: "11:23 AM", or "23:23" on a 24-hour clock.
 * In Arabic "١١:٢٣ ص", in the digits chosen.
 */
export function formatTimeInZone(date: Date, timeZone: string, hour24 = false): string {
  const key = `${locale()}|${timeZone}|${hour24}`;
  let formatter = timeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale(), hour24
      ? { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
      : { timeZone, hour: 'numeric', minute: '2-digit', hour12: true });
    timeFormatters.set(key, formatter);
  }
  return formatter.format(date);
}

/**
 * The shortest readable clock time, for places with very little room:
 * "7pm", "8:46am", or "19:00" on a 24-hour clock. In Arabic "٧ م", "٨:٤٦ ص".
 */
export function formatShortTimeInZone(date: Date, timeZone: string, hour24 = false): string {
  const parts = zonedParts(date, timeZone);
  const minutes = String(parts.minute).padStart(2, '0');
  if (hour24) return num(`${String(parts.hour).padStart(2, '0')}:${minutes}`);

  const hour = parts.hour % 12 || 12;
  const time = num(parts.minute ? `${hour}:${minutes}` : `${hour}`);
  return parts.hour < 12 ? t('{time}am', { time }) : t('{time}pm', { time });
}

/**
 * The instant at which a zone's wall clock shows the given date and time - the
 * reverse of {@link zonedParts}. `month` is 1-12.
 *
 * Form fields hold "12 November, 09:00" with no zone. This is what turns that into
 * the moment to store, for the zone the calendar is shown in rather than the
 * device's.
 */
export function zonedTimeToUtc(
  year: number, month: number, day: number, hour: number, minute: number, timeZone: string
): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  // Two passes: the first lands within an hour of the answer, the second settles
  // it when the first crossed a daylight-saving change.
  for (let pass = 0; pass < 2; pass++) {
    const shown = zonedParts(new Date(guess), timeZone);
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
    guess += wanted - shownAsUtc;
  }
  return new Date(guess);
}

/** `yyyy-mm-dd` of an instant in a zone: the value an `<input type="date">` takes. */
export function dateInputInZone(date: Date, timeZone: string): string {
  return dayKeyInZone(date, timeZone);
}

/** `HH:mm` of an instant in a zone: the value an `<input type="time">` takes. */
export function timeInputInZone(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

/**
 * The instant for a date field (`yyyy-mm-dd`) and a time field (`HH:mm`) read in a
 * zone, or null when either is not filled in properly.
 */
export function instantFromInputs(dateValue: string, timeValue: string, timeZone: string): Date | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue ?? '');
  const time = /^(\d{2}):(\d{2})/.exec(timeValue ?? '');
  if (!date || !time) return null;
  return zonedTimeToUtc(+date[1], +date[2], +date[3], +time[1], +time[2], timeZone);
}

/** The cell (a local-midnight Date) for the day an instant falls on in a zone. */
export function cellOfInstant(date: Date, timeZone: string): Date {
  const parts = zonedParts(date, timeZone);
  return new Date(parts.year, parts.month - 1, parts.day);
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** The calendar days an all-day event covers. `month` is 1-12. */
export interface AllDaySpan {
  year: number;
  month: number;
  day: number;
  days: number;
}

/**
 * The days of an all-day event, whatever zone it is looked at from.
 *
 * It is stored from one midnight to a later one in the zone it was made in. From
 * another zone those are no longer midnights (Cairo's midnight is 17:00 the day
 * before in New York), and reading them as instants would put the event on two
 * days. It belongs to the date it was given, so that date is found again: a
 * day's midnight falls between 11:00 UTC the day before (UTC+13) and 10:59 UTC
 * of the day itself (UTC-10:59). The few islands on UTC-11 and UTC+14 are read
 * right in their own zone only.
 */
export function allDaySpan(start: Date, end: Date, timeZone: string): AllDaySpan {
  const length = end.getTime() - start.getTime();
  const whole = Math.round(length / DAY_MS);
  // A day of 23 or 25 hours, when the clocks change, is still one day.
  const isWhole = whole >= 1 && Math.abs(length - whole * DAY_MS) <= HOUR_MS;

  const local = zonedParts(start, timeZone);
  if (local.hour === 0 && local.minute === 0 && isWhole) {
    return { year: local.year, month: local.month, day: local.day, days: whole };
  }

  if (isWhole) {
    const given = new Date(start.getTime() + 13 * HOUR_MS);
    return { year: given.getUTCFullYear(), month: given.getUTCMonth() + 1, day: given.getUTCDate(), days: whole };
  }

  // Not a whole number of days: the days its instants touch in this zone.
  const last = zonedParts(new Date(Math.max(start.getTime(), end.getTime() - 1)), timeZone);
  const days = Math.round(
    (Date.UTC(last.year, last.month - 1, last.day) - Date.UTC(local.year, local.month - 1, local.day)) / DAY_MS) + 1;
  return { year: local.year, month: local.month, day: local.day, days };
}

/**
 * The city a zone is named after, in the interface language: "Africa/Cairo" ->
 * "Cairo", in Arabic "القاهرة". A city the Arabic dictionary does not list keeps
 * its Latin name.
 */
export function timeZoneCity(timeZone: string): string {
  const city = timeZone.split('/').pop()?.replace(/_/g, ' ') || timeZone;
  return t(`${city}@@city`);
}

/** "Africa/Cairo" -> "Cairo (GMT+2)", in Arabic "القاهرة (غرينتش+٢)". */
export function timeZoneLabel(timeZone: string): string {
  const city = timeZoneCity(timeZone);
  try {
    const parts = new Intl.DateTimeFormat(locale(), { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date());
    // A zone on Greenwich time reads "GMT", not "GMT+0".
    const offset = (parts.find(part => part.type === 'timeZoneName')?.value ?? '').replace(/[+-][0٠]$/, '');
    return offset && offset !== city ? `${city} (${offset})` : city;
  } catch {
    return city;
  }
}
