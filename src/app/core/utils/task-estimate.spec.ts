import { useLanguageForTests } from '../i18n/i18n';
import { AR_COMMON, AR_COMMON_PLURALS } from '../i18n/ar/common';
import { AR_CORE, AR_CORE_PLURALS } from '../i18n/ar/core';
import { durationLabel, reminderLabel } from './reminder-label';
import { estimateMinutes, formatDuration, formatEstimate, parseEstimate, visibleTags, withEstimate } from './task-estimate';

const arabic = (numerals: 'arab' | 'latn' = 'arab') => useLanguageForTests('ar', {
  dictionary: { ...AR_COMMON, ...AR_CORE }, plurals: { ...AR_COMMON_PLURALS, ...AR_CORE_PLURALS }, numerals
});

describe('task estimates', () => {
  afterEach(() => useLanguageForTests('en'));

  describe('in English', () => {
    it('writes an estimate the short way and a length the spaced way', () => {
      expect(formatEstimate(45)).toBe('45m');
      expect(formatEstimate(75)).toBe('1h 15m');
      expect(formatEstimate(120)).toBe('2h');
      expect(formatEstimate(0)).toBe('');
      expect(formatEstimate(null)).toBe('');

      expect(formatDuration(285)).toBe('4 h 45 min');
      expect(formatDuration(120)).toBe('2 h');
      expect(formatDuration(30)).toBe('30 min');
      expect(formatDuration(0)).toBe('0 min');
    });

    it('reads what people type', () => {
      expect(parseEstimate('30m')).toBe(30);
      expect(parseEstimate('1h')).toBe(60);
      expect(parseEstimate('1h 30m')).toBe(90);
      expect(parseEstimate('1.5h')).toBe(90);
      expect(parseEstimate('2 hours')).toBe(120);
      expect(parseEstimate('45 minutes')).toBe(45);
      expect(parseEstimate('~20m')).toBe(20);
      expect(parseEstimate('90')).toBe(90);
      expect(parseEstimate('')).toBeNull();
      expect(parseEstimate('soon')).toBeNull();
      expect(parseEstimate('0')).toBeNull();
    });

    it('keeps the estimate among the tags, in 0-9 whatever the language', () => {
      arabic();
      expect(withEstimate('design, est:30', 45)).toBe('design, est:45');
      expect(estimateMinutes({ tags: 'design, est:45' })).toBe(45);
      expect(visibleTags('design, est:45')).toEqual(['design']);
    });
  });

  describe('in Arabic', () => {
    it('writes hours and minutes with their Arabic letters, in the digits chosen', () => {
      arabic();
      expect(formatEstimate(45)).toBe('٤٥ د');
      expect(formatEstimate(75)).toBe('١ س ١٥ د');
      expect(formatEstimate(120)).toBe('٢ س');
      expect(formatDuration(285)).toBe('٤ س ٤٥ د');
      expect(formatDuration(0)).toBe('٠ د');

      arabic('latn');
      expect(formatEstimate(75)).toBe('1 س 15 د');
      expect(formatDuration(30)).toBe('30 د');
    });

    it('reads Arabic digits and Arabic words, and still reads English', () => {
      arabic();
      expect(parseEstimate('٩٠')).toBe(90);
      expect(parseEstimate('٣٠ د')).toBe(30);
      expect(parseEstimate('٣٠د')).toBe(30);
      expect(parseEstimate('٤٥ دقيقة')).toBe(45);
      expect(parseEstimate('١٠ دقائق')).toBe(10);
      expect(parseEstimate('ساعة')).toBe(60);
      expect(parseEstimate('ساعتين')).toBe(120);
      expect(parseEstimate('ساعتان')).toBe(120);
      expect(parseEstimate('٣ ساعات')).toBe(180);
      expect(parseEstimate('١ س ٣٠ د')).toBe(90);
      expect(parseEstimate('ساعة ونصف')).toBe(90);
      expect(parseEstimate('ساعة وربع')).toBe(75);
      expect(parseEstimate('ساعة و٢٠ دقيقة')).toBe(80);
      expect(parseEstimate('نصف ساعة')).toBe(30);
      expect(parseEstimate('ربع ساعة')).toBe(15);
      expect(parseEstimate('١٫٥ س')).toBe(90);
      expect(parseEstimate('~٢٠ د')).toBe(20);
      expect(parseEstimate('1h 30m')).toBe(90);
      expect(parseEstimate('٣٠m')).toBe(30);

      expect(parseEstimate('ونصف')).toBeNull();
      expect(parseEstimate('قريبًا')).toBeNull();
    });

    it('reads Arabic also while the interface is English', () => {
      expect(parseEstimate('٤٥ دقيقة')).toBe(45);
      expect(parseEstimate('ساعة ونصف')).toBe(90);
    });
  });
});

describe('reminder labels', () => {
  afterEach(() => useLanguageForTests('en'));

  it('says how long before, in English', () => {
    expect(durationLabel(90)).toBe('1 hour 30 minutes');
    expect(durationLabel(1440)).toBe('1 day');
    expect(durationLabel(11520)).toBe('1 week 1 day');
    expect(durationLabel(0)).toBe('0 minutes');

    expect(reminderLabel(0)).toBe('When it starts');
    expect(reminderLabel(0, 'Task')).toBe('When it is due');
    expect(reminderLabel(15)).toBe('15 minutes before');
    expect(reminderLabel(60)).toBe('1 hour before');
    expect(reminderLabel(90)).toBe('1 hour 30 minutes before');
    expect(reminderLabel(1440)).toBe('1 day before');
  });

  it('says it in Arabic, with the forms Arabic counts in', () => {
    arabic();
    expect(durationLabel(1)).toBe('دقيقة واحدة');
    expect(durationLabel(2)).toBe('دقيقتان');
    expect(durationLabel(5)).toBe('٥ دقائق');
    expect(durationLabel(15)).toBe('١٥ دقيقة');
    expect(durationLabel(90)).toBe('ساعة واحدة و٣٠ دقيقة');
    expect(durationLabel(1440)).toBe('يوم واحد');

    expect(reminderLabel(0)).toBe('عند البدء');
    expect(reminderLabel(0, 'Task')).toBe('عند الاستحقاق');
    expect(reminderLabel(2)).toBe('قبل دقيقتين');
    expect(reminderLabel(5)).toBe('قبل ٥ دقائق');
    expect(reminderLabel(15)).toBe('قبل ١٥ دقيقة');
    expect(reminderLabel(60)).toBe('قبل ساعة');
    expect(reminderLabel(120)).toBe('قبل ساعتين');
    expect(reminderLabel(1440)).toBe('قبل يوم');
    expect(reminderLabel(90)).toBe('قبل ساعة واحدة و٣٠ دقيقة');

    arabic('latn');
    expect(reminderLabel(15)).toBe('قبل 15 دقيقة');
  });
});
