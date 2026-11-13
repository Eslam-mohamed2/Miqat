import { CalendarItemDto, CalendarItemKind, GroupDto } from '../../models/api.models';
import { t } from '../../core/i18n/i18n';
import {
  allDaySpan, dayKey, dayKeyInZone, formatShortTimeInZone, formatTimeInZone, zonedParts
} from '../../core/utils/time-zone';

/**
 * Colour of a task that belongs to no project, and of an event whose calendar has
 * none. Theme tokens rather than fixed colours, so both follow the theme.
 */
export const DEFAULT_TASK_COLOR = 'var(--mq-accent-text)';
export const DEFAULT_EVENT_COLOR = 'var(--mq-blue)';

/** A multi-day event is drawn on at most this many days, so bad data cannot hang the page. */
const MAX_SPAN_DAYS = 62;

const DAY_MINUTES = 24 * 60;

/**
 * What the calendar draws: a feed item, or a task's time block. A time block
 * ("Planned") runs from `start` to `end` like an event; any other task is a
 * single moment, its due time.
 */
export type CalendarEntry = CalendarItemDto & { planned?: boolean };

/** One calendar item as it is drawn on one day. */
export interface CalendarChip {
  /** Unique within a day: a repeating item has the same id on every date. */
  key: string;
  kind: CalendarItemKind;
  id: string;
  item: CalendarEntry;
  title: string;
  /** Short label for a month cell: "9am", "All day", "Until 10am". */
  time: string;
  /** Full label for lists: "9:00 – 10:00 AM", "All day". */
  timeRange: string;
  color: string;
  /** A task that is finished. */
  done: boolean;
  /** An invitation the user has not answered yet. */
  pending: boolean;
  /** An invitation the user declined. */
  declined: boolean;
  /** A task's time block. */
  planned: boolean;
  /** Drawn in the all-day row: an all-day event, a middle day of a long one, a task due on a date with no time. */
  allDay: boolean;
  /** Where it sits on this day's time grid, in minutes from midnight. A due time has no length. */
  startMin: number;
  endMin: number;
  /** All-day items lead the day; the rest follow by start time. */
  sort: number;
}

export interface ChipOptions {
  zone: string;
  hour24: boolean;
  groups: GroupDto[];
}

/** True for what has a length: events and time blocks. A plain task is one moment. */
function hasLength(item: CalendarEntry): boolean {
  return item.kind !== 'Task' || !!item.planned;
}

/** "9:00 – 10:00 AM" (same half of the day says AM/PM once), or "All day". */
export function timeRangeLabel(item: CalendarEntry, zone: string, hour24: boolean): string {
  if (item.isAllDay) return t('All day');
  const start = new Date(item.start);
  const end = new Date(item.end);
  const from = formatTimeInZone(start, zone, hour24);
  if (!hasLength(item) || end.getTime() <= start.getTime()) return from;
  const to = formatTimeInZone(end, zone, hour24);
  if (hour24) return `${from} – ${to}`;

  // "9:00 AM – 10:00 AM" -> "9:00 – 10:00 AM", and "٩:٠٠ ص – ١٠:٠٠ ص" -> "٩:٠٠ – ١٠:٠٠ ص".
  // The pattern takes any kind of space: browsers put a narrow no-break space before AM / PM.
  const suffix = /\s?(AM|PM|ص|م)$/i;
  const fromHalf = suffix.exec(from)?.[1];
  const toHalf = suffix.exec(to)?.[1];
  return fromHalf && fromHalf === toHalf ? `${from.replace(suffix, '')} – ${to}` : `${from} – ${to}`;
}

/**
 * Spreads the feed over the days of the calendar: a map from `yyyy-mm-dd` (as seen
 * in `zone`) to what is drawn on that day, already in display order.
 *
 * An event that runs over midnight appears on each day it touches.
 */
export function chipsByDay(items: CalendarEntry[], options: ChipOptions): Map<string, CalendarChip[]> {
  const { zone, hour24, groups } = options;
  const groupColors = new Map(groups.map(group => [group.id, group.color || DEFAULT_TASK_COLOR]));
  const byDay = new Map<string, CalendarChip[]>();
  const minutesOf = (date: Date) => {
    const parts = zonedParts(date, zone);
    return parts.hour * 60 + parts.minute;
  };

  for (const item of items) {
    const start = new Date(item.start);
    const end = new Date(item.end);
    if (Number.isNaN(start.getTime())) continue;

    const isTask = item.kind === 'Task';
    const ranged = hasLength(item) && end.getTime() > start.getTime();
    const color = isTask
      ? groupColors.get(item.groupId ?? '') ?? (item.color || DEFAULT_TASK_COLOR)
      : item.color || DEFAULT_EVENT_COLOR;

    const base = {
      kind: item.kind,
      id: item.id,
      item,
      title: item.title,
      timeRange: timeRangeLabel(item, zone, hour24),
      color,
      done: isTask && item.status === 'Completed',
      pending: !isTask && item.myResponse === 'Pending',
      declined: !isTask && item.myResponse === 'Declined',
      planned: !!item.planned
    };

    // An all-day event keeps the dates it was given, in whatever zone it is seen.
    if (item.isAllDay) {
      const span = allDaySpan(start, end, zone);
      const days = Math.min(span.days, MAX_SPAN_DAYS);
      for (let index = 0; index < days; index++) {
        const cell = new Date(span.year, span.month - 1, span.day + index);
        const key = dayKey(cell.getFullYear(), cell.getMonth() + 1, cell.getDate());
        const list = byDay.get(key) ?? [];
        list.push({
          ...base,
          key: `${item.kind}:${item.id}:${item.occurrenceStart ?? ''}:${index}`,
          time: t('All day'), allDay: true, startMin: 0, endMin: DAY_MINUTES, sort: -1
        });
        byDay.set(key, list);
      }
      continue;
    }

    // The days it touches. The last instant is exclusive: an event that ends at
    // midnight does not spill onto the next day.
    const firstKey = dayKeyInZone(start, zone);
    const lastInstant = ranged ? new Date(end.getTime() - 1) : start;
    const lastKey = dayKeyInZone(lastInstant, zone);

    const first = zonedParts(start, zone);
    const cursor = new Date(first.year, first.month - 1, first.day);
    const startMinutes = first.hour * 60 + first.minute;

    for (let span = 0; span < MAX_SPAN_DAYS; span++) {
      const key = dayKey(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
      const isFirst = key === firstKey;
      const isLast = key === lastKey;

      const startMin = isFirst ? startMinutes : 0;
      // An end at midnight is the end of this day, not minute 0 of it.
      const endMin = !ranged ? startMin : isLast ? (minutesOf(end) || DAY_MINUTES) : DAY_MINUTES;
      // A task due at midnight was given a date and no time.
      const allDay = (!isFirst && !isLast) || (isTask && !ranged && startMin === 0);

      let time: string;
      if (allDay) time = t('All day');
      else if (isFirst) time = formatShortTimeInZone(start, zone, hour24);
      else time = t('Until {time}', { time: formatShortTimeInZone(end, zone, hour24) });

      const list = byDay.get(key) ?? [];
      list.push({
        ...base,
        key: `${item.kind}:${item.id}:${item.occurrenceStart ?? ''}:${item.planned ? 'p' : ''}${span}`,
        time,
        timeRange: allDay ? t('All day') : base.timeRange,
        allDay,
        startMin,
        endMin,
        sort: allDay ? -1 : (isFirst ? start.getTime() : 0)
      });
      byDay.set(key, list);

      if (isLast) break;
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  for (const list of byDay.values()) {
    list.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
  }
  return byDay;
}
