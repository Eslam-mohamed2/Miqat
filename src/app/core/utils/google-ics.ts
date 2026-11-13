/**
 * Turns events read from Google's Calendar API into iCalendar text for Miqat's own
 * .ics import (POST /api/Calendar/import), which knows an event by its UID: a second
 * import of the same event updates it instead of adding a copy.
 *
 * What the import keeps is what is written here: title, start and end (as exact
 * moments, or as dates for an all-day event), place, description, a repeat every N
 * days, weeks, months or years with its end, and the dates of a series that do not
 * happen. Three things Google can hold are reshaped to fit that:
 *
 *  - a weekly event on several weekdays becomes one series per weekday, because a
 *    Miqat series repeats on the weekday of its first date only;
 *  - one changed date of a series becomes a skipped date of the series plus an
 *    event of its own, because the import leaves RECURRENCE-ID entries out;
 *  - a rule Miqat cannot follow ("the second Tuesday", "the last weekday") keeps
 *    its frequency only, and the event is named in `simplified`.
 *
 * Guests, reminders, colours and visibility are left out: the import has no place
 * for them.
 */
import { t } from '../i18n/i18n';
import { isValidTimeZone, zonedParts, zonedTimeToUtc } from './time-zone';

/** A start or an end as Google gives it: a date for all-day events, otherwise a moment. */
export interface GoogleEventTime {
  /** `yyyy-mm-dd`; an all-day end is the day after the last one. */
  date?: string;
  /** RFC 3339, normally with an offset. */
  dateTime?: string;
  /** IANA name of the zone the event was made in. */
  timeZone?: string;
}

/** The fields of a Google Calendar event the import reads. */
export interface GoogleEvent {
  id: string;
  /** "confirmed", "tentative" or "cancelled". */
  status?: string;
  summary?: string;
  /** May hold simple HTML. */
  description?: string;
  location?: string;
  /** The Google Meet address, when the event has one. */
  hangoutLink?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  /** RRULE, EXDATE, RDATE and EXRULE lines of a repeating event. */
  recurrence?: string[];
  /** On a changed or deleted date of a series: the id of the series. */
  recurringEventId?: string;
  /** On a changed or deleted date of a series: where the series had put it. */
  originalStartTime?: GoogleEventTime;
  iCalUID?: string;
  /** "default", "focusTime", "outOfOffice", "workingLocation", "birthday", "fromGmail". */
  eventType?: string;
}

export interface IcsOptions {
  /** Written on every entry as its DTSTAMP. */
  now: Date;
  /** The import refuses a file with more than 2000 events. */
  maxEventsPerFile?: number;
  /** The import refuses a file over 2 MB. */
  maxBytesPerFile?: number;
}

export interface IcsConversion {
  /** iCalendar texts, each within the limits of one import. Empty when nothing is left to import. */
  files: string[];
  /** Entries written across the files. */
  written: number;
  /** Events left out: cancelled, without a readable start, or working-location markers. */
  leftOut: number;
  /** Titles of repeating events whose rule is kept more simply than Google has it. */
  simplified: string[];
  /** Titles of events written as one series per weekday. */
  split: string[];
}

const DEFAULT_MAX_EVENTS = 1000;
const DEFAULT_MAX_BYTES = 1_500_000;
const MAX_LINE_OCTETS = 75;
// The import cuts a description to its column size; cutting here keeps the file small.
const MAX_DESCRIPTION = 2000;

const DAY_MS = 86_400_000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
// A safety net for "repeat N times" on several weekdays, not a product rule.
const MAX_COUNTED_DATES = 5000;

const HEADER = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Miqat//Google Calendar import//EN', 'CALSCALE:GREGORIAN'];
const FOOTER = 'END:VCALENDAR';

/** A day on a wall calendar, counted from 1 January 1970. */
type Day = number;

/** Whose wall clock a time is read on: an IANA zone, or minutes ahead of UTC. */
type Clock = string | number;

interface Moment {
  allDay: boolean;
  /** The day on the event's own wall calendar. */
  day: Day;
  /** Seconds after midnight on that calendar; 0 for an all-day event. */
  seconds: number;
  clock: Clock;
  /** A time with neither offset nor zone: written without one, and read in the user's own. */
  floating: boolean;
}

interface Repeat {
  /** "FREQ=WEEKLY;INTERVAL=2". */
  rule: string;
  /** ";UNTIL=20261231T215959Z", ";COUNT=10" or "". */
  end: string;
  interval: number;
  count: number | null;
  until: string | null;
  /** Weekly events only: the weekdays (0 = Sunday) the rule names. */
  weekdays: number[];
  weekStart: number;
  simplified: boolean;
}

export function googleEventsToIcs(events: GoogleEvent[], options: IcsOptions): IcsConversion {
  const result: IcsConversion = { files: [], written: 0, leftOut: 0, simplified: [], split: [] };
  const stamp = `DTSTAMP:${utcText(options.now)}`;
  const entries: string[] = [];

  // A deleted or changed date of a series arrives as an event of its own that
  // names the series; the series has to skip that date.
  const skippedBySeries = new Map<string, Set<string>>();
  for (const event of events) {
    const original = event.recurringEventId ? readMoment(event.originalStartTime) : null;
    if (!original) continue;
    const skipped = skippedBySeries.get(event.recurringEventId!) ?? new Set<string>();
    skipped.add(skipLine(original));
    skippedBySeries.set(event.recurringEventId!, skipped);
  }

  for (const event of events) {
    if (event.status === 'cancelled') {
      // A deleted date of a series is not an event that was left out.
      if (!event.recurringEventId) result.leftOut++;
      continue;
    }

    const start = readMoment(event.start);
    if (!start || event.eventType === 'workingLocation') {
      result.leftOut++;
      continue;
    }

    const title = (event.summary ?? '').trim() || t('(No title)');
    const end = readMoment(event.end);
    // Kept on the wall clock for all-day events and as elapsed time for the rest.
    const length = !end || end.allDay !== start.allDay ? 0
      : start.allDay ? end.day - start.day
      : instantOf(end).getTime() - instantOf(start).getTime();

    const body = [
      `SUMMARY:${escapeText(title)}`,
      ...optional('DESCRIPTION', plainText(event.description ?? '').slice(0, MAX_DESCRIPTION)),
      ...optional('LOCATION', (event.location ?? '').trim() || (event.hangoutLink ?? '').trim())
    ];

    const write = (uid: string, first: Moment, tail: string[]) => {
      entries.push(foldLines([
        'BEGIN:VEVENT', `UID:${uid}`, stamp, ...timeLines(first, length), ...body, ...tail, 'END:VEVENT'
      ]));
    };

    if (event.recurringEventId) {
      write(oneLine(`${event.id}@google.com`), start, []);
      continue;
    }

    const uid = oneLine(event.iCalUID ?? '') || oneLine(`${event.id}@google.com`);
    const lines = event.recurrence ?? [];
    const repeat = readRepeat(lines, start);
    if (repeat?.simplified || (lines.length > 0 && !repeat)) result.simplified.push(title);

    if (!repeat) {
      write(uid, start, []);
      continue;
    }

    const skips = [...new Set([...skipLines(lines), ...(skippedBySeries.get(event.id) ?? [])])];
    const series = seriesOf(start, repeat);
    if (series.length > 1) result.split.push(title);

    for (const part of series) {
      const partUid = part.weekday === null ? uid : `${uid}#${WEEKDAYS[part.weekday]}`;
      write(partUid, part.first, [`RRULE:${repeat.rule}${part.end}`, ...skips]);
    }
  }

  result.written = entries.length;
  result.files = toFiles(entries, options.maxEventsPerFile ?? DEFAULT_MAX_EVENTS, options.maxBytesPerFile ?? DEFAULT_MAX_BYTES);
  return result;
}

// ── Times ─────────────────────────────────────────────────────────────────────

function readMoment(time: GoogleEventTime | undefined): Moment | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(time?.date ?? '');
  if (date) {
    return { allDay: true, day: dayOf(+date[1], +date[2], +date[3]), seconds: 0, clock: 0, floating: false };
  }

  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i
    .exec(time?.dateTime ?? '');
  if (!parts) return null;

  const zone = isValidTimeZone(time?.timeZone) ? time!.timeZone!.trim() : null;
  const day = dayOf(+parts[1], +parts[2], +parts[3]);
  const seconds = +parts[4] * 3600 + +parts[5] * 60 + +(parts[6] ?? 0);
  const offset = parts[7];

  if (!offset) return { allDay: false, day, seconds, clock: zone ?? 0, floating: !zone };

  const minutes = offset.toUpperCase() === 'Z' ? 0
    : (offset[0] === '-' ? -1 : 1) * (+offset.slice(1, 3) * 60 + +offset.slice(-2));
  const written: Moment = { allDay: false, day, seconds, clock: minutes, floating: false };
  // The time is written on the calendar's clock; the event keeps to its own zone's.
  return zone ? onClock(instantOf(written), zone) : written;
}

function dayOf(year: number, month: number, day: number): Day {
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

function weekdayOf(day: Day): number {
  // 1 January 1970 was a Thursday.
  return (((day + 4) % 7) + 7) % 7;
}

function instantOf(moment: Moment): Date {
  if (typeof moment.clock === 'number') {
    return new Date(moment.day * DAY_MS + moment.seconds * 1000 - moment.clock * 60_000);
  }
  const date = new Date(moment.day * DAY_MS);
  const hour = Math.floor(moment.seconds / 3600);
  const minute = Math.floor((moment.seconds % 3600) / 60);
  const instant = zonedTimeToUtc(
    date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute, moment.clock);
  return new Date(instant.getTime() + (moment.seconds % 60) * 1000);
}

function onClock(instant: Date, zone: string): Moment {
  const parts = zonedParts(instant, zone);
  return {
    allDay: false,
    day: dayOf(parts.year, parts.month, parts.day),
    seconds: parts.hour * 3600 + parts.minute * 60 + instant.getUTCSeconds(),
    clock: zone,
    floating: false
  };
}

function shifted(moment: Moment, days: number): Moment {
  return { ...moment, day: moment.day + days };
}

function dateText(day: Day): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10).replace(/-/g, '');
}

/** "20261112T090000Z" */
function utcText(instant: Date): string {
  return instant.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';
}

function momentText(moment: Moment): string {
  if (moment.allDay) return dateText(moment.day);
  const text = utcText(instantOf(moment));
  return moment.floating ? text.slice(0, -1) : text;
}

function timeLines(start: Moment, length: number): string[] {
  if (start.allDay) {
    const lines = [`DTSTART;VALUE=DATE:${dateText(start.day)}`];
    if (length > 0) lines.push(`DTEND;VALUE=DATE:${dateText(start.day + length)}`);
    return lines;
  }

  const lines = [`DTSTART:${momentText(start)}`];
  if (length > 0) {
    const end = utcText(new Date(instantOf(start).getTime() + length));
    lines.push(`DTEND:${start.floating ? end.slice(0, -1) : end}`);
  }
  return lines;
}

function skipLine(moment: Moment): string {
  return moment.allDay ? `EXDATE;VALUE=DATE:${dateText(moment.day)}` : `EXDATE:${momentText(moment)}`;
}

// ── Repeating ─────────────────────────────────────────────────────────────────

/** Null when the lines hold no rule Miqat can repeat by. */
function readRepeat(lines: string[], start: Moment): Repeat | null {
  const line = lines.find(candidate => /^RRULE[;:]/i.test(candidate.trim()));
  if (!line) return null;

  const parts = new Map<string, string>();
  for (const pair of line.slice(line.indexOf(':') + 1).split(';')) {
    const [name, value] = pair.split('=', 2);
    if (name && value !== undefined) parts.set(name.trim().toUpperCase(), value.trim().toUpperCase());
  }

  const frequency = parts.get('FREQ') ?? '';
  if (!FREQUENCIES.includes(frequency)) return null;

  const interval = positive(parts.get('INTERVAL')) ?? 1;
  const until = /^\d{8}(T\d{6}Z?)?$/.test(parts.get('UNTIL') ?? '') ? parts.get('UNTIL')! : null;
  const count = until ? null : positive(parts.get('COUNT'));

  const date = new Date(start.day * DAY_MS);
  const named = (parts.get('BYDAY') ?? '').split(',').filter(Boolean);
  const plainDays = named.every(name => WEEKDAYS.includes(name));
  const weekdays = frequency === 'WEEKLY' && plainDays ? [...new Set(named.map(name => WEEKDAYS.indexOf(name)))] : [];

  // A part that only repeats what the first date already says changes nothing.
  const sameAsStart = (name: string, value: number) => !parts.has(name) || parts.get(name) === String(value);
  const simplified =
    lines.some(candidate => /^(RDATE|EXRULE)[;:]/i.test(candidate.trim()))
    || (named.length > 0 && weekdays.length === 0)
    || ['BYSETPOS', 'BYYEARDAY', 'BYWEEKNO', 'BYHOUR', 'BYMINUTE', 'BYSECOND'].some(name => parts.has(name))
    || !sameAsStart('BYMONTHDAY', date.getUTCDate())
    || !sameAsStart('BYMONTH', date.getUTCMonth() + 1)
    // Without a month, a yearly rule with a day of the month means that day of every month.
    || (parts.has('BYMONTHDAY') && frequency !== 'MONTHLY' && !(frequency === 'YEARLY' && parts.has('BYMONTH')))
    || (parts.has('BYMONTH') && frequency !== 'YEARLY');

  return {
    rule: `FREQ=${frequency};INTERVAL=${interval}`,
    end: until ? `;UNTIL=${until}` : count ? `;COUNT=${count}` : '',
    interval, count, until, weekdays,
    weekStart: Math.max(0, WEEKDAYS.indexOf(parts.get('WKST') ?? 'MO')),
    simplified
  };
}

function positive(value: string | undefined): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/** EXDATE lines as the import reads them best: dates as dates, times as UTC. */
function skipLines(lines: string[]): string[] {
  const skips: string[] = [];

  for (const line of lines) {
    const match = /^EXDATE((?:;[^:]*)?):(.*)$/i.exec(line.trim());
    if (!match) continue;
    const zone = /;TZID=([^;:]+)/i.exec(match[1])?.[1];

    for (const value of match[2].split(',')) {
      const parts = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/i.exec(value.trim());
      if (!parts) continue;

      const moment = readMoment(parts[4] === undefined
        ? { date: `${parts[1]}-${parts[2]}-${parts[3]}` }
        : {
            dateTime: `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}${parts[7] ? 'Z' : ''}`,
            timeZone: parts[7] ? undefined : zone
          });
      if (moment) skips.push(skipLine(moment));
    }
  }

  return skips;
}

interface SeriesPart {
  first: Moment;
  /** The weekday this part repeats on (0 = Sunday); null for the series as Google has it. */
  weekday: number | null;
  /** The rule's ";UNTIL=..." or ";COUNT=..." for this part. */
  end: string;
}

/**
 * The series to write for one repeating event: itself, or, for a weekly event on
 * several weekdays, one weekly series per weekday, each from its own first date.
 */
function seriesOf(start: Moment, repeat: Repeat): SeriesPart[] {
  const startWeekday = weekdayOf(start.day);
  if (!repeat.weekdays.length || (repeat.weekdays.length === 1 && repeat.weekdays[0] === startWeekday)) {
    return [{ first: start, weekday: null, end: repeat.end }];
  }

  // Days are counted inside the week the rule starts its weeks on, so "every
  // second week" keeps all weekdays in the same weeks.
  const inWeek = (weekday: number) => (weekday - repeat.weekStart + 7) % 7;
  const weekStart = start.day - inWeek(startWeekday);
  const weekdays = [...repeat.weekdays].sort((a, b) => inWeek(a) - inWeek(b));

  // "10 times" counts the dates of all weekdays together: it becomes an end date.
  let end = repeat.end;
  let lastDay: Day | null = null;
  if (repeat.count) {
    let counted = 0;
    for (let week = 0; counted < repeat.count && week < MAX_COUNTED_DATES; week++) {
      for (const weekday of weekdays) {
        const day = weekStart + week * 7 * repeat.interval + inWeek(weekday);
        if (day < start.day || counted >= repeat.count) continue;
        counted++;
        lastDay = day;
      }
    }
    end = lastDay === null ? '' : `;UNTIL=${momentText(shifted(start, lastDay - start.day))}`;
  } else if (repeat.until) {
    lastDay = untilDay(repeat.until, start);
  }

  const parts: SeriesPart[] = [];
  for (const weekday of weekdays) {
    let day = weekStart + inWeek(weekday);
    if (day < start.day) day += 7 * repeat.interval;
    if (lastDay !== null && day > lastDay) continue;
    parts.push({ first: shifted(start, day - start.day), weekday, end });
  }

  if (!parts.length) return [{ first: start, weekday: null, end: repeat.end }];

  // The event's own UID stays on the part that holds its first date.
  parts.sort((a, b) => a.first.day - b.first.day);
  parts[0] = { ...parts[0], weekday: null };
  return parts;
}

/** The last day an UNTIL allows, on the event's own wall calendar. */
function untilDay(until: string, start: Moment): Day {
  const day = dayOf(+until.slice(0, 4), +until.slice(4, 6), +until.slice(6, 8));
  if (until.length === 8 || start.allDay || !until.endsWith('Z')) return day;

  const instant = new Date(Date.UTC(
    +until.slice(0, 4), +until.slice(4, 6) - 1, +until.slice(6, 8), +until.slice(9, 11), +until.slice(11, 13), +until.slice(13, 15)));
  // The last date is the last one whose start is not after that moment.
  let last = typeof start.clock === 'string'
    ? onClock(instant, start.clock).day
    : Math.floor((instant.getTime() + start.clock * 60_000) / DAY_MS);
  if (instantOf(shifted(start, last - start.day)).getTime() > instant.getTime()) last--;
  return last;
}

// ── Text ──────────────────────────────────────────────────────────────────────

/**
 * A UID is written as it is, because the import compares it unescaped. It comes
 * from whoever sent the invitation, so a line break in it must not start a line.
 */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function optional(name: string, value: string): string[] {
  return value ? [`${name}:${escapeText(value)}`] : [];
}

/** Backslash, semicolon and comma are escaped; a line break is written as \n. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * A line longer than 75 octets continues on the next one after a space. The
 * limit counts UTF-8 bytes, and a character is never cut in two.
 */
export function foldLine(line: string): string {
  let folded = '';
  let octets = 0;

  for (const character of line) {
    const size = utf8Size(character);
    if (octets + size > MAX_LINE_OCTETS) {
      folded += '\r\n ';
      octets = 1;
    }
    folded += character;
    octets += size;
  }

  return folded;
}

function foldLines(lines: string[]): string {
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

function utf8Size(character: string): number {
  const code = character.codePointAt(0) ?? 0;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
}

function utf8Length(text: string): number {
  let length = 0;
  for (const character of text) length += utf8Size(character);
  return length;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };

/** Google's description editor saves simple HTML; Miqat shows descriptions as plain text. */
export function plainText(value: string): string {
  if (!/<\/?[a-z][^>]*>|&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(value)) return value.trim();

  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_link, address: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      return !text || text === address ? address : `${text} (${address})`;
    })
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, name: string) => {
      if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? entity;
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Files ─────────────────────────────────────────────────────────────────────

function toFiles(entries: string[], maxEvents: number, maxBytes: number): string[] {
  const head = HEADER.join('\r\n') + '\r\n';
  const foot = FOOTER + '\r\n';
  const files: string[] = [];
  let current = '';
  let events = 0;
  let bytes = 0;

  const close = () => {
    if (events) files.push(head + current + foot);
    current = '';
    events = 0;
    bytes = 0;
  };

  for (const entry of entries) {
    const size = utf8Length(entry);
    if (events >= maxEvents || (events > 0 && head.length + foot.length + bytes + size > maxBytes)) close();
    current += entry;
    events++;
    bytes += size;
  }
  close();

  return files;
}
