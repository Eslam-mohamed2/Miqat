/**
 * Places tasks into the free time of one day ("Plan my day").
 *
 * The rule is plain: tasks are taken due-soonest first, and each goes into the
 * earliest free stretch of the working day that is long enough. Meetings, the
 * minutes kept free after them, lunch and prayer times are never covered.
 * "Shuffle" asks for another arrangement that obeys the same rule.
 *
 * All times are minutes from midnight of the day being planned.
 */

export interface Stretch { start: number; end: number; }

export interface PlanTask {
  id: string;
  /** How long it takes. */
  minutes: number;
  /** When it is due, as a time stamp; null when it has no due date. */
  due: number | null;
  /** A start the user chose (by dragging, or a block saved earlier); the planner leaves it there. */
  fixedStart?: number | null;
}

export interface PlanOptions {
  /** Working hours. */
  dayStart: number;
  dayEnd: number;
  /** Nothing is placed before this (the current time, when planning today). */
  notBefore: number;
  meetings: Stretch[];
  /** Minutes kept free after each meeting; 0 for none. */
  bufferAfterMeetings: number;
  /** The lunch break, or null when it is not protected. */
  lunch: Stretch | null;
  /** Prayer times to plan around; empty when that is switched off. */
  prayers: number[];
  /** Minutes kept free from each prayer time. */
  prayerPause: number;
  /** Starts fall on multiples of this many minutes. */
  step: number;
}

export interface PlacedTask extends Stretch {
  id: string;
  /** True when the start was the user's choice. */
  fixed: boolean;
}

export interface DayPlan {
  /** In the order of the day. */
  placed: PlacedTask[];
  /** Ids of the tasks that found no room. */
  unplaced: string[];
}

/** Sorts stretches and joins the ones that touch or overlap. */
export function mergeStretches(stretches: Stretch[]): Stretch[] {
  const merged: Stretch[] = [];
  for (const stretch of [...stretches].filter(s => s.end > s.start).sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && stretch.start <= last.end) last.end = Math.max(last.end, stretch.end);
    else merged.push({ ...stretch });
  }
  return merged;
}

/** Everything a task may not cover, before any task is placed. */
export function blockedStretches(options: PlanOptions): Stretch[] {
  const blocked: Stretch[] = options.meetings.map(meeting => ({
    start: meeting.start,
    end: meeting.end + options.bufferAfterMeetings
  }));
  if (options.lunch) blocked.push(options.lunch);
  for (const prayer of options.prayers) blocked.push({ start: prayer, end: prayer + options.prayerPause });
  return mergeStretches(blocked);
}

/** The free stretches of the working day, given what is blocked. */
export function freeStretches(blocked: Stretch[], from: number, to: number): Stretch[] {
  const free: Stretch[] = [];
  let cursor = from;
  for (const block of mergeStretches(blocked)) {
    if (block.end <= cursor) continue;
    if (block.start >= to) break;
    if (block.start > cursor) free.push({ start: cursor, end: Math.min(block.start, to) });
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < to) free.push({ start: cursor, end: to });
  return free;
}

const roundUp = (value: number, step: number) => Math.ceil(value / step) * step;
const roundDown = (value: number, step: number) => Math.floor(value / step) * step;

/** A small repeatable random-number source, so one seed always gives one arrangement. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The plan for a day. `variant` 0 is the rule as stated (due-soonest first, earliest
 * stretch that fits); any other number is another arrangement that still fits.
 */
export function planDay(tasks: PlanTask[], options: PlanOptions, variant = 0): DayPlan {
  const placed: PlacedTask[] = [];
  const unplaced: string[] = [];
  const blocked = blockedStretches(options);

  // Starts the user chose stay where they are, and the rest is planned around them.
  for (const task of tasks) {
    if (task.fixedStart === null || task.fixedStart === undefined) continue;
    const block = { id: task.id, start: task.fixedStart, end: task.fixedStart + task.minutes, fixed: true };
    placed.push(block);
    blocked.push({ start: block.start, end: block.end });
  }

  const open = tasks.filter(task => task.fixedStart === null || task.fixedStart === undefined);
  const byDue = (a: PlanTask, b: PlanTask) =>
    (a.due ?? Number.POSITIVE_INFINITY) - (b.due ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id);
  const order = [...open].sort(byDue);

  const random = variant ? seeded(variant) : null;
  if (random) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }

  const from = Math.max(options.dayStart, options.notBefore);
  for (const task of order) {
    // One candidate per free stretch: its first start on the step.
    const starts: number[] = [];
    for (const stretch of freeStretches(blocked, from, options.dayEnd)) {
      const start = roundUp(stretch.start, options.step);
      if (start + task.minutes <= stretch.end) starts.push(start);
    }

    if (!starts.length) {
      unplaced.push(task.id);
      continue;
    }
    const start = random ? starts[Math.floor(random() * starts.length)] : starts[0];
    placed.push({ id: task.id, start, end: start + task.minutes, fixed: false });
    blocked.push({ start, end: start + task.minutes });
  }

  placed.sort((a, b) => a.start - b.start);
  return { placed, unplaced };
}

/** True when two plans put every task at the same time. */
export function samePlan(a: DayPlan, b: DayPlan): boolean {
  if (a.placed.length !== b.placed.length) return false;
  const starts = new Map(a.placed.map(block => [block.id, block.start]));
  return b.placed.every(block => starts.get(block.id) === block.start);
}

/**
 * Where a block of `minutes` dropped at `wanted` can actually start: the nearest
 * start, on the step, at which it covers nothing in `blocked` and stays inside
 * [from, to]. null when it fits nowhere.
 */
export function nearestStart(
  wanted: number, minutes: number, blocked: Stretch[], from: number, to: number, step: number
): number | null {
  let best: number | null = null;
  for (const stretch of freeStretches(blocked, from, to)) {
    const first = roundUp(stretch.start, step);
    const last = roundDown(stretch.end - minutes, step);
    if (last < first) continue;
    const start = Math.min(last, Math.max(first, Math.round(wanted / step) * step));
    if (best === null || Math.abs(start - wanted) < Math.abs(best - wanted)) best = start;
  }
  return best;
}

export interface Workload {
  meetingMinutes: number;
  taskMinutes: number;
  capacityMinutes: number;
  totalMinutes: number;
  freeMinutes: number;
  over: boolean;
  /** Widths of the two parts of the meter, 0 to 100. */
  meetingShare: number;
  taskShare: number;
}

/** The workload meter: meetings plus chosen tasks against the length of the working day. */
export function workload(meetingMinutes: number, taskMinutes: number, capacityMinutes: number): Workload {
  const totalMinutes = meetingMinutes + taskMinutes;
  const scale = Math.max(capacityMinutes, totalMinutes) || 1;
  return {
    meetingMinutes, taskMinutes, capacityMinutes, totalMinutes,
    freeMinutes: Math.max(0, capacityMinutes - totalMinutes),
    over: totalMinutes > capacityMinutes,
    meetingShare: (meetingMinutes / scale) * 100,
    taskShare: (taskMinutes / scale) * 100
  };
}

/** Minutes of meetings in a day, with overlapping ones counted once. */
export function minutesCovered(stretches: Stretch[]): number {
  return mergeStretches(stretches).reduce((sum, stretch) => sum + (stretch.end - stretch.start), 0);
}
