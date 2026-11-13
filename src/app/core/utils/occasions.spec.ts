import { missingTranslations, useLanguageForTests } from '../i18n/i18n';
import { AR_COMMON, AR_COMMON_PLURALS } from '../i18n/ar/common';
import { AR_CORE, AR_CORE_PLURALS } from '../i18n/ar/core';
import {
  OCCASION_COUNTRIES, Occasion, OccasionQuery, countryName, hasHolidays, isMuslimMajority, occasionDetail,
  occasionKindLabel, occasionSummary, occasionsBetween, occasionsByDay, orthodoxEaster, westernEaster
} from './occasions';

const query = (country: string | null, hijriLayer = false, fields: Partial<OccasionQuery> = {}): OccasionQuery =>
  ({ country, hijriLayer, hijriCalendar: 'islamic-umalqura', ...fields });

const year = (value: number, q: OccasionQuery) => occasionsBetween(`${value}-01-01`, `${value}-12-31`, q);
const named = (list: Occasion[], name: string) => list.filter(occasion => occasion.name === name);
const dateOf = (list: Occasion[], name: string) => named(list, name).map(occasion => occasion.date).join();

describe('occasions', () => {
  describe('Easter', () => {
    it('finds Easter Sunday of the Western churches', () => {
      expect(westernEaster(2024)).toEqual({ month: 3, day: 31 });
      expect(westernEaster(2025)).toEqual({ month: 4, day: 20 });
      expect(westernEaster(2026)).toEqual({ month: 4, day: 5 });
      expect(westernEaster(2027)).toEqual({ month: 3, day: 28 });
    });

    it('finds Easter Sunday of the Orthodox and Coptic churches', () => {
      expect(orthodoxEaster(2024)).toEqual({ month: 5, day: 5 });
      expect(orthodoxEaster(2025)).toEqual({ month: 4, day: 20 });
      expect(orthodoxEaster(2026)).toEqual({ month: 4, day: 12 });
      expect(orthodoxEaster(2027)).toEqual({ month: 5, day: 2 });
    });
  });

  describe('the Hijri calendar', () => {
    const list = year(2026, query(null, true));

    it('lists the ten occasions of a year from the calendar, not from a table of dates', () => {
      expect(list.map(occasion => occasion.name)).toEqual([
        'Isra and Mi’raj', 'Mid-Sha’ban', 'First day of Ramadan', 'Laylat al-Qadr', 'Eid al-Fitr',
        'Day of Arafah', 'Eid al-Adha', 'Islamic New Year', 'Ashura', 'The Prophet’s Birthday'
      ]);
      expect(dateOf(list, 'First day of Ramadan')).toBe('2026-02-18');
      expect(dateOf(list, 'Eid al-Fitr')).toBe('2026-03-20');
      expect(dateOf(list, 'Day of Arafah')).toBe('2026-05-26');
      expect(dateOf(list, 'Eid al-Adha')).toBe('2026-05-27');
      expect(dateOf(list, 'Islamic New Year')).toBe('2026-06-16');
    });

    it('marks every one as an estimate, and gives the Eids their days', () => {
      expect(list.every(occasion => occasion.mayVary && occasion.country === 'Islamic')).toBeTrue();
      expect(named(list, 'Eid al-Fitr')[0].days).toBe(3);
      expect(named(list, 'Eid al-Adha')[0].days).toBe(4);
      expect(list.every(occasion => occasion.kind === 'observance' && occasion.holidayIn === null)).toBeTrue();
    });

    it('names an occasion by its Hijri year, so the id stays the same wherever it is drawn', () => {
      expect(named(list, 'Eid al-Fitr')[0].id).toBe('islamic:eid-al-fitr:1447');
      expect(named(list, 'Islamic New Year')[0].id).toBe('islamic:new-year:1448');
    });

    it('follows the Hijri calendar the user chose', () => {
      const civil = year(2026, query(null, true, { hijriCalendar: 'islamic-civil' }));
      expect(dateOf(civil, 'Islamic New Year')).toBe('2026-06-17');
    });

    it('works for any year', () => {
      const far = year(2041, query(null, true));
      expect(far.length >= 10).toBeTrue();
      expect(named(far, 'Eid al-Fitr').length).toBe(1);
    });
  });

  describe('who sees the Islamic occasions', () => {
    it('shows nothing for an unknown country without the Hijri layer', () => {
      expect(year(2026, query(null)).length).toBe(0);
    });

    it('shows them as observances in a country that does not keep them, when the Hijri layer is on', () => {
      expect(named(year(2026, query('GB')), 'Eid al-Fitr').length).toBe(0);
      const eid = named(year(2026, query('GB', true)), 'Eid al-Fitr')[0];
      expect(eid.kind).toBe('observance');
    });

    it('shows them in a Muslim-majority country whether or not the layer is on', () => {
      expect(named(year(2026, query('EG')), 'Mid-Sha’ban').length).toBe(1);
      // No holidays are built in for Afghanistan; the occasions still show.
      expect(hasHolidays('AF')).toBeFalse();
      expect(isMuslimMajority('AF')).toBeTrue();
      expect(year(2026, query('AF')).length).toBe(10);
    });

    it('makes them public holidays where the country gives the day off', () => {
      const egypt = year(2027, query('EG'));
      const eid = named(egypt, 'Eid al-Fitr')[0];
      expect(eid.date).toBe('2027-03-09');
      expect(eid.kind).toBe('holiday');
      expect(eid.holidayIn).toBe('EG');
      expect(eid.days).toBe(3);
      expect(eid.mayVary).toBeTrue();
      expect(named(egypt, 'Ashura')[0].kind).toBe('observance');
    });

    it('lists only the public ones in a country that is not Muslim-majority', () => {
      const singapore = year(2027, query('SG'));
      expect(named(singapore, 'Eid al-Fitr')[0].kind).toBe('holiday');
      expect(named(singapore, 'Mid-Sha’ban').length).toBe(0);
    });
  });

  describe('national holidays', () => {
    it('has the 26 countries the calendar promises, and names them', () => {
      const codes = OCCASION_COUNTRIES.map(country => country.code);
      for (const code of ['EG', 'SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'JO', 'LB', 'IQ', 'PS', 'SY', 'MA', 'DZ', 'TN',
        'LY', 'SD', 'TR', 'PK', 'ID', 'MY', 'GB', 'US', 'CA', 'DE', 'FR']) {
        expect(codes.includes(code)).toBeTrue();
      }
      expect(countryName('EG')).toBe('Egypt');
      expect(countryName('PS')).toBe('Palestine');
    });

    it('places fixed dates and days counted from Orthodox Easter (Egypt)', () => {
      const egypt = year(2027, query('EG'));
      expect(dateOf(egypt, 'Coptic Christmas')).toBe('2027-01-07');
      expect(dateOf(egypt, 'Sinai Liberation Day')).toBe('2027-04-25');
      expect(dateOf(egypt, 'Sham El-Nessim')).toBe('2027-05-03');
      expect(named(egypt, 'Coptic Easter')[0].kind).toBe('observance');
    });

    it('places the nth weekday of a month (United States)', () => {
      const us = year(2026, query('US'));
      expect(dateOf(us, 'Martin Luther King Jr. Day')).toBe('2026-01-19');
      expect(dateOf(us, 'Memorial Day')).toBe('2026-05-25');
      expect(dateOf(us, 'Thanksgiving')).toBe('2026-11-26');
    });

    it('keeps a weekend holiday on the nearest working day (United States)', () => {
      const us = year(2027, query('US'));
      expect(dateOf(us, 'Independence Day')).toBe('2027-07-04');
      expect(dateOf(us, 'Independence Day (observed)')).toBe('2027-07-05');
      // New Year's Day 2028 is a Saturday: it is kept on the last day of 2027.
      expect(dateOf(us, 'New Year’s Day (observed)')).toBe('2027-12-31');
      expect(named(year(2028, query('US')), 'New Year’s Day (observed)').length).toBe(0);
    });

    it('places days counted from Western Easter and gives substitute days (United Kingdom)', () => {
      const uk = year(2027, query('GB'));
      expect(dateOf(uk, 'Good Friday')).toBe('2027-03-26');
      expect(dateOf(uk, 'Easter Monday')).toBe('2027-03-29');
      expect(dateOf(uk, 'Spring bank holiday')).toBe('2027-05-31');
      expect(dateOf(uk, 'Christmas Day (substitute day)')).toBe('2027-12-27');
      expect(dateOf(uk, 'Boxing Day (substitute day)')).toBe('2027-12-28');
    });

    it('places "the Monday before 25 May" (Canada)', () => {
      expect(dateOf(year(2026, query('CA')), 'Victoria Day')).toBe('2026-05-18');
      expect(dateOf(year(2027, query('CA')), 'Victoria Day')).toBe('2027-05-24');
    });

    it('reads other calendars: Nowruz, Rosh Hashanah, and a published Chinese New Year', () => {
      expect(dateOf(year(2027, query('IR')), 'Nowruz')).toBe('2027-03-21');
      expect(dateOf(year(2026, query('IL')), 'Rosh Hashanah')).toBe('2026-09-12');
      expect(dateOf(year(2027, query('SG')), 'Chinese New Year')).toBe('2027-02-06');
    });

    it('gives Japan its equinoxes, substitute days and the day between two holidays', () => {
      const japan = year(2026, query('JP'));
      expect(dateOf(japan, 'Vernal Equinox Day')).toBe('2026-03-20');
      expect(dateOf(japan, 'Constitution Memorial Day (substitute day)')).toBe('2026-05-06');
      expect(dateOf(japan, 'Citizens’ Holiday')).toBe('2026-09-22');
    });

    it('applies a rule only in the years it holds', () => {
      expect(named(year(2020, query('US')), 'Juneteenth').length).toBe(0);
      expect(named(year(2021, query('US')), 'Juneteenth').length).toBe(1);
      expect(dateOf(year(2024, query('OM')), 'National Day')).toBe('2024-11-18');
      expect(dateOf(year(2026, query('OM')), 'National Day')).toBe('2026-11-20');
    });

    it('builds every country for sixteen years with ids that never repeat', () => {
      for (const { code } of OCCASION_COUNTRIES) {
        for (let value = 2020; value <= 2035; value++) {
          const list = year(value, query(code, true));
          expect(list.length > 0).toBeTrue();
          expect(new Set(list.map(occasion => occasion.id)).size).toBe(list.length);
          expect(list.every(occasion => /^\d{4}-\d{2}-\d{2}$/.test(occasion.date) && occasion.days >= 1)).toBeTrue();
        }
      }
    });
  });

  describe('ranges', () => {
    it('returns what touches the range, in date order, public holidays first on a shared day', () => {
      const week = occasionsBetween('2027-07-04', '2027-07-10', query('US'));
      expect(week.map(occasion => occasion.name)).toEqual(['Independence Day', 'Independence Day (observed)']);
    });

    it('keeps an occasion that started before the range', () => {
      const days = occasionsBetween('2027-03-10', '2027-03-10', query('EG'));
      expect(days.map(occasion => occasion.name)).toEqual(['Eid al-Fitr']);
      expect(days[0].date).toBe('2027-03-09');
    });

    it('crosses the turn of a year', () => {
      const russia = occasionsBetween('2026-12-30', '2027-01-03', query('RU'));
      expect(russia.map(occasion => occasion.date)).toEqual(['2027-01-01']);
      expect(russia[0].days).toBe(8);
    });

    it('answers nothing for a range that is not one', () => {
      expect(occasionsBetween('2027-03-10', '2027-03-01', query('EG')).length).toBe(0);
      expect(occasionsBetween('soon', '2027-03-01', query('EG')).length).toBe(0);
    });

    it('spreads an occasion over its days, numbered', () => {
      const byDay = occasionsByDay('2027-03-07', '2027-03-13', query('EG'));
      expect([...byDay.keys()]).toEqual(['2027-03-09', '2027-03-10', '2027-03-11']);
      expect(byDay.get('2027-03-10')![0].dayNumber).toBe(2);
      // Only the days inside the range.
      expect([...occasionsByDay('2027-03-11', '2027-03-20', query('EG')).keys()]).toEqual(['2027-03-11']);
    });
  });

  describe('what a tooltip says', () => {
    const egypt = year(2027, query('EG'));

    it('names the kind and the country', () => {
      expect(occasionKindLabel(named(egypt, 'Sham El-Nessim')[0])).toBe('Public holiday in Egypt');
      expect(occasionKindLabel(named(egypt, 'Coptic Easter')[0])).toBe('Observance in Egypt');
      expect(occasionKindLabel(named(egypt, 'Ashura')[0])).toBe('Observance');
      expect(occasionKindLabel(named(year(2027, query('US')), 'Independence Day')[0]))
        .toBe('Public holiday in the United States');
    });

    it('says when the date may vary, and which day of several it is', () => {
      expect(occasionSummary(named(egypt, 'Eid al-Fitr')[0], 2))
        .toBe('Eid al-Fitr · Public holiday in Egypt · Islamic calendar · Day 2 of 3 · Date may vary');
      expect(occasionSummary(named(egypt, 'Sham El-Nessim')[0])).toBe('Sham El-Nessim · Public holiday in Egypt');
      expect(occasionSummary(named(egypt, 'Laylat al-Qadr')[0]))
        .toBe('Laylat al-Qadr · Observance · Islamic calendar · Begins at sunset the evening before · Date may vary');
    });

    it('counts the days of an occasion that is not given a day number', () => {
      expect(occasionDetail(named(egypt, 'Eid al-Fitr')[0])).toBe('Public holiday in Egypt · Islamic calendar · 3 days · Date may vary');
    });
  });

  describe('in Arabic', () => {
    const arabic = (numerals: 'arab' | 'latn' = 'arab') => useLanguageForTests('ar', {
      dictionary: { ...AR_COMMON, ...AR_CORE }, plurals: { ...AR_COMMON_PLURALS, ...AR_CORE_PLURALS }, numerals
    });
    const byId = (list: Occasion[], id: string) => list.find(occasion => occasion.id === id)!;

    afterEach(() => useLanguageForTests('en'));

    it('names the occasions of the Hijri calendar as Arabic speakers do, with the same ids and dates', () => {
      arabic();
      const list = year(2026, query(null, true));

      expect(list.map(occasion => occasion.name)).toEqual([
        'الإسراء والمعراج', 'ليلة النصف من شعبان', 'أول رمضان', 'ليلة القدر', 'عيد الفطر',
        'يوم عرفة', 'عيد الأضحى', 'رأس السنة الهجرية', 'عاشوراء', 'المولد النبوي'
      ]);
      expect(byId(list, 'islamic:eid-al-fitr:1447').date).toBe('2026-03-20');
      expect(byId(list, 'islamic:new-year:1448').name).toBe('رأس السنة الهجرية');
    });

    it('names national holidays in Arabic, and a day in lieu', () => {
      arabic();
      const egypt = year(2027, query('EG'));
      expect(byId(egypt, 'EG:sham-el-nessim:2027').name).toBe('شم النسيم');
      expect(byId(egypt, 'EG:labour-day:2027').name).toBe('عيد العمال');
      expect(byId(egypt, 'EG:30-june-revolution-day:2027').name).toBe('ثورة ٣٠ يونيو');
      expect(byId(year(2026, query('SA')), 'SA:saudi-national-day:2026').name).toBe('اليوم الوطني السعودي');
      expect(byId(year(2027, query('US')), 'US:independence-day-observed:2027').name).toBe('عيد الاستقلال (عطلة تعويضية)');
      expect(byId(year(2027, query('GB')), 'GB:christmas-day-substitute-day:2027').name).toBe('عيد الميلاد (يوم تعويضي)');

      arabic('latn');
      expect(byId(year(2027, query('EG')), 'EG:30-june-revolution-day:2027').name).toBe('ثورة 30 يونيو');
    });

    it('has an Arabic name for every occasion of every country', () => {
      arabic();
      const untranslated = new Set<string>();
      for (const { code } of OCCASION_COUNTRIES) {
        for (let value = 2020; value <= 2035; value++) {
          for (const occasion of year(value, query(code, true))) {
            if (/[A-Za-z]/.test(occasionSummary(occasion, 1))) untranslated.add(`${code}: ${occasion.name}`);
          }
        }
      }

      expect([...untranslated]).toEqual([]);
      expect(missingTranslations()).toEqual([]);
    });

    it('names the countries in Arabic', () => {
      arabic();
      expect(countryName('EG')).toBe('مصر');
      expect(countryName('PS')).toBe('فلسطين');
      expect(countryName('SA')).toContain('السعودية');
      // A country without built-in holidays is named by the browser too.
      expect(countryName('KR')).toBe('كوريا الجنوبية');
    });

    it('says the kind, the country and the days in Arabic', () => {
      arabic();
      const egypt = year(2027, query('EG'));
      const eid = byId(egypt, 'islamic:eid-al-fitr:1448');
      const mayVary = AR_CORE['Date may vary'];

      expect(occasionKindLabel(byId(egypt, 'EG:sham-el-nessim:2027'))).toBe('عطلة رسمية في مصر');
      expect(occasionKindLabel(byId(egypt, 'EG:coptic-easter:2027'))).toBe('مناسبة في مصر');
      expect(occasionKindLabel(byId(egypt, 'islamic:ashura:1449'))).toBe('مناسبة');
      expect(occasionSummary(eid, 2)).toBe(`عيد الفطر · عطلة رسمية في مصر · التقويم الهجري · اليوم ٢ من ٣ · ${mayVary}`);
      expect(occasionDetail(eid)).toBe(`عطلة رسمية في مصر · التقويم الهجري · ٣ أيام · ${mayVary}`);
      expect(occasionDetail(byId(egypt, 'islamic:laylat-al-qadr:1448')))
        .toBe(`مناسبة · التقويم الهجري · تبدأ مع غروب شمس اليوم السابق · ${mayVary}`);
    });
  });
});
