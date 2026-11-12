import { CalendarItemKind } from '../../models/api.models';

/** The "minutes before" choices offered wherever a reminder can be set. */
export const REMINDER_PRESETS: readonly number[] = [0, 5, 15, 30, 60, 1440];

/** 90 -> "1 hour 30 minutes", 1440 -> "1 day". */
export function durationLabel(minutes: number): string {
  const units: [number, string][] = [[10080, 'week'], [1440, 'day'], [60, 'hour'], [1, 'minute']];
  const parts: string[] = [];
  let rest = Math.max(0, Math.round(minutes));

  for (const [size, name] of units) {
    const count = Math.floor(rest / size);
    if (!count) continue;
    parts.push(`${count} ${name}${count === 1 ? '' : 's'}`);
    rest -= count * size;
  }
  return parts.length ? parts.join(' ') : '0 minutes';
}

/** "15 minutes before", or for 0 "When it starts" / "When it is due". */
export function reminderLabel(minutesBefore: number, kind: CalendarItemKind = 'Event'): string {
  if (minutesBefore <= 0) return kind === 'Task' ? 'When it is due' : 'When it starts';
  return `${durationLabel(minutesBefore)} before`;
}
