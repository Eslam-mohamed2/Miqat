import { useLanguageForTests } from '../i18n/i18n';
import { AR_COMMON } from '../i18n/ar/common';
import { AR_CORE } from '../i18n/ar/core';
import {
  allDaySpan, dateInputInZone, dayKey, dayKeyInZone, dayKeyOfCell, formatShortTimeInZone, formatTimeInZone,
  isValidTimeZone, safeTimeZone, timeInputInZone, timeZoneCity, timeZoneLabel, zonedParts
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

  it('writes the clock the English way, whatever the device is set to', () => {
    const afternoon = new Date('2026-11-12T14:05:00Z');
    expect(formatTimeInZone(instant, 'UTC')).toBe('2:00 AM');
    expect(formatTimeInZone(afternoon, 'UTC')).toBe('2:05 PM');
    expect(formatTimeInZone(afternoon, 'UTC', true)).toBe('14:05');
  });

  it('writes the shortest clock time', () => {
    expect(formatShortTimeInZone(new Date('2026-11-12T19:00:00Z'), 'UTC')).toBe('7pm');
    expect(formatShortTimeInZone(new Date('2026-11-12T08:46:00Z'), 'UTC')).toBe('8:46am');
    expect(formatShortTimeInZone(new Date('2026-11-12T00:00:00Z'), 'UTC')).toBe('12am');
    expect(formatShortTimeInZone(new Date('2026-11-12T19:00:00Z'), 'UTC', true)).toBe('19:00');
    expect(timeZoneLabel('UTC')).toBe('UTC (GMT)');
    expect(timeZoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
  });

  describe('in Arabic', () => {
    const dictionary = { ...AR_COMMON, ...AR_CORE };
    const afternoon = new Date('2026-11-12T14:05:00Z');

    afterEach(() => useLanguageForTests('en'));

    it('writes the clock with ص and م, in Arabic digits', () => {
      useLanguageForTests('ar', { dictionary, numerals: 'arab' });

      expect(formatTimeInZone(instant, 'UTC')).toBe('٢:٠٠ ص');
      expect(formatTimeInZone(afternoon, 'UTC')).toBe('٢:٠٥ م');
      expect(formatTimeInZone(afternoon, 'UTC', true)).toBe('١٤:٠٥');
      expect(formatShortTimeInZone(new Date('2026-11-12T19:00:00Z'), 'UTC')).toBe('٧ م');
      expect(formatShortTimeInZone(new Date('2026-11-12T08:46:00Z'), 'UTC')).toBe('٨:٤٦ ص');
      expect(formatShortTimeInZone(afternoon, 'UTC', true)).toBe('١٤:٠٥');
    });

    it('keeps 0-9 when those digits were chosen', () => {
      useLanguageForTests('ar', { dictionary, numerals: 'latn' });

      expect(formatTimeInZone(afternoon, 'UTC')).toBe('2:05 م');
      expect(formatTimeInZone(afternoon, 'UTC', true)).toBe('14:05');
      expect(formatShortTimeInZone(new Date('2026-11-12T08:46:00Z'), 'UTC')).toBe('8:46 ص');
    });

    it('names the city of a zone in Arabic, with the offset from Greenwich', () => {
      useLanguageForTests('ar', { dictionary, numerals: 'arab' });

      expect(timeZoneCity('Africa/Cairo')).toBe('القاهرة');
      expect(timeZoneCity('America/New_York')).toBe('نيويورك');
      expect(timeZoneLabel('Africa/Cairo')).toMatch(/^القاهرة \(غرينتش\+[٢٣]\)$/);
      expect(timeZoneLabel('Asia/Riyadh')).toBe('الرياض (غرينتش+٣)');
      expect(timeZoneLabel('UTC')).toBe('التوقيت العالمي (غرينتش)');

      useLanguageForTests('ar', { dictionary, numerals: 'latn' });
      expect(timeZoneLabel('Asia/Riyadh')).toBe('الرياض (غرينتش+3)');
    });

    it('has an Arabic name for every zone the browser offers', () => {
      useLanguageForTests('ar', { dictionary });
      const zones = (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf('timeZone');
      const latin = zones.filter(zone => /[A-Za-z]/.test(timeZoneCity(zone)));

      expect(zones.length).toBeGreaterThan(300);
      expect(latin).toEqual([]);
    });

    it('leaves what goes into inputs and to the API alone', () => {
      useLanguageForTests('ar', { dictionary, numerals: 'arab' });

      expect(dateInputInZone(instant, 'Africa/Cairo')).toBe('2026-11-12');
      expect(timeInputInZone(instant, 'Africa/Cairo')).toBe('04:00');
      expect(dayKeyInZone(instant, 'America/New_York')).toBe('2026-11-11');
      expect(zonedParts(instant, 'UTC')).toEqual({ year: 2026, month: 11, day: 12, hour: 2, minute: 0 });
    });
  });

  describe('the days of an all-day event', () => {
    // Saturday 14 November, midnight to midnight in Cairo (UTC+2).
    const start = new Date('2026-11-13T22:00:00Z');
    const end = new Date('2026-11-14T22:00:00Z');
    const the14th = { year: 2026, month: 11, day: 14, days: 1 };

    it('is the day it was given, in the zone it was made in', () => {
      expect(allDaySpan(start, end, 'Africa/Cairo')).toEqual(the14th);
    });

    it('stays on that day when it is seen from another zone', () => {
      // 17:00 on the 13th in New York, 07:00 on the 14th in Tokyo: not midnight in either.
      for (const zone of ['America/New_York', 'Europe/London', 'Asia/Riyadh', 'Asia/Tokyo', 'Pacific/Auckland', 'UTC']) {
        expect(allDaySpan(start, end, zone)).toEqual(the14th);
      }
    });

    it('keeps the date of one made far east or far west', () => {
      // The 14th in Auckland (UTC+13) and in Honolulu (UTC-10).
      const auckland = allDaySpan(new Date('2026-11-13T11:00:00Z'), new Date('2026-11-14T11:00:00Z'), 'America/New_York');
      const honolulu = allDaySpan(new Date('2026-11-14T10:00:00Z'), new Date('2026-11-15T10:00:00Z'), 'Asia/Tokyo');
      expect(auckland).toEqual(the14th);
      expect(honolulu).toEqual(the14th);
    });

    it('counts the days of a longer one', () => {
      // The 17th and 18th, stored in New York's midnights.
      const span = allDaySpan(new Date('2026-11-17T05:00:00Z'), new Date('2026-11-19T05:00:00Z'), 'Africa/Cairo');
      expect(span).toEqual({ year: 2026, month: 11, day: 17, days: 2 });
    });

    it('takes a day of 23 or 25 hours, when the clocks change, as one day', () => {
      // Sunday 8 March 2026 in New York: the clocks go forward, the day has 23 hours.
      const span = allDaySpan(new Date('2026-03-08T05:00:00Z'), new Date('2026-03-09T04:00:00Z'), 'America/New_York');
      expect(span).toEqual({ year: 2026, month: 3, day: 8, days: 1 });
    });

    it('falls back to the days its instants touch when it is not a whole number of days', () => {
      const span = allDaySpan(new Date('2026-11-14T08:00:00Z'), new Date('2026-11-14T09:00:00Z'), 'Africa/Cairo');
      expect(span).toEqual(the14th);
    });
  });
});
