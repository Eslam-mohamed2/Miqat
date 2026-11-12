/**
 * Time-zone helpers for the calendar.
 *
 * A task's due date is an instant. Which *day* it falls on, and what clock time to
 * print, depends on the zone it is viewed in — so every part of the calendar has to
 * ask the same zone. These helpers are that single place.
 */

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

/** Clock time of an instant in a zone: "11:23 AM", or "23:23" on a 24-hour clock. */
export function formatTimeInZone(date: Date, timeZone: string, hour24 = false): string {
  const key = `${timeZone}|${hour24}`;
  let formatter = timeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(undefined, hour24
      ? { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
      : { timeZone, hour: 'numeric', minute: '2-digit', hour12: true });
    timeFormatters.set(key, formatter);
  }
  return formatter.format(date);
}

/**
 * The shortest readable clock time, for places with very little room:
 * "7pm", "8:46am", or "19:00" on a 24-hour clock.
 */
export function formatShortTimeInZone(date: Date, timeZone: string, hour24 = false): string {
  const parts = zonedParts(date, timeZone);
  const minutes = String(parts.minute).padStart(2, '0');
  if (hour24) return `${String(parts.hour).padStart(2, '0')}:${minutes}`;

  const hour = parts.hour % 12 || 12;
  const half = parts.hour < 12 ? 'am' : 'pm';
  return parts.minute ? `${hour}:${minutes}${half}` : `${hour}${half}`;
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

/** "Africa/Cairo" -> "Cairo (GMT+2)". */
export function timeZoneLabel(timeZone: string): string {
  const city = timeZone.split('/').pop()?.replace(/_/g, ' ') || timeZone;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date());
    const offset = parts.find(part => part.type === 'timeZoneName')?.value ?? '';
    return offset && offset !== city ? `${city} (${offset})` : city;
  } catch {
    return city;
  }
}
