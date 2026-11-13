import { AR_CALENDAR } from '../../core/i18n/ar/calendar';
import { AR_COMMON, AR_COMMON_PLURALS } from '../../core/i18n/ar/common';
import { AR_CORE, AR_CORE_PLURALS } from '../../core/i18n/ar/core';
import { useLanguageForTests } from '../../core/i18n/i18n';
import { CalendarChip } from './calendar-chips';
import {
  countdownLabel, dayAndMonth, everyoneFree, firstFreeStart, hourLabel, initialsOf, isoWeek, isolate, joinLink, listOf,
  loadLevel,
  longDate, monthAndYear, placeDay, prayerDuring, shortDate,
  startAfterPrayer, weekNumberOfRow, weekdayName, zoneCode, zoneDifferenceLabel
} from './calendar-layout';

/** A chip with only what the layout looks at. */
function chip(key: string, startMin: number, endMin: number, allDay = false): CalendarChip {
  return { key, startMin, endMin, allDay } as CalendarChip;
}

describe('calendar layout', () => {
  it('gives a block its place from its minutes (56px an hour, as in the design)', () => {
    const [block] = placeDay([chip('a', 11 * 60 + 30, 12 * 60 + 30)]);

    expect(block.top).toBe(11.5 * 56 + 1);
    expect(block.height).toBe(56 - 3);
    expect(block.left).toBe('3px');
    expect(block.width).toBe('calc(100% - 6px)');
    expect(block.stacked).toBeFalse();
  });

  it('keeps a short item tall enough to read', () => {
    expect(placeDay([chip('a', 600, 610)])[0].height).toBe(24);
    // A due time has no length at all.
    expect(placeDay([chip('a', 600, 600)])[0].height).toBe(24);
  });

  it('lays two overlapping items over each other, the later one to the right', () => {
    const placed = placeDay([chip('hire', 660, 720), chip('vendor', 690, 750)]);
    const byKey = Object.fromEntries(placed.map(block => [block.chip.key, block]));

    expect(byKey['hire'].left).toBe('3px');
    expect(byKey['hire'].width).toBe('calc(66% - 3px)');
    expect(byKey['hire'].stacked).toBeFalse();
    expect(byKey['vendor'].left).toBe('34%');
    expect(byKey['vendor'].stacked).toBeTrue();
  });

  it('gives items that only follow each other the whole width', () => {
    const placed = placeDay([chip('a', 540, 600), chip('b', 600, 660)]);
    expect(placed.map(block => block.width)).toEqual(['calc(100% - 6px)', 'calc(100% - 6px)']);
  });

  it('stands more than three overlapping items side by side', () => {
    const placed = placeDay([chip('a', 600, 660), chip('b', 600, 660), chip('c', 600, 660), chip('d', 600, 660)]);
    expect(new Set(placed.map(block => block.left)).size).toBe(4);
    expect(placed.every(block => block.width === 'calc(25% - 6px)')).toBeTrue();
  });

  it('leaves all-day items to the all-day row', () => {
    expect(placeDay([chip('holiday', 0, 1440, true)])).toEqual([]);
  });

  it('numbers a week by the ISO week of its middle day', () => {
    expect(isoWeek(new Date(2026, 10, 12))).toBe(46);
    // The week of Sunday 8 November 2026 is week 46, although that Sunday itself is in ISO week 45.
    expect(isoWeek(new Date(2026, 10, 8))).toBe(45);
    expect(weekNumberOfRow(new Date(2026, 10, 8))).toBe(46);
    expect(weekNumberOfRow(new Date(2026, 10, 9))).toBe(46);
  });

  it('turns a count of items into a load mark', () => {
    expect([0, 1, 2, 3, 4, 5, 12].map(loadLevel)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it('shortens a zone to a tag for the hour column', () => {
    expect(zoneCode('Africa/Cairo')).toBe('CAI');
    expect(zoneCode('Europe/London')).toBe('LON');
    expect(zoneCode('America/New_York')).toBe('NY');
    expect(zoneCode('UTC')).toBe('UTC');
  });

  it('says how far another zone is from the calendar zone', () => {
    const at = new Date('2026-11-12T10:00:00Z');
    expect(zoneDifferenceLabel('Europe/London', 'Africa/Cairo', at)).toBe('2 h behind');
    expect(zoneDifferenceLabel('Asia/Riyadh', 'Africa/Cairo', at)).toBe('1 h ahead');
    expect(zoneDifferenceLabel('Asia/Kolkata', 'Africa/Cairo', at)).toBe('3 h 30 min ahead');
    expect(zoneDifferenceLabel('Africa/Cairo', 'Africa/Cairo', at)).toBe('');
  });

  it('reads a meeting link from an event place, and leaves a room alone', () => {
    expect(joinLink('https://meet.google.com/abc-defg-hij')).toEqual({
      label: 'Google Meet', url: 'https://meet.google.com/abc-defg-hij'
    });
    expect(joinLink('https://us02web.zoom.us/j/123')?.label).toBe('Zoom');
    expect(joinLink('https://www.example.org/room')?.label).toBe('example.org');
    expect(joinLink('Room 2')).toBeNull();
    expect(joinLink(null)).toBeNull();
  });

  it('counts down to a start', () => {
    expect(countdownLabel(6 * 60_000)).toBe('6 min');
    expect(countdownLabel(126 * 60_000)).toBe('2 h 06 min');
  });

  it('finds the first free stretch of a day', () => {
    const busy = [{ startMin: 540, endMin: 600 }, { startMin: 615, endMin: 700 }];
    expect(firstFreeStart(busy, 30, 540, 1020)).toBe(705);
    expect(firstFreeStart(busy, 15, 540, 1020)).toBe(600);
    expect(firstFreeStart([{ startMin: 0, endMin: 1440 }], 30, 540, 1020)).toBeNull();
  });

  it('notices a prayer that starts during a meeting, and never sunrise', () => {
    const start = new Date('2026-11-12T09:30:00Z');
    const end = new Date('2026-11-12T10:30:00Z');
    const dhuhr = { name: 'Dhuhr' as const, at: new Date('2026-11-12T09:39:00Z') };

    expect(prayerDuring(start, end, [dhuhr])).toBe(dhuhr);
    expect(prayerDuring(start, end, [{ name: 'Sunrise' as const, at: dhuhr.at }])).toBeNull();
    expect(prayerDuring(start, end, [{ name: 'Asr' as const, at: end }])).toBeNull();
  });

  it('moves a start to the half hour at least 15 minutes after the prayer', () => {
    expect(startAfterPrayer(11 * 60 + 39)).toBe(12 * 60);
    expect(startAfterPrayer(11 * 60 + 50)).toBe(12 * 60 + 30);
  });

  it('calls a time free when nobody has anything in it but the meeting being moved', () => {
    const at = (time: string) => new Date(`2026-11-12T${time}:00Z`).getTime();
    const own = { start: at('11:30'), end: at('12:30') };
    const meeting = { start: '2026-11-12T11:30:00Z', end: '2026-11-12T12:30:00Z' };

    expect(everyoneFree([[meeting], [meeting]], at('12:00'), at('13:00'), own)).toBeTrue();
    // Someone has another meeting straight after: merged with this one by the server.
    expect(everyoneFree([[{ start: meeting.start, end: '2026-11-12T13:00:00Z' }]], at('12:00'), at('13:00'), own)).toBeFalse();
    expect(everyoneFree([[{ start: '2026-11-12T12:45:00Z', end: '2026-11-12T13:15:00Z' }]], at('12:00'), at('13:00'), own)).toBeFalse();
  });

  describe('dates and hours in words', () => {
    const arabic = (numerals: 'arab' | 'latn' = 'arab') => useLanguageForTests('ar', {
      dictionary: { ...AR_COMMON, ...AR_CORE, ...AR_CALENDAR },
      plurals: { ...AR_COMMON_PLURALS, ...AR_CORE_PLURALS },
      numerals
    });
    const thursday = new Date(2026, 10, 12);

    afterEach(() => useLanguageForTests('en'));

    it('writes English dates day first, as the design does', () => {
      expect(longDate(thursday)).toBe('Thursday, 12 November');
      expect(longDate(thursday, undefined, true)).toBe('Thursday, 12 November 2026');
      expect(shortDate(thursday)).toBe('Thu 12 Nov');
      expect(shortDate(Date.UTC(2027, 2, 9), 'UTC', true)).toBe('Tue 9 Mar 2027');
      expect(dayAndMonth(thursday)).toBe('12 November');
      expect(dayAndMonth(thursday, 'short')).toBe('12 Nov');
      expect(monthAndYear(thursday)).toBe('November 2026');
    });

    it('names the days of the week from 0 = Sunday', () => {
      expect([0, 1, 2, 3, 4, 5, 6].map(day => weekdayName(day))).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
      expect([0, 1, 2, 3, 4, 5, 6].map(day => weekdayName(day, 'narrow'))).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
      expect(weekdayName(4, 'long')).toBe('Thursday');
    });

    it('labels the hour column on both clocks', () => {
      expect([0, 9, 12, 23].map(hour => hourLabel(hour, false))).toEqual(['12 AM', '9 AM', '12 PM', '11 PM']);
      expect([0, 9, 23].map(hour => hourLabel(hour, true))).toEqual(['00:00', '09:00', '23:00']);
    });

    it('says all of it in Arabic, in the digits chosen', () => {
      arabic();
      expect(longDate(thursday, undefined, true)).toBe('الخميس، ١٢ نوفمبر ٢٠٢٦');
      expect(shortDate(thursday)).toBe('الخميس ١٢ نوفمبر');
      expect(monthAndYear(thursday)).toBe('نوفمبر ٢٠٢٦');
      expect(weekdayName(0)).toBe('الأحد');
      expect([0, 1, 2, 3, 4, 5, 6].map(day => weekdayName(day, 'narrow'))).toEqual(['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']);
      expect([9, 12].map(hour => hourLabel(hour, false))).toEqual(['٩ ص', '١٢ م']);
      expect(hourLabel(9, true)).toBe('٠٩:٠٠');
      expect(countdownLabel(126 * 60_000)).toBe('٢ س ٠٦ د');
      expect(listOf(['الخميس', '', 'عيد الفطر'])).toBe('الخميس، عيد الفطر');
      expect(zoneDifferenceLabel('Europe/London', 'Africa/Cairo', new Date('2026-11-12T10:00:00Z'))).toBe('متأخر ٢ س');

      arabic('latn');
      expect(longDate(thursday, undefined, true)).toBe('الخميس، 12 نوفمبر 2026');
      expect(hourLabel(9, false)).toBe('9 ص');
      expect(hourLabel(9, true)).toBe('09:00');
    });

    it('makes initials, and keeps Arabic ones from joining into a word', () => {
      expect(initialsOf('Eslam Mohamed')).toBe('EM');
      expect(initialsOf('omar')).toBe('O');
      expect(initialsOf('  ')).toBe('?');
      expect(initialsOf('محمد علي')).toBe('م\u200Cع');
      expect(initialsOf('مريم')).toBe('م');
    });

    it('keeps what a person typed apart from an Arabic sentence, and leaves English alone', () => {
      expect(isolate('Q&A (draft)')).toBe('Q&A (draft)');
      arabic();
      expect(isolate('Q&A (draft)')).toBe('\u2068Q&A (draft)\u2069');
      expect(isolate('')).toBe('');
      expect(isolate(null)).toBe('');
    });
  });
});
