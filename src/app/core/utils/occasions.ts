/**
 * Public holidays and special occasions of a range of days, for one country and
 * for the Hijri calendar the user chose. Everything is worked out here: fixed
 * dates, "the third Monday of January", days counted from Easter, and dates of
 * the Hijri, Chinese, Persian and Hebrew calendars read through `Intl`. No
 * network call is involved.
 *
 * Dates of the Hijri calendar are estimates until the moon is sighted, so those
 * occasions carry `mayVary`.
 *
 * The tables below are written in English. A name is put into the interface
 * language where an occasion is built, so `Occasion.name`, the notes, the kind
 * labels and the country names all read in Arabic when the interface does; the
 * ids never change.
 */
import { currentLanguage, locale, num, t, tCount } from '../i18n/i18n';
import { HijriCalendar } from './hijri';

export type OccasionKind = 'holiday' | 'observance';

export interface Occasion {
  /** Stable for one occasion of one year: "islamic:eid-al-fitr:1448", "US:independence-day:2027". */
  id: string;
  /** In the interface language. */
  name: string;
  /** Its first day, `yyyy-mm-dd`. */
  date: string;
  /** How many days it lasts. */
  days: number;
  /** A public holiday (a day off) or a day that is only marked. */
  kind: OccasionKind;
  /** ISO code of the country it belongs to, or 'Islamic' for the Hijri calendar's occasions. */
  country: string;
  /** ISO code of the country where it is a public holiday; null for an observance. */
  holidayIn: string | null;
  /** The date depends on the sighting of the moon, or is moved by a yearly decision. */
  mayVary: boolean;
  /** Something worth saying beside the name ("Begins at sunset the evening before"), in the interface language. */
  note?: string;
}

export interface OccasionQuery {
  /** ISO code of the country whose holidays to list; null when it is not known. */
  country: string | null;
  hijriCalendar: HijriCalendar;
  /** The Hijri layer is on: Islamic occasions show wherever the user lives. */
  hijriLayer: boolean;
}

export type IslamicKey =
  | 'new-year' | 'ashura' | 'mawlid' | 'isra-miraj' | 'mid-shaban' | 'ramadan' | 'laylat-al-qadr'
  | 'eid-al-fitr' | 'arafah' | 'eid-al-adha';

interface IslamicOccasion {
  key: IslamicKey;
  name: string;
  /** Hijri month (1-12) and day. */
  month: number;
  day: number;
  /** Days it is kept for where it is not a public holiday. */
  days: number;
  note?: string;
}

const EVENING = 'Begins at sunset the evening before';

const ISLAMIC: IslamicOccasion[] = [
  { key: 'new-year', name: 'Islamic New Year', month: 1, day: 1, days: 1 },
  { key: 'ashura', name: 'Ashura', month: 1, day: 10, days: 1 },
  { key: 'mawlid', name: 'The Prophet’s Birthday', month: 3, day: 12, days: 1 },
  { key: 'isra-miraj', name: 'Isra and Mi’raj', month: 7, day: 27, days: 1, note: EVENING },
  { key: 'mid-shaban', name: 'Mid-Sha’ban', month: 8, day: 15, days: 1, note: EVENING },
  { key: 'ramadan', name: 'First day of Ramadan', month: 9, day: 1, days: 1 },
  { key: 'laylat-al-qadr', name: 'Laylat al-Qadr', month: 9, day: 27, days: 1, note: EVENING },
  { key: 'eid-al-fitr', name: 'Eid al-Fitr', month: 10, day: 1, days: 3 },
  { key: 'arafah', name: 'Day of Arafah', month: 12, day: 9, days: 1 },
  { key: 'eid-al-adha', name: 'Eid al-Adha', month: 12, day: 10, days: 4 }
];

// ── Rules ───────────────────────────────────────────────────────────────────

type OtherCalendar = 'chinese' | 'persian' | 'hebrew';

interface RuleOptions {
  days?: number;
  /** 'holiday' unless said otherwise. */
  kind?: OccasionKind;
  /** First and last year the rule applies in. */
  from?: number;
  until?: number;
  mayVary?: boolean;
  note?: string;
  /** False for a holiday that gets no day in lieu when it falls on a weekend. */
  lieu?: boolean;
}

type RuleDate =
  | { type: 'fixed'; month: number; day: number }
  /** The nth (1-5, or -1 for the last) weekday (0 = Sunday) of a month. */
  | { type: 'nth'; month: number; weekday: number; n: number }
  /** The last weekday before a date ("the Monday before 25 May"). */
  | { type: 'before'; month: number; day: number; weekday: number }
  /** Days from Easter Sunday: Western, or Orthodox. */
  | { type: 'easter'; offset: number; orthodox: boolean }
  /** A date of the Hijri calendar the user chose. */
  | { type: 'hijri'; month: number; day: number }
  | { type: 'calendar'; calendar: OtherCalendar; month: string; day: number }
  /** Month and day by a formula or a published table; null for a year it does not cover. */
  | { type: 'calc'; find: (year: number) => [number, number] | null };

type Rule = RuleDate & RuleOptions & { name: string };

const SUN = 0, MON = 1, TUE = 2, THU = 4;

const fixed = (month: number, day: number, name: string, options: RuleOptions = {}): Rule =>
  ({ type: 'fixed', month, day, name, ...options });
const nth = (month: number, weekday: number, n: number, name: string, options: RuleOptions = {}): Rule =>
  ({ type: 'nth', month, weekday, n, name, ...options });
const before = (month: number, day: number, weekday: number, name: string, options: RuleOptions = {}): Rule =>
  ({ type: 'before', month, day, weekday, name, ...options });
const easter = (offset: number, name: string, options: RuleOptions = {}): Rule =>
  ({ type: 'easter', offset, orthodox: false, name, ...options });
const orthodox = (offset: number, name: string, options: RuleOptions = {}): Rule =>
  ({ type: 'easter', offset, orthodox: true, name, ...options });
const hijri = (month: number, day: number, name: string, options: RuleOptions = {}): Rule =>
  ({ type: 'hijri', month, day, name, mayVary: true, ...options });
const inCalendar = (
  calendar: OtherCalendar, month: string | number, day: number, name: string, options: RuleOptions = {}
): Rule => ({ type: 'calendar', calendar, month: String(month), day, name, ...options });
const calc = (find: (year: number) => [number, number] | null, name: string, options: RuleOptions = {}): Rule =>
  ({ type: 'calc', find, name, ...options });

const observance: RuleOptions = { kind: 'observance' };

/** How a country gives a day in lieu of a holiday that falls on a weekend. */
type Lieu =
  /** Saturday is kept on Friday and Sunday on Monday (United States). */
  | 'nearest'
  /** Saturday and Sunday move to the next working day that is not a holiday itself. */
  | 'weekend'
  /** Only Sunday moves. */
  | 'sunday';

interface Country {
  name: string;
  /** Islamic occasions that are public holidays there, with how many days off each is. */
  islamic?: Partial<Record<IslamicKey, number>>;
  lieu?: Lieu;
  rules: Rule[];
}

const NEW_YEAR = 'New Year’s Day';
const LABOUR = 'Labour Day';
const CHRISTMAS = 'Christmas Day';
const GOOD_FRIDAY = 'Good Friday';
const EASTER_MONDAY = 'Easter Monday';

/** Japan's equinox days; the formula holds from 1980 to 2099. */
const equinox = (base: number, month: number) => (year: number): [number, number] | null =>
  year < 1980 || year > 2099
    ? null
    : [month, Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))];

/**
 * Chinese New Year as published. `Intl`'s Chinese calendar is a day off in years
 * when the new moon falls close to midnight in Beijing (2027 and 2030), so it is
 * only asked for the years this table does not have.
 */
const CHINESE_NEW_YEAR: Record<number, [number, number]> = {
  2020: [1, 25], 2021: [2, 12], 2022: [2, 1], 2023: [1, 22], 2024: [2, 10], 2025: [1, 29], 2026: [2, 17],
  2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3], 2031: [1, 23], 2032: [2, 11], 2033: [1, 31],
  2034: [2, 19], 2035: [2, 8]
};

function chineseNewYear(year: number): [number, number] | null {
  const published = CHINESE_NEW_YEAR[year];
  if (published) return published;
  const found = yearInCalendar('chinese', year).get('1-1')?.[0];
  if (!found) return null;
  const date = new Date(found.at);
  return [date.getUTCMonth() + 1, date.getUTCDate()];
}

/** Matariki, as New Zealand's law lists it. */
const MATARIKI: Record<number, [number, number]> = {
  2022: [6, 24], 2023: [7, 14], 2024: [6, 28], 2025: [6, 20], 2026: [7, 10], 2027: [6, 25],
  2028: [7, 14], 2029: [7, 6], 2030: [6, 21]
};

/**
 * The countries with built-in holidays. National days only: a holiday of one
 * state or province is left out.
 */
const COUNTRIES: Record<string, Country> = {
  // ── Arab world ────────────────────────────────────────────────────────────
  EG: {
    name: 'Egypt',
    islamic: { 'new-year': 1, mawlid: 1, 'eid-al-fitr': 3, arafah: 1, 'eid-al-adha': 3 },
    rules: [
      fixed(1, 7, 'Coptic Christmas'),
      fixed(1, 25, 'Revolution Day and Police Day'),
      fixed(4, 25, 'Sinai Liberation Day'),
      fixed(5, 1, LABOUR),
      orthodox(0, 'Coptic Easter', observance),
      orthodox(1, 'Sham El-Nessim'),
      fixed(6, 30, '30 June Revolution Day'),
      fixed(7, 23, 'Revolution Day (23 July)'),
      fixed(10, 6, 'Armed Forces Day')
    ]
  },
  SA: {
    name: 'Saudi Arabia',
    islamic: { 'eid-al-fitr': 4, arafah: 1, 'eid-al-adha': 3 },
    rules: [
      fixed(2, 22, 'Founding Day', { from: 2022 }),
      fixed(3, 11, 'Flag Day', { ...observance, from: 2023 }),
      fixed(9, 23, 'Saudi National Day')
    ]
  },
  AE: {
    name: 'United Arab Emirates',
    islamic: { 'new-year': 1, mawlid: 1, 'eid-al-fitr': 3, arafah: 1, 'eid-al-adha': 3 },
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(11, 30, 'Commemoration Day', observance),
      fixed(12, 2, 'National Day (Eid Al Etihad)', { days: 2 })
    ]
  },
  KW: {
    name: 'Kuwait',
    islamic: { 'new-year': 1, mawlid: 1, 'isra-miraj': 1, 'eid-al-fitr': 3, arafah: 1, 'eid-al-adha': 3 },
    rules: [fixed(1, 1, NEW_YEAR), fixed(2, 25, 'National Day'), fixed(2, 26, 'Liberation Day')]
  },
  QA: {
    name: 'Qatar',
    islamic: { 'eid-al-fitr': 3, arafah: 1, 'eid-al-adha': 3 },
    rules: [nth(2, TUE, 2, 'National Sports Day'), fixed(12, 18, 'Qatar National Day')]
  },
  BH: {
    name: 'Bahrain',
    islamic: { 'new-year': 1, ashura: 1, mawlid: 1, 'eid-al-fitr': 3, arafah: 1, 'eid-al-adha': 3 },
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(5, 1, LABOUR),
      hijri(1, 9, 'Tasu’a'),
      fixed(12, 16, 'National Day', { days: 2 })
    ]
  },
  OM: {
    name: 'Oman',
    islamic: { 'new-year': 1, mawlid: 1, 'isra-miraj': 1, 'eid-al-fitr': 3, arafah: 1, 'eid-al-adha': 3 },
    rules: [
      fixed(1, 11, 'Sultan’s Accession Day', { from: 2021 }),
      fixed(11, 18, 'National Day', { days: 2, until: 2024 }),
      fixed(11, 20, 'National Day', { days: 2, from: 2025 })
    ]
  },
  JO: {
    name: 'Jordan',
    islamic: { 'new-year': 1, mawlid: 1, 'isra-miraj': 1, 'eid-al-fitr': 3, arafah: 1, 'eid-al-adha': 3 },
    rules: [fixed(1, 1, NEW_YEAR), fixed(5, 1, LABOUR), fixed(5, 25, 'Independence Day'), fixed(12, 25, CHRISTMAS)]
  },
  LB: {
    name: 'Lebanon',
    islamic: { 'new-year': 1, ashura: 1, mawlid: 1, 'eid-al-fitr': 2, 'eid-al-adha': 2 },
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(1, 6, 'Armenian Christmas'),
      fixed(2, 9, 'St Maroun’s Day'),
      fixed(2, 14, 'Rafik Hariri Memorial Day'),
      fixed(3, 25, 'Feast of the Annunciation'),
      easter(-2, GOOD_FRIDAY),
      easter(0, 'Easter Sunday', observance),
      orthodox(-2, 'Orthodox Good Friday'),
      orthodox(0, 'Orthodox Easter Sunday', observance),
      fixed(5, 1, LABOUR),
      fixed(5, 25, 'Resistance and Liberation Day'),
      fixed(8, 15, 'Assumption of Mary'),
      fixed(11, 22, 'Independence Day'),
      fixed(12, 25, CHRISTMAS)
    ]
  },
  IQ: {
    name: 'Iraq',
    islamic: { 'new-year': 1, ashura: 1, mawlid: 1, 'eid-al-fitr': 3, 'eid-al-adha': 4 },
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(1, 6, 'Army Day'),
      fixed(3, 21, 'Nowruz'),
      fixed(5, 1, LABOUR),
      fixed(7, 14, 'Republic Day'),
      fixed(10, 3, 'National Day'),
      fixed(12, 10, 'Victory Day'),
      fixed(12, 25, CHRISTMAS),
      hijri(12, 18, 'Eid al-Ghadir', { from: 2024 })
    ]
  },
  PS: {
    name: 'Palestine',
    islamic: { 'new-year': 1, mawlid: 1, 'isra-miraj': 1, 'eid-al-fitr': 3, arafah: 1, 'eid-al-adha': 3 },
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(1, 7, 'Orthodox Christmas'),
      fixed(3, 30, 'Land Day', observance),
      fixed(5, 1, LABOUR),
      fixed(5, 15, 'Nakba Day', observance),
      fixed(11, 15, 'Independence Day'),
      fixed(12, 25, CHRISTMAS)
    ]
  },
  SY: {
    name: 'Syria',
    islamic: { 'new-year': 1, mawlid: 1, 'eid-al-fitr': 3, 'eid-al-adha': 4 },
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(3, 8, '8 March Revolution Day', { until: 2024 }),
      fixed(3, 18, 'Syrian Revolution Day', { from: 2026 }),
      fixed(3, 21, 'Mother’s Day'),
      easter(0, 'Easter (Western)', { lieu: false }),
      orthodox(0, 'Easter (Orthodox)', { lieu: false }),
      fixed(4, 17, 'Evacuation Day'),
      fixed(5, 1, LABOUR),
      fixed(5, 6, 'Martyrs’ Day', { until: 2025 }),
      fixed(10, 6, 'Tishreen War Day', { until: 2024 }),
      fixed(12, 8, 'Liberation Day', { from: 2025 }),
      fixed(12, 25, CHRISTMAS)
    ]
  },
  MA: {
    name: 'Morocco',
    islamic: { 'new-year': 1, mawlid: 2, 'eid-al-fitr': 2, 'eid-al-adha': 2 },
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(1, 11, 'Proclamation of Independence'),
      fixed(1, 14, 'Amazigh New Year', { from: 2024 }),
      fixed(5, 1, LABOUR),
      fixed(7, 30, 'Throne Day'),
      fixed(8, 14, 'Oued Ed-Dahab Day'),
      fixed(8, 20, 'Revolution of the King and the People'),
      fixed(8, 21, 'Youth Day'),
      fixed(10, 31, 'Unity Day', { from: 2025 }),
      fixed(11, 6, 'Green March'),
      fixed(11, 18, 'Independence Day')
    ]
  },
  DZ: {
    name: 'Algeria',
    islamic: { 'new-year': 1, ashura: 1, mawlid: 1, 'eid-al-fitr': 2, 'eid-al-adha': 2 },
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(1, 12, 'Amazigh New Year (Yennayer)', { from: 2018 }),
      fixed(5, 1, LABOUR),
      fixed(7, 5, 'Independence Day'),
      fixed(11, 1, 'Revolution Day')
    ]
  },
  TN: {
    name: 'Tunisia',
    islamic: { 'new-year': 1, mawlid: 1, 'eid-al-fitr': 2, 'eid-al-adha': 2 },
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(3, 20, 'Independence Day'),
      fixed(4, 9, 'Martyrs’ Day'),
      fixed(5, 1, LABOUR),
      fixed(7, 25, 'Republic Day'),
      fixed(8, 13, 'Women’s Day'),
      fixed(10, 15, 'Evacuation Day'),
      fixed(12, 17, 'Revolution Day', { from: 2021 })
    ]
  },
  LY: {
    name: 'Libya',
    islamic: { 'new-year': 1, mawlid: 1, 'eid-al-fitr': 3, arafah: 1, 'eid-al-adha': 3 },
    rules: [
      fixed(2, 17, '17 February Revolution Day'),
      fixed(5, 1, LABOUR),
      fixed(9, 16, 'Martyrs’ Day'),
      fixed(10, 23, 'Liberation Day'),
      fixed(12, 24, 'Independence Day')
    ]
  },
  SD: {
    name: 'Sudan',
    islamic: { 'new-year': 1, mawlid: 1, 'eid-al-fitr': 3, 'eid-al-adha': 4 },
    rules: [
      fixed(1, 1, 'Independence Day'),
      fixed(1, 7, 'Coptic Christmas'),
      orthodox(0, 'Coptic Easter', observance),
      fixed(12, 25, CHRISTMAS)
    ]
  },

  // ── Rest of the Muslim world ──────────────────────────────────────────────
  TR: {
    name: 'Turkey',
    islamic: { 'eid-al-fitr': 3, 'eid-al-adha': 4 },
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(4, 23, 'National Sovereignty and Children’s Day'),
      fixed(5, 1, 'Labour and Solidarity Day'),
      fixed(5, 19, 'Commemoration of Atatürk, Youth and Sports Day'),
      fixed(7, 15, 'Democracy and National Unity Day', { from: 2017 }),
      fixed(8, 30, 'Victory Day'),
      fixed(10, 29, 'Republic Day')
    ]
  },
  IR: {
    name: 'Iran',
    islamic: { ashura: 1, 'mid-shaban': 1, 'eid-al-fitr': 2, 'eid-al-adha': 1 },
    rules: [
      inCalendar('persian', 1, 1, 'Nowruz', { days: 4 }),
      inCalendar('persian', 1, 12, 'Islamic Republic Day'),
      inCalendar('persian', 1, 13, 'Nature Day (Sizdah Bedar)'),
      inCalendar('persian', 3, 14, 'Anniversary of Khomeini’s death'),
      inCalendar('persian', 3, 15, '15 Khordad Uprising'),
      inCalendar('persian', 11, 22, 'Islamic Revolution Day'),
      inCalendar('persian', 12, 29, 'Oil Nationalisation Day'),
      hijri(1, 9, 'Tasu’a'),
      hijri(2, 20, 'Arba’een'),
      hijri(2, 28, 'Death of the Prophet and martyrdom of Imam Hasan'),
      hijri(3, 8, 'Martyrdom of Imam Hasan al-Askari'),
      hijri(3, 17, 'Birthday of the Prophet and of Imam Sadiq'),
      hijri(6, 3, 'Martyrdom of Fatima'),
      hijri(7, 13, 'Birthday of Imam Ali'),
      hijri(7, 27, 'Mab’ath'),
      hijri(9, 21, 'Martyrdom of Imam Ali'),
      hijri(10, 25, 'Martyrdom of Imam Sadiq'),
      hijri(12, 18, 'Eid al-Ghadir')
    ]
  },
  PK: {
    name: 'Pakistan',
    islamic: { ashura: 1, mawlid: 1, 'eid-al-fitr': 3, 'eid-al-adha': 3 },
    rules: [
      fixed(2, 5, 'Kashmir Solidarity Day'),
      fixed(3, 23, 'Pakistan Day'),
      fixed(5, 1, LABOUR),
      fixed(5, 28, 'Youm-e-Takbeer', { from: 2024 }),
      fixed(8, 14, 'Independence Day'),
      fixed(11, 9, 'Iqbal Day', { from: 2022 }),
      fixed(12, 25, 'Quaid-e-Azam Day'),
      hijri(1, 9, 'Ashura (first day)')
    ]
  },
  BD: {
    name: 'Bangladesh',
    islamic: { ashura: 1, mawlid: 1, 'mid-shaban': 1, 'laylat-al-qadr': 1, 'eid-al-fitr': 3, 'eid-al-adha': 3 },
    rules: [
      fixed(2, 21, 'Language Martyrs’ Day'),
      fixed(3, 26, 'Independence Day'),
      fixed(4, 14, 'Bengali New Year'),
      fixed(5, 1, 'May Day'),
      fixed(12, 16, 'Victory Day'),
      fixed(12, 25, CHRISTMAS)
    ]
  },
  ID: {
    name: 'Indonesia',
    islamic: { 'new-year': 1, mawlid: 1, 'isra-miraj': 1, 'eid-al-fitr': 2, 'eid-al-adha': 1 },
    rules: [
      fixed(1, 1, NEW_YEAR),
      calc(chineseNewYear, 'Chinese New Year'),
      easter(-2, GOOD_FRIDAY),
      easter(0, 'Easter Sunday', { from: 2024 }),
      fixed(5, 1, LABOUR),
      easter(39, 'Ascension Day of Jesus Christ'),
      inCalendar('chinese', 4, 15, 'Vesak Day', { mayVary: true }),
      fixed(6, 1, 'Pancasila Day'),
      fixed(8, 17, 'Independence Day'),
      fixed(12, 25, CHRISTMAS)
    ]
  },
  MY: {
    name: 'Malaysia',
    islamic: { 'new-year': 1, mawlid: 1, 'eid-al-fitr': 2, 'eid-al-adha': 1 },
    rules: [
      fixed(1, 1, NEW_YEAR),
      calc(chineseNewYear, 'Chinese New Year', { days: 2 }),
      fixed(5, 1, LABOUR),
      inCalendar('chinese', 4, 15, 'Wesak Day', { mayVary: true }),
      nth(6, MON, 1, 'Birthday of the Yang di-Pertuan Agong'),
      fixed(8, 31, 'National Day'),
      fixed(9, 16, 'Malaysia Day'),
      fixed(12, 25, CHRISTMAS)
    ]
  },

  // ── Europe ────────────────────────────────────────────────────────────────
  GB: {
    name: 'United Kingdom',
    lieu: 'weekend',
    rules: [
      fixed(1, 1, NEW_YEAR),
      easter(-2, GOOD_FRIDAY),
      easter(1, EASTER_MONDAY),
      nth(5, MON, 1, 'Early May bank holiday'),
      nth(5, MON, -1, 'Spring bank holiday'),
      nth(8, MON, -1, 'Summer bank holiday'),
      fixed(12, 25, CHRISTMAS),
      fixed(12, 26, 'Boxing Day')
    ]
  },
  DE: {
    name: 'Germany',
    rules: [
      fixed(1, 1, NEW_YEAR),
      easter(-2, GOOD_FRIDAY),
      easter(1, EASTER_MONDAY),
      fixed(5, 1, LABOUR),
      easter(39, 'Ascension Day'),
      easter(50, 'Whit Monday'),
      fixed(10, 3, 'German Unity Day'),
      fixed(12, 25, CHRISTMAS),
      fixed(12, 26, 'Second Day of Christmas')
    ]
  },
  FR: {
    name: 'France',
    rules: [
      fixed(1, 1, NEW_YEAR),
      easter(1, EASTER_MONDAY),
      fixed(5, 1, LABOUR),
      fixed(5, 8, 'Victory in Europe Day'),
      easter(39, 'Ascension Day'),
      easter(50, 'Whit Monday'),
      fixed(7, 14, 'Bastille Day'),
      fixed(8, 15, 'Assumption of Mary'),
      fixed(11, 1, 'All Saints’ Day'),
      fixed(11, 11, 'Armistice Day'),
      fixed(12, 25, CHRISTMAS)
    ]
  },
  ES: {
    name: 'Spain',
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(1, 6, 'Epiphany'),
      easter(-2, GOOD_FRIDAY),
      fixed(5, 1, LABOUR),
      fixed(8, 15, 'Assumption of Mary'),
      fixed(10, 12, 'National Day of Spain'),
      fixed(11, 1, 'All Saints’ Day'),
      fixed(12, 6, 'Constitution Day'),
      fixed(12, 8, 'Immaculate Conception'),
      fixed(12, 25, CHRISTMAS)
    ]
  },
  IT: {
    name: 'Italy',
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(1, 6, 'Epiphany'),
      easter(1, EASTER_MONDAY),
      fixed(4, 25, 'Liberation Day'),
      fixed(5, 1, LABOUR),
      fixed(6, 2, 'Republic Day'),
      fixed(8, 15, 'Assumption of Mary (Ferragosto)'),
      fixed(10, 4, 'Feast of St Francis of Assisi', { from: 2026 }),
      fixed(11, 1, 'All Saints’ Day'),
      fixed(12, 8, 'Immaculate Conception'),
      fixed(12, 25, CHRISTMAS),
      fixed(12, 26, 'St Stephen’s Day')
    ]
  },
  NL: {
    name: 'Netherlands',
    rules: [
      fixed(1, 1, NEW_YEAR),
      easter(-2, GOOD_FRIDAY, observance),
      easter(0, 'Easter Sunday'),
      easter(1, EASTER_MONDAY),
      // King's Day is kept on the Saturday when 27 April is a Sunday.
      calc(year => (new Date(Date.UTC(year, 3, 27)).getUTCDay() === SUN ? [4, 26] : [4, 27]), 'King’s Day', { from: 2014 }),
      fixed(5, 5, 'Liberation Day', observance),
      easter(39, 'Ascension Day'),
      easter(49, 'Whit Sunday'),
      easter(50, 'Whit Monday'),
      fixed(12, 25, CHRISTMAS),
      fixed(12, 26, 'Second Day of Christmas')
    ]
  },
  RU: {
    name: 'Russia',
    rules: [
      fixed(1, 1, 'New Year holidays', { days: 8 }),
      fixed(1, 7, 'Orthodox Christmas'),
      fixed(2, 23, 'Defender of the Fatherland Day'),
      fixed(3, 8, 'International Women’s Day'),
      fixed(5, 1, 'Spring and Labour Day'),
      fixed(5, 9, 'Victory Day'),
      fixed(6, 12, 'Russia Day'),
      fixed(11, 4, 'Unity Day')
    ]
  },

  // ── Americas ──────────────────────────────────────────────────────────────
  US: {
    name: 'United States',
    lieu: 'nearest',
    rules: [
      fixed(1, 1, NEW_YEAR),
      nth(1, MON, 3, 'Martin Luther King Jr. Day'),
      nth(2, MON, 3, 'Presidents’ Day'),
      nth(5, MON, -1, 'Memorial Day'),
      fixed(6, 19, 'Juneteenth', { from: 2021 }),
      fixed(7, 4, 'Independence Day'),
      nth(9, MON, 1, 'Labor Day'),
      nth(10, MON, 2, 'Columbus Day'),
      fixed(11, 11, 'Veterans Day'),
      nth(11, THU, 4, 'Thanksgiving'),
      fixed(12, 25, CHRISTMAS)
    ]
  },
  CA: {
    name: 'Canada',
    lieu: 'sunday',
    rules: [
      fixed(1, 1, NEW_YEAR),
      easter(-2, GOOD_FRIDAY),
      before(5, 25, MON, 'Victoria Day'),
      fixed(7, 1, 'Canada Day'),
      nth(9, MON, 1, LABOUR),
      fixed(9, 30, 'National Day for Truth and Reconciliation', { from: 2021 }),
      nth(10, MON, 2, 'Thanksgiving'),
      fixed(11, 11, 'Remembrance Day'),
      fixed(12, 25, CHRISTMAS),
      fixed(12, 26, 'Boxing Day')
    ]
  },
  BR: {
    name: 'Brazil',
    rules: [
      fixed(1, 1, NEW_YEAR),
      easter(-48, 'Carnival', { ...observance, days: 2 }),
      easter(-2, GOOD_FRIDAY),
      fixed(4, 21, 'Tiradentes Day'),
      fixed(5, 1, LABOUR),
      easter(60, 'Corpus Christi', observance),
      fixed(9, 7, 'Independence Day'),
      fixed(10, 12, 'Our Lady of Aparecida'),
      fixed(11, 2, 'All Souls’ Day'),
      fixed(11, 15, 'Republic Day'),
      fixed(11, 20, 'Black Consciousness Day', { from: 2024 }),
      fixed(12, 25, CHRISTMAS)
    ]
  },

  // ── Asia and the Pacific ──────────────────────────────────────────────────
  IN: {
    name: 'India',
    islamic: { ashura: 1, mawlid: 1, 'eid-al-fitr': 1, 'eid-al-adha': 1 },
    rules: [
      fixed(1, 26, 'Republic Day'),
      easter(-2, GOOD_FRIDAY),
      fixed(8, 15, 'Independence Day'),
      fixed(10, 2, 'Gandhi Jayanti'),
      fixed(12, 25, CHRISTMAS)
    ]
  },
  SG: {
    name: 'Singapore',
    islamic: { 'eid-al-fitr': 1, 'eid-al-adha': 1 },
    lieu: 'sunday',
    rules: [
      fixed(1, 1, NEW_YEAR),
      calc(chineseNewYear, 'Chinese New Year', { days: 2 }),
      easter(-2, GOOD_FRIDAY),
      fixed(5, 1, LABOUR),
      inCalendar('chinese', 4, 15, 'Vesak Day', { mayVary: true }),
      fixed(8, 9, 'National Day'),
      fixed(12, 25, CHRISTMAS)
    ]
  },
  JP: {
    name: 'Japan',
    lieu: 'sunday',
    rules: [
      fixed(1, 1, NEW_YEAR),
      nth(1, MON, 2, 'Coming of Age Day'),
      fixed(2, 11, 'National Foundation Day'),
      fixed(2, 23, 'Emperor’s Birthday', { from: 2020 }),
      calc(equinox(20.8431, 3), 'Vernal Equinox Day'),
      fixed(4, 29, 'Shōwa Day'),
      fixed(5, 3, 'Constitution Memorial Day'),
      fixed(5, 4, 'Greenery Day'),
      fixed(5, 5, 'Children’s Day'),
      nth(7, MON, 3, 'Marine Day'),
      fixed(8, 11, 'Mountain Day', { from: 2016 }),
      nth(9, MON, 3, 'Respect for the Aged Day'),
      calc(equinox(23.2488, 9), 'Autumnal Equinox Day'),
      nth(10, MON, 2, 'Sports Day'),
      fixed(11, 3, 'Culture Day'),
      fixed(11, 23, 'Labour Thanksgiving Day')
    ]
  },
  AU: {
    name: 'Australia',
    lieu: 'weekend',
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(1, 26, 'Australia Day'),
      easter(-2, GOOD_FRIDAY),
      easter(1, EASTER_MONDAY),
      fixed(4, 25, 'Anzac Day', { lieu: false }),
      fixed(12, 25, CHRISTMAS),
      fixed(12, 26, 'Boxing Day')
    ]
  },
  NZ: {
    name: 'New Zealand',
    lieu: 'weekend',
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(1, 2, 'Day after New Year’s Day'),
      fixed(2, 6, 'Waitangi Day'),
      easter(-2, GOOD_FRIDAY),
      easter(1, EASTER_MONDAY),
      fixed(4, 25, 'Anzac Day'),
      nth(6, MON, 1, 'King’s Birthday'),
      calc(year => MATARIKI[year] ?? null, 'Matariki'),
      nth(10, MON, 4, LABOUR),
      fixed(12, 25, CHRISTMAS),
      fixed(12, 26, 'Boxing Day')
    ]
  },

  // ── Africa ────────────────────────────────────────────────────────────────
  NG: {
    name: 'Nigeria',
    islamic: { mawlid: 1, 'eid-al-fitr': 2, 'eid-al-adha': 2 },
    rules: [
      fixed(1, 1, NEW_YEAR),
      easter(-2, GOOD_FRIDAY),
      easter(1, EASTER_MONDAY),
      fixed(5, 1, 'Workers’ Day'),
      fixed(6, 12, 'Democracy Day', { from: 2019 }),
      fixed(10, 1, 'Independence Day'),
      fixed(12, 25, CHRISTMAS),
      fixed(12, 26, 'Boxing Day')
    ]
  },
  KE: {
    name: 'Kenya',
    islamic: { 'eid-al-fitr': 1 },
    lieu: 'sunday',
    rules: [
      fixed(1, 1, NEW_YEAR),
      easter(-2, GOOD_FRIDAY),
      easter(1, EASTER_MONDAY),
      fixed(5, 1, LABOUR),
      fixed(6, 1, 'Madaraka Day'),
      fixed(10, 10, 'Mazingira Day'),
      fixed(10, 20, 'Mashujaa Day'),
      fixed(12, 12, 'Jamhuri Day'),
      fixed(12, 25, CHRISTMAS),
      fixed(12, 26, 'Boxing Day')
    ]
  },
  ZA: {
    name: 'South Africa',
    lieu: 'sunday',
    rules: [
      fixed(1, 1, NEW_YEAR),
      fixed(3, 21, 'Human Rights Day'),
      easter(-2, GOOD_FRIDAY),
      easter(1, 'Family Day'),
      fixed(4, 27, 'Freedom Day'),
      fixed(5, 1, 'Workers’ Day'),
      fixed(6, 16, 'Youth Day'),
      fixed(8, 9, 'National Women’s Day'),
      fixed(9, 24, 'Heritage Day'),
      fixed(12, 16, 'Day of Reconciliation'),
      fixed(12, 25, CHRISTMAS),
      fixed(12, 26, 'Day of Goodwill')
    ]
  },

  IL: {
    name: 'Israel',
    rules: [
      inCalendar('hebrew', 'Tishri', 1, 'Rosh Hashanah', { days: 2, note: EVENING }),
      inCalendar('hebrew', 'Tishri', 10, 'Yom Kippur', { note: EVENING }),
      inCalendar('hebrew', 'Tishri', 15, 'Sukkot', { note: EVENING }),
      inCalendar('hebrew', 'Tishri', 22, 'Simchat Torah', { note: EVENING }),
      inCalendar('hebrew', 'Nisan', 15, 'Passover', { note: EVENING }),
      inCalendar('hebrew', 'Nisan', 21, 'Seventh day of Passover', { note: EVENING }),
      inCalendar('hebrew', 'Iyar', 5, 'Independence Day', { mayVary: true }),
      inCalendar('hebrew', 'Sivan', 6, 'Shavuot', { note: EVENING })
    ]
  }
};

/**
 * Countries where most people are Muslim: Islamic occasions show there whether
 * or not the Hijri layer is on, also where no public holidays are built in.
 */
const MUSLIM_MAJORITY = new Set([
  'AE', 'AF', 'AL', 'AZ', 'BD', 'BH', 'BN', 'DJ', 'DZ', 'EG', 'EH', 'GM', 'GN', 'ID', 'IQ', 'IR', 'JO', 'KG',
  'KM', 'KW', 'KZ', 'LB', 'LY', 'MA', 'ML', 'MR', 'MV', 'MY', 'NE', 'OM', 'PK', 'PS', 'QA', 'SA', 'SD', 'SN',
  'SO', 'SY', 'TJ', 'TM', 'TN', 'TR', 'UZ', 'XK', 'YE'
]);

/** Countries Arabic speakers name differently from the browser's list. */
const ARABIC_COUNTRY_NAMES: Record<string, string> = { PS: 'Palestine' };

/** The countries that can be picked under "Holidays for", by their name in the interface language. */
export const OCCASION_COUNTRIES: { code: string; name: string }[] = Object.keys(COUNTRIES)
  .map(code => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name, locale()));

/** True when public holidays are built in for the country. */
export function hasHolidays(code: string | null | undefined): boolean {
  return !!code && code in COUNTRIES;
}

export function isMuslimMajority(code: string | null | undefined): boolean {
  return !!code && MUSLIM_MAJORITY.has(code);
}

/**
 * "Egypt" for "EG", in Arabic "مصر". In English a country with built-in holidays
 * keeps the name written here and any other is named by the browser; in Arabic
 * the browser names them all.
 */
export function countryName(code: string): string {
  const known = COUNTRIES[code]?.name;
  const english = currentLanguage() === 'en';
  if (english && known) return known;
  if (!english && ARABIC_COUNTRY_NAMES[code]) return t(ARABIC_COUNTRY_NAMES[code]);
  try {
    return new Intl.DisplayNames([locale()], { type: 'region' }).of(code) ?? known ?? code;
  } catch {
    return known ?? code;
  }
}

// ── Days ────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** A calendar day as the UTC instant of its midnight: plain day arithmetic, no time zone. */
const dayOf = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day);
const keyOf = (day: number) => new Date(day).toISOString().slice(0, 10);
const weekdayOf = (day: number) => new Date(day).getUTCDay();
const yearOf = (day: number) => new Date(day).getUTCFullYear();

function parseKey(key: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return match ? dayOf(+match[1], +match[2], +match[3]) : Number.NaN;
}

/** Easter Sunday of the Western churches (the Gregorian computus). `month` is 1-12. */
export function westernEaster(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return { month, day: ((h + l - 7 * m + 114) % 31) + 1 };
}

/** Easter Sunday of the Orthodox and Coptic churches, as a date of the civil (Gregorian) calendar. */
export function orthodoxEaster(year: number): { month: number; day: number } {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const julianMonth = Math.floor((d + e + 114) / 31);
  const julianDay = ((d + e + 114) % 31) + 1;
  // The Julian calendar runs this many days behind (13 from 1900 to 2099).
  const behind = Math.floor(year / 100) - Math.floor(year / 400) - 2;
  const date = new Date(dayOf(year, julianMonth, julianDay) + behind * DAY_MS);
  return { month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

interface CalendarDay {
  /** The day, as `dayOf` gives it. */
  at: number;
  /** The year in that calendar. */
  year: number;
}

const calendarYears = new Map<string, Map<string, CalendarDay[]>>();

/**
 * Every day of a civil year by its date in another calendar: "10-1" (month, day)
 * to the days that carry it. A Hijri date can fall twice in one civil year.
 * Empty when the browser does not know the calendar.
 */
function yearInCalendar(calendar: string, year: number): Map<string, CalendarDay[]> {
  const cacheKey = `${calendar}|${year}`;
  const cached = calendarYears.get(cacheKey);
  if (cached) return cached;

  const days = new Map<string, CalendarDay[]>();
  calendarYears.set(cacheKey, days);

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(`en-u-ca-${calendar}-nu-latn`, {
      timeZone: 'UTC', year: 'numeric', month: calendar === 'hebrew' ? 'long' : 'numeric', day: 'numeric'
    });
  } catch {
    return days;
  }
  if (formatter.resolvedOptions().calendar !== calendar) return days;

  const end = dayOf(year + 1, 1, 1);
  for (let at = dayOf(year, 1, 1); at < end; at += DAY_MS) {
    const fields: Record<string, string> = {};
    // Noon, so no rounding can put the instant on a neighbouring day.
    for (const part of formatter.formatToParts(new Date(at + DAY_MS / 2))) fields[part.type] = part.value;
    const key = `${fields['month']}-${fields['day']}`;
    const list = days.get(key) ?? [];
    list.push({ at, year: Number(fields['year'] ?? fields['relatedYear']) });
    days.set(key, list);
  }
  return days;
}

/** The days a rule lands on in a civil year. */
function ruleDays(rule: Rule, year: number, hijriCalendar: HijriCalendar): CalendarDay[] {
  const one = (at: number): CalendarDay[] => [{ at, year }];

  switch (rule.type) {
    case 'fixed':
      return one(dayOf(year, rule.month, rule.day));
    case 'nth': {
      if (rule.n > 0) {
        const first = dayOf(year, rule.month, 1);
        const at = first + ((rule.weekday - weekdayOf(first) + 7) % 7 + (rule.n - 1) * 7) * DAY_MS;
        return one(at);
      }
      const last = dayOf(year, rule.month + 1, 0);
      return one(last - ((weekdayOf(last) - rule.weekday + 7) % 7) * DAY_MS);
    }
    case 'before': {
      const limit = dayOf(year, rule.month, rule.day) - DAY_MS;
      return one(limit - ((weekdayOf(limit) - rule.weekday + 7) % 7) * DAY_MS);
    }
    case 'easter': {
      const sunday = rule.orthodox ? orthodoxEaster(year) : westernEaster(year);
      return one(dayOf(year, sunday.month, sunday.day) + rule.offset * DAY_MS);
    }
    case 'hijri':
      return yearInCalendar(hijriCalendar, year).get(`${rule.month}-${rule.day}`) ?? [];
    case 'calendar':
      return yearInCalendar(rule.calendar, year).get(`${rule.month}-${rule.day}`) ?? [];
    case 'calc': {
      const found = rule.find(year);
      return found ? one(dayOf(year, found[0], found[1])) : [];
    }
  }
}

/** A name of the tables above as it is shown: translated, and "30 June" in the digits chosen. */
const shown = (english: string) => num(t(english));

const slug = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ’']/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

interface Built extends Occasion {
  at: number;
  /** May be given a day in lieu. */
  lieu: boolean;
}

const yearCache = new Map<string, Built[]>();

/** Every occasion that starts in a civil year. */
function occasionsOfYear(year: number, query: OccasionQuery): Built[] {
  const cacheKey = `${locale()}|${year}|${query.country ?? ''}|${query.hijriCalendar}|${query.hijriLayer}`;
  const cached = yearCache.get(cacheKey);
  if (cached) return cached;

  const code = query.country;
  const country = code ? COUNTRIES[code] : undefined;
  const list: Built[] = [];

  // The Hijri calendar's occasions: all of them for those who keep the layer or
  // live in a Muslim-majority country, otherwise only the country's public holidays.
  const all = query.hijriLayer || isMuslimMajority(code);
  const hijriYear = yearInCalendar(query.hijriCalendar, year);
  for (const occasion of ISLAMIC) {
    const daysOff = country?.islamic?.[occasion.key] ?? 0;
    if (!all && !daysOff) continue;
    for (const hit of hijriYear.get(`${occasion.month}-${occasion.day}`) ?? []) {
      list.push({
        id: `islamic:${occasion.key}:${hit.year}`, name: shown(occasion.name), date: keyOf(hit.at), at: hit.at,
        days: daysOff || occasion.days, kind: daysOff ? 'holiday' : 'observance',
        country: 'Islamic', holidayIn: daysOff ? code : null, mayVary: true, lieu: true,
        ...(occasion.note ? { note: shown(occasion.note) } : {})
      });
    }
  }

  if (code && country) {
    for (const rule of country.rules) {
      if ((rule.from && year < rule.from) || (rule.until && year > rule.until)) continue;
      const kind = rule.kind ?? 'holiday';
      for (const hit of ruleDays(rule, year, query.hijriCalendar)) {
        list.push({
          id: `${code}:${slug(rule.name)}:${hit.year}`, name: shown(rule.name), date: keyOf(hit.at), at: hit.at,
          days: rule.days ?? 1, kind, country: code, holidayIn: kind === 'holiday' ? code : null,
          mayVary: !!rule.mayVary, lieu: rule.lieu ?? rule.type !== 'easter',
          ...(rule.note ? { note: shown(rule.note) } : {})
        });
      }
    }
    if (country.lieu) addDaysInLieu(list, year, code, country.lieu);
    if (code === 'JP') addCitizensHolidays(list, code);
  }

  list.sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === 'holiday' ? -1 : 1) || a.name.localeCompare(b.name));
  yearCache.set(cacheKey, list);
  return list;
}

/** The days off a list holds, each as `dayOf` gives it. */
function daysOff(list: Built[]): Set<number> {
  const taken = new Set<number>();
  for (const occasion of list) {
    if (occasion.kind !== 'holiday') continue;
    for (let index = 0; index < occasion.days; index++) taken.add(occasion.at + index * DAY_MS);
  }
  return taken;
}

type LieuLabel = 'observed' | 'substitute day';

/** "Christmas Day (observed)": the name of the day off given for a holiday that fell on a weekend. */
function inLieu(name: string, label: LieuLabel): string {
  return label === 'observed' ? t('{name} (observed)', { name }) : t('{name} (substitute day)', { name });
}

function addDaysInLieu(list: Built[], year: number, code: string, mode: Lieu) {
  const taken = daysOff(list);
  const single = list
    .filter(occasion => occasion.kind === 'holiday' && occasion.days === 1 && occasion.lieu)
    .sort((a, b) => a.at - b.at);

  const add = (source: Built, at: number, label: LieuLabel) => {
    taken.add(at);
    list.push({
      ...source, id: source.id.replace(/:(\d+)$/, `-${slug(label)}:$1`), name: inLieu(source.name, label),
      date: keyOf(at), at, lieu: false
    });
  };

  if (mode === 'nearest') {
    for (const occasion of single) {
      const weekday = weekdayOf(occasion.at);
      const kept = weekday === 6 ? occasion.at - DAY_MS : weekday === SUN ? occasion.at + DAY_MS : occasion.at;
      // A day that lands in the year before is listed with that year, below.
      if (kept !== occasion.at && yearOf(kept) === year) add(occasion, kept, 'observed');
    }
    // Next New Year's Day on a Saturday is kept on the last day of this year.
    const next = dayOf(year + 1, 1, 1);
    const newYear = COUNTRIES[code].rules.find(rule => rule.type === 'fixed' && rule.month === 1 && rule.day === 1);
    if (newYear && weekdayOf(next) === 6) {
      list.push({
        id: `${code}:${slug(newYear.name)}-observed:${year + 1}`, name: inLieu(shown(newYear.name), 'observed'),
        date: keyOf(next - DAY_MS), at: next - DAY_MS, days: 1, kind: 'holiday', country: code, holidayIn: code,
        mayVary: false, lieu: false
      });
    }
    return;
  }

  for (const occasion of single) {
    const weekday = weekdayOf(occasion.at);
    if (weekday !== SUN && !(mode === 'weekend' && weekday === 6)) continue;
    let at = occasion.at + DAY_MS;
    while (taken.has(at) || weekdayOf(at) === SUN || (mode === 'weekend' && weekdayOf(at) === 6)) at += DAY_MS;
    add(occasion, at, 'substitute day');
  }
}

/** Japan: a working day with a holiday on both sides is a day off too. */
function addCitizensHolidays(list: Built[], code: string) {
  const taken = daysOff(list);
  for (const at of [...taken]) {
    const between = at + DAY_MS;
    if (taken.has(between) || !taken.has(between + DAY_MS) || weekdayOf(between) === SUN) continue;
    taken.add(between);
    list.push({
      id: `${code}:citizens-holiday:${keyOf(between)}`, name: shown('Citizens’ Holiday'), date: keyOf(between), at: between,
      days: 1, kind: 'holiday', country: code, holidayIn: code, mayVary: false, lieu: false
    });
  }
}

/**
 * The occasions that touch the days from `from` to `to` (both `yyyy-mm-dd`, both
 * included), in date order with public holidays first on a shared day.
 */
export function occasionsBetween(from: string, to: string, query: OccasionQuery): Occasion[] {
  const first = parseKey(from);
  const last = parseKey(to);
  if (Number.isNaN(first) || Number.isNaN(last) || last < first) return [];

  const found: Occasion[] = [];
  // The year before as well: an occasion of several days can start in it.
  for (let year = yearOf(first) - 1; year <= yearOf(last); year++) {
    for (const built of occasionsOfYear(year, query)) {
      if (built.at > last || built.at + (built.days - 1) * DAY_MS < first) continue;
      const { at: _at, lieu: _lieu, ...occasion } = built;
      found.push(occasion);
    }
  }
  return found;
}

/** One day of an occasion, as a calendar view draws it. */
export interface OccasionDay {
  occasion: Occasion;
  /** 1 on the first day, up to `occasion.days`. */
  dayNumber: number;
}

/** The same occasions spread over their days: `yyyy-mm-dd` to what falls on it. */
export function occasionsByDay(from: string, to: string, query: OccasionQuery): Map<string, OccasionDay[]> {
  const first = parseKey(from);
  const last = parseKey(to);
  const byDay = new Map<string, OccasionDay[]>();

  for (const occasion of occasionsBetween(from, to, query)) {
    const start = parseKey(occasion.date);
    for (let index = 0; index < occasion.days; index++) {
      const at = start + index * DAY_MS;
      if (at < first || at > last) continue;
      const key = keyOf(at);
      const list = byDay.get(key) ?? [];
      list.push({ occasion, dayNumber: index + 1 });
      byDay.set(key, list);
    }
  }
  return byDay;
}

/** "Egypt", "the United States": a country's name as it reads after "in". */
function inCountry(code: string): string {
  const name = countryName(code);
  return currentLanguage() === 'en' && /^(United|Netherlands)/.test(name) ? `the ${name}` : name;
}

/** "Public holiday in Egypt" or "Observance": what kind of day it is, and where. */
export function occasionKindLabel(occasion: Occasion): string {
  if (occasion.holidayIn) return t('Public holiday in {country}', { country: inCountry(occasion.holidayIn) });
  return occasion.country === 'Islamic'
    ? t('Observance')
    : t('Observance in {country}', { country: inCountry(occasion.country) });
}

/**
 * What there is to say about an occasion beside its name:
 * "Public holiday in Egypt · Islamic calendar · Day 2 of 3 · Date may vary".
 */
export function occasionDetail(occasion: Occasion, dayNumber = 0): string {
  return [
    occasionKindLabel(occasion),
    occasion.country === 'Islamic' ? t('Islamic calendar') : '',
    occasion.days > 1
      ? (dayNumber
        ? t('Day {day} of {days}', { day: dayNumber, days: occasion.days })
        : tCount(occasion.days, '{n} day', '{n} days'))
      : '',
    occasion.note ?? '',
    occasion.mayVary ? t('Date may vary') : ''
  ].filter(Boolean).join(' · ');
}

/** The name and the rest in one line, for a tooltip: "Eid al-Fitr · Public holiday in Egypt · ...". */
export function occasionSummary(occasion: Occasion, dayNumber = 0): string {
  return `${occasion.name} · ${occasionDetail(occasion, dayNumber)}`;
}
