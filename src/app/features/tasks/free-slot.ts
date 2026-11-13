/**
 * Finds room on the calendar for a task's time block.
 *
 * Times are instants in milliseconds. The caller passes the stretches that are
 * already taken (meetings, other tasks' blocks) and the working hours to stay in.
 */

export interface Stretch {
  start: number;
  end: number;
}

const QUARTER_MS = 15 * 60_000;

/** The next quarter of an hour at or after the given instant. */
export function roundUpToQuarter(instant: number): number {
  return Math.ceil(instant / QUARTER_MS) * QUARTER_MS;
}

/**
 * The first start, on the quarter hour, at which `minutes` fit inside `window`
 * without touching anything in `busy`. null when the window has no such gap.
 */
export function firstFreeStart(busy: Stretch[], window: Stretch, minutes: number): number | null {
  const length = minutes * 60_000;
  const taken = busy
    .filter(stretch => stretch.end > window.start && stretch.start < window.end)
    .sort((a, b) => a.start - b.start);

  let start = roundUpToQuarter(window.start);
  for (const stretch of taken) {
    if (start + length <= stretch.start) break;
    if (stretch.end > start) start = roundUpToQuarter(stretch.end);
  }

  return start + length <= window.end ? start : null;
}

/** "HH:mm" as minutes from midnight; `fallback` when it is not a clock time. */
export function clockMinutes(value: string | null | undefined, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  if (!match) return fallback;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes <= 24 * 60 ? minutes : fallback;
}
