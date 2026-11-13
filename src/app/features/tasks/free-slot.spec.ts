import { clockMinutes, firstFreeStart, roundUpToQuarter } from './free-slot';

describe('firstFreeStart', () => {
  const at = (hour: number, minute = 0) => Date.UTC(2026, 10, 12, hour, minute);
  const day = { start: at(9), end: at(17) };

  it('starts at the beginning of an empty window', () => {
    expect(firstFreeStart([], day, 45)).toBe(at(9));
  });

  it('rounds the start up to the quarter hour', () => {
    expect(roundUpToQuarter(at(9, 7))).toBe(at(9, 15));
    expect(firstFreeStart([], { start: at(9, 7), end: at(17) }, 30)).toBe(at(9, 15));
  });

  it('skips a meeting and anything that overlaps it', () => {
    const busy = [{ start: at(9), end: at(10) }, { start: at(9, 30), end: at(11, 10) }];

    expect(firstFreeStart(busy, day, 30)).toBe(at(11, 15));
  });

  it('uses a gap between two meetings only when the task fits in it', () => {
    const busy = [{ start: at(9), end: at(10) }, { start: at(10, 30), end: at(12) }];

    expect(firstFreeStart(busy, day, 30)).toBe(at(10));
    expect(firstFreeStart(busy, day, 45)).toBe(at(12));
  });

  it('answers null when nothing is left before the window ends', () => {
    const busy = [{ start: at(9), end: at(16, 30) }];

    expect(firstFreeStart(busy, day, 45)).toBeNull();
    expect(firstFreeStart(busy, day, 30)).toBe(at(16, 30));
  });

  it('reads working hours and falls back when they are missing', () => {
    expect(clockMinutes('09:30', 0)).toBe(570);
    expect(clockMinutes('17:00:00', 0)).toBe(1020);
    expect(clockMinutes(null, 540)).toBe(540);
    expect(clockMinutes('late', 540)).toBe(540);
  });
});
