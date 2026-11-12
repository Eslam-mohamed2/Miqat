import {
  dayKey, dayKeyInZone, dayKeyOfCell, formatTimeInZone, isValidTimeZone, safeTimeZone,
  timeZoneLabel, zonedParts
} from './time-zone';

describe('time-zone helpers', () => {
  // 02:00 UTC on 12 Nov: still the 11th in New York, already the 12th in Cairo.
  const instant = new Date('2026-11-12T02:00:00Z');

  it('accepts IANA zone names and rejects free text', () => {
    expect(isValidTimeZone('Africa/Cairo')).toBeTrue();
    expect(isValidTimeZone('UTC')).toBeTrue();
    expect(isValidTimeZone('UTC+2')).toBeFalse();
    expect(isValidTimeZone('')).toBeFalse();
    expect(isValidTimeZone(null)).toBeFalse();
  });

  it('falls back to a usable zone when the profile holds an invalid one', () => {
    expect(isValidTimeZone(safeTimeZone('UTC+2'))).toBeTrue();
    expect(safeTimeZone(' Africa/Cairo ')).toBe('Africa/Cairo');
  });

  it('puts the same instant on different days in different zones', () => {
    expect(dayKeyInZone(instant, 'America/New_York')).toBe('2026-11-11');
    expect(dayKeyInZone(instant, 'Africa/Cairo')).toBe('2026-11-12');
    expect(dayKeyInZone(instant, 'UTC')).toBe('2026-11-12');
  });

  it('reads the clock fields of an instant in a zone', () => {
    expect(zonedParts(instant, 'UTC')).toEqual({ year: 2026, month: 11, day: 12, hour: 2, minute: 0 });
    expect(zonedParts(instant, 'America/New_York').hour).toBe(21);
  });

  it('keys a calendar cell by its own date, whatever zone is in use', () => {
    // A grid cell is a local date standing for a day on the wall calendar. Running
    // it through a zone is what once highlighted the wrong day as "today".
    expect(dayKeyOfCell(new Date(2026, 10, 12))).toBe('2026-11-12');
    expect(dayKeyOfCell(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('pads day keys', () => {
    expect(dayKey(2026, 3, 7)).toBe('2026-03-07');
  });

  it('formats a time in the requested zone', () => {
    expect(formatTimeInZone(instant, 'UTC')).toMatch(/2:00/);
    expect(formatTimeInZone(instant, 'America/New_York')).toMatch(/9:00/);
  });

  it('labels a zone with its city and offset', () => {
    expect(timeZoneLabel('Africa/Cairo')).toMatch(/^Cairo \(GMT[+-]\d/);
    expect(timeZoneLabel('America/New_York')).toContain('New York');
    expect(timeZoneLabel('UTC')).toContain('UTC');
  });
});
