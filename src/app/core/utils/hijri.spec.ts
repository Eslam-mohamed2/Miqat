import { useLanguageForTests } from '../i18n/i18n';
import { AR_COMMON } from '../i18n/ar/common';
import { AR_CORE } from '../i18n/ar/core';
import { HIJRI_CALENDARS, hijriDate, hijriDayLabel, hijriFullLabel, hijriRangeLabel } from './hijri';
import { PRAYER_METHODS, placeForZone, prayerLabel } from './prayer-times';

const ZONE = 'Africa/Cairo';
const at = (day: string) => new Date(`${day}T10:00:00Z`);

describe('Hijri labels', () => {
  // 12 November 2026 is 2 Jumada II 1448 in Umm al-Qura.
  const day = at('2026-11-12');

  afterEach(() => useLanguageForTests('en'));

  describe('in English', () => {
    it('reads the date from the calendar that was chosen', () => {
      expect(hijriDate(day, ZONE)).toEqual({ day: 2, month: 'Jumada II', year: 1448 });
      expect(hijriDate(day, ZONE, 'islamic-civil').day).toBe(1);
    });

    it('writes the day, the full date and a range', () => {
      expect(hijriDayLabel(day, ZONE)).toBe('2 Jumada II');
      expect(hijriFullLabel(day, ZONE)).toBe('2 Jumada II 1448');
      expect(hijriRangeLabel(at('2026-11-11'), at('2026-11-14'), ZONE)).toBe('Jumada II 1448');
    });

    it('does not repeat the shared first word of two months, and names both years when they differ', () => {
      expect(hijriRangeLabel(at('2026-11-08'), at('2026-11-14'), ZONE)).toBe('Jumada I – II 1448');
      expect(hijriRangeLabel(at('2026-12-08'), at('2026-12-12'), ZONE)).toBe('Jumada II – Rajab 1448');
      expect(hijriRangeLabel(at('2026-06-14'), at('2026-06-18'), ZONE)).toMatch(/1447 – Muharram 1448$/);
    });

    it('names the calendars and the prayer methods', () => {
      expect(HIJRI_CALENDARS.map(calendar => calendar.label)).toEqual(['Umm al-Qura', 'Civil (tabular)', 'Astronomical (tabular)']);
      expect(PRAYER_METHODS.Egyptian.label).toBe('Egyptian General Authority');
      expect(placeForZone(ZONE)?.city).toBe('Cairo');
      expect(prayerLabel('Fajr')).toBe('Fajr');
    });
  });

  describe('in Arabic', () => {
    const dictionary = { ...AR_COMMON, ...AR_CORE };

    it('names the months in Arabic and keeps the numbers as numbers', () => {
      useLanguageForTests('ar', { dictionary, numerals: 'arab' });

      expect(hijriDate(day, ZONE)).toEqual({ day: 2, month: 'جمادى الآخرة', year: 1448 });
    });

    it('writes the labels in Arabic digits', () => {
      useLanguageForTests('ar', { dictionary, numerals: 'arab' });

      expect(hijriDayLabel(day, ZONE)).toBe('٢ جمادى الآخرة');
      expect(hijriFullLabel(day, ZONE)).toBe('٢ جمادى الآخرة ١٤٤٨ هـ');
      expect(hijriRangeLabel(at('2026-11-11'), at('2026-11-14'), ZONE)).toBe('جمادى الآخرة ١٤٤٨ هـ');
      expect(hijriRangeLabel(at('2026-11-08'), at('2026-11-14'), ZONE)).toBe('جمادى الأولى – جمادى الآخرة ١٤٤٨ هـ');
      expect(hijriRangeLabel(at('2026-06-14'), at('2026-06-18'), ZONE)).toBe('ذو الحجة ١٤٤٧ هـ – محرم ١٤٤٨ هـ');
    });

    it('writes them in 0-9 when those digits were chosen', () => {
      useLanguageForTests('ar', { dictionary, numerals: 'latn' });

      expect(hijriDayLabel(day, ZONE)).toBe('2 جمادى الآخرة');
      expect(hijriFullLabel(day, ZONE)).toBe('2 جمادى الآخرة 1448 هـ');
    });

    it('names the calendars, the prayers, their methods and the city', () => {
      useLanguageForTests('ar', { dictionary });

      expect(HIJRI_CALENDARS.map(calendar => calendar.label)).toEqual(['أم القرى', 'المدني (حسابي)', 'الفلكي (حسابي)']);
      expect((['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const).map(prayerLabel))
        .toEqual(['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء']);
      expect(PRAYER_METHODS.UmmAlQura.label).toBe('أم القرى، مكة المكرمة');
      expect(Object.values(PRAYER_METHODS).every(method => !/[A-Za-z]/.test(method.label))).toBeTrue();
      expect(placeForZone(ZONE)?.city).toBe('القاهرة');
      expect(placeForZone('Asia/Qatar')?.city).toBe('الدوحة');
    });
  });
});
