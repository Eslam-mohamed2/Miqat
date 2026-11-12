import {
  cellOfInstant, dateInputInZone, formatShortTimeInZone, formatTimeInZone, instantFromInputs,
  timeInputInZone, zonedTimeToUtc
} from './time-zone';

/** The helpers the event window uses to turn form fields into moments and back. */
describe('time-zone helpers for form fields', () => {
  it('finds the moment a zone shows a given date and time', () => {
    // New York is UTC-5 in November, Cairo UTC+2.
    expect(zonedTimeToUtc(2026, 11, 12, 9, 0, 'America/New_York').toISOString()).toBe('2026-11-12T14:00:00.000Z');
    expect(zonedTimeToUtc(2026, 11, 12, 9, 0, 'Africa/Cairo').toISOString()).toBe('2026-11-12T07:00:00.000Z');
    expect(zonedTimeToUtc(2026, 11, 12, 9, 0, 'UTC').toISOString()).toBe('2026-11-12T09:00:00.000Z');
  });

  it('follows daylight saving time', () => {
    // New York is UTC-4 in July.
    expect(zonedTimeToUtc(2026, 7, 1, 9, 0, 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    // The morning after the clocks went back (1 Nov 2026) is on winter time again.
    expect(zonedTimeToUtc(2026, 11, 1, 9, 0, 'America/New_York').toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('gives midnight of a day in the zone, which is how an all-day event starts', () => {
    expect(zonedTimeToUtc(2026, 11, 21, 0, 0, 'America/New_York').toISOString()).toBe('2026-11-21T05:00:00.000Z');
  });

  it('fills date and time fields from a moment, in the zone', () => {
    const moment = new Date('2026-11-12T02:30:00Z');
    expect(dateInputInZone(moment, 'America/New_York')).toBe('2026-11-11');
    expect(timeInputInZone(moment, 'America/New_York')).toBe('21:30');
    expect(dateInputInZone(moment, 'Africa/Cairo')).toBe('2026-11-12');
    expect(timeInputInZone(moment, 'Africa/Cairo')).toBe('04:30');
  });

  it('reads the fields back to the same moment', () => {
    const moment = new Date('2026-11-12T02:30:00Z');
    for (const zone of ['America/New_York', 'Africa/Cairo', 'Asia/Kolkata', 'UTC']) {
      const back = instantFromInputs(dateInputInZone(moment, zone), timeInputInZone(moment, zone), zone);
      expect(back?.toISOString()).withContext(zone).toBe(moment.toISOString());
    }
  });

  it('answers null for fields that are not filled in', () => {
    expect(instantFromInputs('', '09:00', 'UTC')).toBeNull();
    expect(instantFromInputs('2026-11-12', '', 'UTC')).toBeNull();
    expect(instantFromInputs('12/11/2026', '09:00', 'UTC')).toBeNull();
  });

  it('writes the shortest readable time for a month cell', () => {
    expect(formatShortTimeInZone(new Date('2026-11-12T14:00:00Z'), 'UTC')).toBe('2pm');
    expect(formatShortTimeInZone(new Date('2026-11-12T08:46:00Z'), 'UTC')).toBe('8:46am');
    expect(formatShortTimeInZone(new Date('2026-11-12T00:00:00Z'), 'UTC')).toBe('12am');
    expect(formatShortTimeInZone(new Date('2026-11-12T12:05:00Z'), 'UTC')).toBe('12:05pm');
    expect(formatShortTimeInZone(new Date('2026-11-12T14:00:00Z'), 'UTC', true)).toBe('14:00');
  });

  it('prints a 24-hour time when asked', () => {
    const moment = new Date('2026-11-12T14:05:00Z');
    expect(formatTimeInZone(moment, 'UTC', true)).toBe('14:05');
    expect(formatTimeInZone(moment, 'UTC')).toMatch(/2:05\s?PM/i);
  });

  it('finds the calendar cell of a moment in a zone', () => {
    const cell = cellOfInstant(new Date('2026-11-12T02:30:00Z'), 'America/New_York');
    expect([cell.getFullYear(), cell.getMonth(), cell.getDate()]).toEqual([2026, 10, 11]);
  });
});
