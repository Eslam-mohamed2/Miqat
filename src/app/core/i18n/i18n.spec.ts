import { AR, AR_PARTS, AR_PLURAL_PARTS } from './ar';
import {
  currentNumerals, direction, formatNumber, isolate, latinDigits, locale, missingTranslations, num, t, tCount,
  useLanguageForTests
} from './i18n';

describe('i18n', () => {
  afterEach(() => useLanguageForTests('en'));

  describe('English', () => {
    beforeEach(() => useLanguageForTests('en'));

    it('shows the sentence as written', () => {
      expect(t('Nothing coming up')).toBe('Nothing coming up');
    });

    it('fills the gaps', () => {
      expect(t('In {n} min', { n: 5 })).toBe('In 5 min');
      expect(t('{name} invited you', { name: 'Sarah' })).toBe('Sarah invited you');
    });

    it('never shows the context of a word', () => {
      expect(t('Open@@verb')).toBe('Open');
    });

    it('counts with one and other', () => {
      expect(tCount(1, '{n} task', '{n} tasks')).toBe('1 task');
      expect(tCount(4, '{n} task', '{n} tasks')).toBe('4 tasks');
      expect(tCount(0, '{n} task', '{n} tasks')).toBe('0 tasks');
    });

    it('keeps 0-9 and reads left to right', () => {
      expect(num(2026)).toBe('2026');
      expect(num('09:30')).toBe('09:30');
      expect(currentNumerals()).toBe('latn');
      expect(direction()).toBe('ltr');
      expect(locale()).toBe('en-US');
    });
  });

  describe('Arabic', () => {
    const dictionary = { 'Save': 'حفظ', 'In {n} min': 'بعد {n} د', 'Open@@verb': 'فتح' };
    const plurals = {
      '{n} tasks': { zero: 'لا مهام', one: 'مهمة واحدة', two: 'مهمتان', few: '{n} مهام', many: '{n} مهمة', other: '{n} مهمة' }
    };

    it('looks the sentence up', () => {
      useLanguageForTests('ar', { dictionary });
      expect(t('Save')).toBe('حفظ');
      expect(t('Open@@verb')).toBe('فتح');
      expect(direction()).toBe('rtl');
    });

    it('falls back to English and remembers what was missing', () => {
      useLanguageForTests('ar', { dictionary });
      expect(t('Not translated')).toBe('Not translated');
      expect(t('Close@@verb')).toBe('Close');
      expect(missingTranslations()).toEqual(['Close@@verb', 'Not translated']);
    });

    it('draws numbers in the chosen digits', () => {
      useLanguageForTests('ar', { dictionary, numerals: 'arab' });
      expect(t('In {n} min', { n: 15 })).toBe('بعد ١٥ د');
      expect(num('09:30')).toBe('٠٩:٣٠');
      expect(locale()).toBe('ar-u-ca-gregory-nu-arab');
      expect(formatNumber(1234)).toContain('١');

      useLanguageForTests('ar', { dictionary, numerals: 'latn' });
      expect(t('In {n} min', { n: 15 })).toBe('بعد 15 د');
      expect(num(2026)).toBe('2026');
      expect(locale()).toBe('ar-u-ca-gregory-nu-latn');
    });

    it('keeps Latin text in a gap in its own direction', () => {
      useLanguageForTests('ar', { dictionary: { '{name} invited you': 'دعاك {name}' } });
      expect(t('{name} invited you', { name: 'Sarah' })).toBe('دعاك ⁨Sarah⁩');
      expect(t('{name} invited you', { name: 'سارة' })).toBe('دعاك سارة');
      expect(t('{name} invited you', { name: isolate('Sarah') })).toBe('دعاك ⁨Sarah⁩');

      useLanguageForTests('en');
      expect(t('{name} invited you', { name: 'Sarah' })).toBe('Sarah invited you');
      expect(isolate('Sarah')).toBe('Sarah');
    });

    it('picks the Arabic plural form', () => {
      useLanguageForTests('ar', { dictionary, plurals, numerals: 'latn' });
      const count = (n: number) => tCount(n, '{n} task', '{n} tasks');
      expect(count(0)).toBe('لا مهام');
      expect(count(1)).toBe('مهمة واحدة');
      expect(count(2)).toBe('مهمتان');
      expect(count(5)).toBe('5 مهام');
      expect(count(11)).toBe('11 مهمة');
      expect(count(100)).toBe('100 مهمة');
    });

    it('keeps the Gregorian calendar', () => {
      useLanguageForTests('ar', { numerals: 'latn' });
      const year = new Intl.DateTimeFormat(locale(), { year: 'numeric', timeZone: 'UTC' })
        .format(new Date(Date.UTC(2026, 10, 13)));
      expect(year).toContain('2026');
    });
  });

  it('reads digits typed in Arabic', () => {
    expect(latinDigits('٠٩:٣٠')).toBe('09:30');
    expect(latinDigits('۱۲')).toBe('12');
    expect(latinDigits('12')).toBe('12');
  });

  describe('the Arabic dictionary', () => {
    it('never translates one sentence two ways', () => {
      const seen = new Map<string, { part: string; arabic: string }>();
      const clashes: string[] = [];
      for (const [part, entries] of Object.entries(AR_PARTS)) {
        for (const [english, arabic] of Object.entries(entries)) {
          const first = seen.get(english);
          if (!first) seen.set(english, { part, arabic });
          else if (first.arabic !== arabic) clashes.push(`"${english}": ${first.part} says "${first.arabic}", ${part} says "${arabic}"`);
        }
      }
      expect(clashes).toEqual([]);
    });

    it('never counts one phrase two ways', () => {
      const seen = new Map<string, { part: string; forms: string }>();
      const clashes: string[] = [];
      for (const [part, entries] of Object.entries(AR_PLURAL_PARTS)) {
        for (const [english, forms] of Object.entries(entries)) {
          const text = JSON.stringify([forms.zero, forms.one, forms.two, forms.few, forms.many, forms.other]);
          const first = seen.get(english);
          if (!first) seen.set(english, { part, forms: text });
          else if (first.forms !== text) clashes.push(`"${english}": ${first.part} and ${part} disagree`);
        }
      }
      expect(clashes).toEqual([]);
    });

    it('keeps every gap of the English sentence', () => {
      const broken: string[] = [];
      for (const [english, arabic] of Object.entries(AR)) {
        const gaps = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(',');
        if (gaps(english) !== gaps(arabic)) broken.push(english);
      }
      expect(broken).toEqual([]);
    });

    it('has no empty translation', () => {
      expect(Object.entries(AR).filter(([, arabic]) => !arabic.trim()).map(([english]) => english)).toEqual([]);
    });

    it('gives every counted phrase the forms Arabic needs', () => {
      const incomplete: string[] = [];
      for (const entries of Object.values(AR_PLURAL_PARTS)) {
        for (const [english, forms] of Object.entries(entries)) {
          if (!forms.other || !forms.one || !forms.two || !forms.few || !forms.many) incomplete.push(english);
        }
      }
      expect(incomplete).toEqual([]);
    });
  });
});
