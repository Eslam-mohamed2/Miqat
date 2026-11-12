import { CalendarItemDto, CalendarItemKind, GroupDto } from '../../models/api.models';
import { readableTextOn } from '../../core/utils/color';
import {
  dayKey, dayKeyInZone, formatShortTimeInZone, formatTimeInZone, zonedParts
} from '../../core/utils/time-zone';

/** Colour of a task that belongs to no project, and of an event whose calendar has none. */
export const DEFAULT_TASK_COLOR = '#2ec4a0';
export const DEFAULT_EVENT_COLOR = '#4F46E5';

/** A multi-day event is drawn on at most this many days, so bad data cannot hang the page. */
const MAX_SPAN_DAYS = 62;

/** One calendar item as it is drawn on one day. */
export interface CalendarChip {
  /** Unique within a day: a repeating item has the same id on every date. */
  key: string;
  kind: CalendarItemKind;
  id: string;
  item: CalendarItemDto;
  title: string;
  /** Short label for a month cell: "9am", "All day", "Until 10am". */
  time: string;
  /** Full label for lists: "9:00 – 10:00 AM", "All day". */
  timeRange: string;
  color: string;
  /** Text colour that is readable on `color`. */
  textColor: string;
  /** A task that is finished. */
  done: boolean;
  /** An invitation the user has not answered yet. */
  pending: boolean;
  /** An invitation the user declined. */
  declined: boolean;
  /** All-day items lead the day; the rest follow by start time. */
  sort: number;
}

export interface ChipOptions {
  zone: string;
  hour24: boolean;
  groups: GroupDto[];
}

/** "9:00 – 10:00 AM" (same half of the day says AM/PM once), or "All day". */
export function timeRangeLabel(item: CalendarItemDto, zone: string, hour24: boolean): string {
  if (item.isAllDay) return 'All day';
  const start = new Date(item.start);
  const end = new Date(item.end);
  const from = formatTimeInZone(start, zone, hour24);
  if (item.kind === 'Task' || end.getTime() <= start.getTime()) return from;
  const to = formatTimeInZone(end, zone, hour24);
  if (hour24) return `${from} – ${to}`;

  // "9:00 AM – 10:00 AM" -> "9:00 – 10:00 AM". The pattern takes any kind of
  // space: browsers put a narrow no-break space before AM / PM.
  const suffix = /\s?(AM|PM)$/i;
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
export function chipsByDay(items: CalendarItemDto[], options: ChipOptions): Map<string, CalendarChip[]> {
  const { zone, hour24, groups } = options;
  const groupColors = new Map(groups.map(group => [group.id, group.color || DEFAULT_TASK_COLOR]));
  const byDay = new Map<string, CalendarChip[]>();

  for (const item of items) {
    const start = new Date(item.start);
    const end = new Date(item.end);
    if (Number.isNaN(start.getTime())) continue;

    const isTask = item.kind === 'Task';
    const color = isTask
      ? groupColors.get(item.groupId ?? '') ?? DEFAULT_TASK_COLOR
      : item.color || DEFAULT_EVENT_COLOR;

    const base = {
      kind: item.kind,
      id: item.id,
      item,
      title: item.title,
      timeRange: timeRangeLabel(item, zone, hour24),
      color,
      textColor: readableTextOn(color),
      done: isTask && item.status === 'Completed',
      pending: !isTask && item.myResponse === 'Pending',
      declined: !isTask && item.myResponse === 'Declined'
    };

    // The days it touches. The last instant is exclusive: an event that ends at
    // midnight does not spill onto the next day.
    const firstKey = dayKeyInZone(start, zone);
    const lastInstant = !isTask && end.getTime() > start.getTime() ? new Date(end.getTime() - 1) : start;
    const lastKey = dayKeyInZone(lastInstant, zone);

    const first = zonedParts(start, zone);
    const cursor = new Date(first.year, first.month - 1, first.day);

    for (let span = 0; span < MAX_SPAN_DAYS; span++) {
      const key = dayKey(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
      const isFirst = key === firstKey;
      const isLast = key === lastKey;

      let time: string;
      if (item.isAllDay || (!isFirst && !isLast)) time = 'All day';
      else if (isFirst) time = formatShortTimeInZone(start, zone, hour24);
      else time = `Until ${formatShortTimeInZone(end, zone, hour24)}`;

      const list = byDay.get(key) ?? [];
      list.push({
        ...base,
        key: `${item.kind}:${item.id}:${item.occurrenceStart ?? ''}:${span}`,
        time,
        sort: time === 'All day' ? -1 : (isFirst ? start.getTime() : 0)
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
