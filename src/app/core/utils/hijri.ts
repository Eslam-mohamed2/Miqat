/**
 * Hijri dates, from the browser's own calendar data (no server involved).
 *
 * The design shows them as an optional layer: "2 Jumada II" under each day and
 * "Week 46 · Jumada I – II 1448" under the month (Settings → Calendar and time).
 *
 * In Arabic the months carry their Arabic names ("جمادى الآخرة") and the numbers
 * the digits chosen in Settings.
 */
import { isArabic, t } from '../i18n/i18n';

/** The Hijri calendars `Intl` knows. Umm al-Qura is the one Saudi Arabia publishes. */
export type HijriCalendar = 'islamic-umalqura' | 'islamic-civil' | 'islamic-tbla';

/** `label` is in the interface language. */
export const HIJRI_CALENDARS: { value: HijriCalendar; label: string }[] = [
  { value: 'islamic-umalqura', get label() { return t('Umm al-Qura'); } },
  { value: 'islamic-civil', get label() { return t('Civil (tabular)'); } },
  { value: 'islamic-tbla', get label() { return t('Astronomical (tabular)'); } }
];

export interface HijriDate {
  day: number;
  /** "Jumada II", in Arabic "جمادى الآخرة". */
  month: string;
  year: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** `names` is the language the month is named in; the numbers are always read as 0-9. */
function formatter(calendar: HijriCalendar, zone: string, names: 'en' | 'ar'): Intl.DateTimeFormat {
  const key = `${names}|${calendar}|${zone}`;
  let found = formatters.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(`${names}-u-ca-${calendar}-nu-latn`, {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: zone
    });
    formatters.set(key, found);
  }
  return found;
}

/**
 * The Hijri date of an instant, as it falls in the given time zone. `day` and
 * `year` are numbers: draw them with `num()`, or use the label functions below.
 */
export function hijriDate(date: Date, zone: string, calendar: HijriCalendar = 'islamic-umalqura'): HijriDate {
  const parts = formatter(calendar, zone, isArabic() ? 'ar' : 'en').formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return {
    day: Number(part('day')),
    month: part('month'),
    year: Number(part('year'))
  };
}

/** "2 Jumada II", in Arabic "٢ جمادى الآخرة". */
export function hijriDayLabel(date: Date, zone: string, calendar?: HijriCalendar): string {
  const h = hijriDate(date, zone, calendar);
  return t('{day} {month}@@hijri', { day: h.day, month: h.month });
}

/** "2 Jumada II 1448", in Arabic "٢ جمادى الآخرة ١٤٤٨ هـ". */
export function hijriFullLabel(date: Date, zone: string, calendar?: HijriCalendar): string {
  const h = hijriDate(date, zone, calendar);
  return t('{day} {month} {year}@@hijri', { day: h.day, month: h.month, year: h.year });
}

/**
 * The Hijri month or months a range of days covers: "Jumada II 1448", or
 * "Jumada I – II 1448" when the range crosses into the next month (the shared
 * first word is not repeated, as in the design). Arabic names both months in
 * full: "جمادى الأولى – جمادى الآخرة ١٤٤٨ هـ".
 */
export function hijriRangeLabel(from: Date, to: Date, zone: string, calendar?: HijriCalendar): string {
  const a = hijriDate(from, zone, calendar);
  const b = hijriDate(to, zone, calendar);
  if (a.month === b.month && a.year === b.year) return t('{month} {year}@@hijri', { month: a.month, year: a.year });
  if (a.year !== b.year) {
    return t('{from} {fromYear} – {to} {toYear}@@hijri', { from: a.month, fromYear: a.year, to: b.month, toYear: b.year });
  }

  let second = b.month;
  if (!isArabic()) {
    const [aName, aNumber] = a.month.split(' ');
    const [bName, bNumber] = b.month.split(' ');
    if (aNumber && bNumber && aName === bName) second = bNumber;
  }
  return t('{from} – {to} {year}@@hijri', { from: a.month, to: second, year: a.year });
}
