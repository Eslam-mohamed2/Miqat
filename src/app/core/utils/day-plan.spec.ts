import { PlanOptions, PlanTask, nearestStart, planDay, samePlan, workload } from './day-plan';

/** A 09:00 to 17:00 day with a stand-up, a planning meeting and lunch. */
const options: PlanOptions = {
  dayStart: 9 * 60,
  dayEnd: 17 * 60,
  notBefore: 0,
  meetings: [{ start: 9 * 60 + 30, end: 10 * 60 }, { start: 11 * 60 + 30, end: 12 * 60 + 30 }],
  bufferAfterMeetings: 10,
  lunch: { start: 13 * 60, end: 14 * 60 },
  prayers: [],
  prayerPause: 15,
  step: 5
};

const task = (id: string, minutes: number, due: number | null = null): PlanTask => ({ id, minutes, due });

describe('planDay', () => {
  it('puts the task due soonest into the earliest free stretch that fits', () => {
    const plan = planDay([task('later', 30, 200), task('sooner', 30, 100)], options);

    expect(plan.placed.map(block => [block.id, block.start])).toEqual([['sooner', 9 * 60], ['later', 10 * 60 + 10]]);
  });

  it('keeps ten minutes free after a meeting, and nothing over lunch', () => {
    const plan = planDay([task('long', 75)], options);

    // 09:00-09:30 is too short; after the stand-up and its buffer there is room until 11:30.
    expect(plan.placed[0].start).toBe(10 * 60 + 10);

    const afternoon = planDay([task('a', 80), task('b', 80)], options);
    expect(afternoon.placed.every(block => block.end <= 13 * 60 || block.start >= 14 * 60)).toBeTrue();
  });

  it('does not cover a prayer time when asked to plan around them', () => {
    const plan = planDay([task('a', 60)], { ...options, meetings: [], lunch: null, prayers: [9 * 60 + 30] });

    expect(plan.placed[0].start).toBe(9 * 60 + 45);
  });

  it('places nothing before the current time, and says what did not fit', () => {
    const plan = planDay([task('a', 60), task('b', 120)], { ...options, notBefore: 15 * 60 + 30 });

    expect(plan.placed.map(block => [block.id, block.start])).toEqual([['a', 15 * 60 + 30]]);
    expect(plan.unplaced).toEqual(['b']);
  });

  it('leaves a start the user chose where it is and plans around it', () => {
    const plan = planDay([{ ...task('pinned', 60), fixedStart: 9 * 60 }, task('other', 30)], { ...options, meetings: [] });

    expect(plan.placed.find(block => block.id === 'pinned')).toEqual(jasmine.objectContaining({ start: 9 * 60, fixed: true }));
    expect(plan.placed.find(block => block.id === 'other')!.start).toBe(10 * 60);
  });

  it('shuffles into another arrangement that still fits', () => {
    const tasks = [task('a', 30, 1), task('b', 30, 2), task('c', 30, 3)];
    const first = planDay(tasks, options);
    const others = [1, 2, 3, 4, 5, 6].map(seed => planDay(tasks, options, seed));

    expect(others.some(plan => !samePlan(plan, first))).toBeTrue();
    for (const plan of others) {
      expect(plan.unplaced).toEqual([]);
      const blocks = [...plan.placed].sort((x, y) => x.start - y.start);
      blocks.forEach((block, index) => {
        if (index) expect(block.start).toBeGreaterThanOrEqual(blocks[index - 1].end);
        expect(block.start).toBeGreaterThanOrEqual(options.dayStart);
        expect(block.end).toBeLessThanOrEqual(options.dayEnd);
      });
    }
  });
});

describe('nearestStart', () => {
  it('lands a dropped block on the nearest free start', () => {
    const blocked = [{ start: 600, end: 660 }];

    expect(nearestStart(610, 30, blocked, 540, 1020, 5)).toBe(570);
    expect(nearestStart(650, 30, blocked, 540, 1020, 5)).toBe(660);
    expect(nearestStart(600, 600, blocked, 540, 1020, 5)).toBeNull();
  });
});

describe('workload', () => {
  it('is the design\'s meter: meetings plus tasks against the working day', () => {
    const load = workload(195, 165, 480);

    expect(load.totalMinutes).toBe(360);
    expect(load.freeMinutes).toBe(120);
    expect(load.over).toBeFalse();
    expect(load.meetingShare).toBeCloseTo(40.625, 3);
  });

  it('turns over capacity once the total passes the working day', () => {
    const load = workload(240, 300, 480);

    expect(load.over).toBeTrue();
    expect(load.freeMinutes).toBe(0);
    expect(load.meetingShare + load.taskShare).toBeCloseTo(100, 5);
  });
});
