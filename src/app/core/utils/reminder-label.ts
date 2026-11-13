import { CalendarItemKind } from '../../models/api.models';
import { t, tCount } from '../i18n/i18n';

/** The "minutes before" choices offered wherever a reminder can be set. */
export const REMINDER_PRESETS: readonly number[] = [0, 5, 15, 30, 60, 1440];

type Unit = 'week' | 'day' | 'hour' | 'minute';
const UNITS: [number, Unit][] = [[10080, 'week'], [1440, 'day'], [60, 'hour'], [1, 'minute']];

/** "3 weeks", "1 day": one unit, counted the way the language counts. */
function counted(count: number, unit: Unit): string {
  switch (unit) {
    case 'week': return tCount(count, '{n} week', '{n} weeks');
    case 'day': return tCount(count, '{n} day', '{n} days');
    case 'hour': return tCount(count, '{n} hour', '{n} hours');
    case 'minute': return tCount(count, '{n} minute', '{n} minutes');
  }
}

/** The same before a reminder's "before": Arabic needs another form of the noun there ("قبل دقيقتين"). */
function countedBefore(count: number, unit: Unit): string {
  switch (unit) {
    case 'week': return tCount(count, '{n} week before', '{n} weeks before');
    case 'day': return tCount(count, '{n} day before', '{n} days before');
    case 'hour': return tCount(count, '{n} hour before', '{n} hours before');
    case 'minute': return tCount(count, '{n} minute before', '{n} minutes before');
  }
}

function split(minutes: number): [number, Unit][] {
  const parts: [number, Unit][] = [];
  let rest = Math.max(0, Math.round(minutes));

  for (const [size, unit] of UNITS) {
    const count = Math.floor(rest / size);
    if (!count) continue;
    parts.push([count, unit]);
    rest -= count * size;
  }
  return parts;
}

/** 90 -> "1 hour 30 minutes", 1440 -> "1 day". In Arabic "ساعة واحدة و٣٠ دقيقة", "يوم واحد". */
export function durationLabel(minutes: number): string {
  const parts = split(minutes).map(([count, unit]) => counted(count, unit));
  if (!parts.length) return counted(0, 'minute');
  return parts.reduce((all, part) => t('{first} {next}@@duration', { first: all, next: part }));
}

/** "15 minutes before", or for 0 "When it starts" / "When it is due". */
export function reminderLabel(minutesBefore: number, kind: CalendarItemKind = 'Event'): string {
  if (minutesBefore <= 0) return kind === 'Task' ? t('When it is due') : t('When it starts');

  const parts = split(minutesBefore);
  if (parts.length === 1) return countedBefore(parts[0][0], parts[0][1]);
  return t('{duration} before', { duration: durationLabel(minutesBefore) });
}
