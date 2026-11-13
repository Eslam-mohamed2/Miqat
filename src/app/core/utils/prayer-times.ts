/**
 * Prayer times for one calendar day at one place, calculated from the sun's position
 * (the standard method published by PrayTimes.org). No network call is involved.
 *
 * The design shows them as a quiet layer on the calendar (Settings → Calendar and time).
 *
 * The names of the prayers, of the methods and of the cities are in the interface
 * language; `PrayerName` and `PrayerMethod` themselves are values and stay as they are.
 */
import { t } from '../i18n/i18n';

export type PrayerMethod = 'Egyptian' | 'UmmAlQura' | 'MWL' | 'Karachi' | 'ISNA';
export type PrayerName = 'Fajr' | 'Sunrise' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';

export interface PrayerTime {
  name: PrayerName;
  /** The instant it starts. Format it in whichever time zone the calendar shows. */
  at: Date;
}

/** "Fajr", in Arabic "الفجر": the name of a prayer as it is shown. */
export function prayerLabel(name: PrayerName): string {
  return t(name);
}

export interface Place {
  /** City shown next to the layer ("Cairo", in Arabic "القاهرة"). */
  city: string;
  latitude: number;
  longitude: number;
  /** The method normally used there. */
  method: PrayerMethod;
}

interface MethodAngles {
  /** In the interface language. */
  label: string;
  fajr: number;
  /** Degrees below the horizon, or minutes after Maghrib when `ishaMinutes` is set. */
  isha: number;
  ishaMinutes?: number;
}

export const PRAYER_METHODS: Record<PrayerMethod, MethodAngles> = {
  Egyptian:  { get label() { return t('Egyptian General Authority'); }, fajr: 19.5, isha: 17.5 },
  UmmAlQura: { get label() { return t('Umm al-Qura, Makkah'); }, fajr: 18.5, isha: 0, ishaMinutes: 90 },
  MWL:       { get label() { return t('Muslim World League'); }, fajr: 18, isha: 17 },
  Karachi:   { get label() { return t('University of Islamic Sciences, Karachi'); }, fajr: 18, isha: 18 },
  ISNA:      { get label() { return t('Islamic Society of North America'); }, fajr: 15, isha: 15 }
};

/**
 * Where a time zone's main city is. A time zone is all the app knows about where
 * someone lives, so the times are for that city: right for most people in the zone,
 * a few minutes off for the rest. A zone that is not listed has no prayer-time layer.
 */
const PLACES: Record<string, Place> = {
  'Africa/Cairo':        { get city() { return t('Cairo@@city'); }, latitude: 30.0444, longitude: 31.2357, method: 'Egyptian' },
  'Asia/Riyadh':         { get city() { return t('Riyadh@@city'); }, latitude: 24.7136, longitude: 46.6753, method: 'UmmAlQura' },
  'Asia/Dubai':          { get city() { return t('Dubai@@city'); }, latitude: 25.2048, longitude: 55.2708, method: 'UmmAlQura' },
  'Asia/Qatar':          { get city() { return t('Doha@@city'); }, latitude: 25.2854, longitude: 51.5310, method: 'UmmAlQura' },
  'Asia/Kuwait':         { get city() { return t('Kuwait City@@city'); }, latitude: 29.3759, longitude: 47.9774, method: 'UmmAlQura' },
  'Asia/Bahrain':        { get city() { return t('Manama@@city'); }, latitude: 26.2285, longitude: 50.5860, method: 'UmmAlQura' },
  'Asia/Muscat':         { get city() { return t('Muscat@@city'); }, latitude: 23.5880, longitude: 58.3829, method: 'UmmAlQura' },
  'Asia/Amman':          { get city() { return t('Amman@@city'); }, latitude: 31.9454, longitude: 35.9284, method: 'MWL' },
  'Asia/Beirut':         { get city() { return t('Beirut@@city'); }, latitude: 33.8938, longitude: 35.5018, method: 'MWL' },
  'Asia/Damascus':       { get city() { return t('Damascus@@city'); }, latitude: 33.5138, longitude: 36.2765, method: 'MWL' },
  'Asia/Baghdad':        { get city() { return t('Baghdad@@city'); }, latitude: 33.3152, longitude: 44.3661, method: 'MWL' },
  'Asia/Jerusalem':      { get city() { return t('Jerusalem@@city'); }, latitude: 31.7683, longitude: 35.2137, method: 'MWL' },
  'Asia/Hebron':         { get city() { return t('Hebron@@city'); }, latitude: 31.5326, longitude: 35.0998, method: 'MWL' },
  'Asia/Gaza':           { get city() { return t('Gaza@@city'); }, latitude: 31.5017, longitude: 34.4668, method: 'MWL' },
  'Europe/Istanbul':     { get city() { return t('Istanbul@@city'); }, latitude: 41.0082, longitude: 28.9784, method: 'MWL' },
  'Asia/Tehran':         { get city() { return t('Tehran@@city'); }, latitude: 35.6892, longitude: 51.3890, method: 'MWL' },
  'Asia/Karachi':        { get city() { return t('Karachi@@city'); }, latitude: 24.8607, longitude: 67.0011, method: 'Karachi' },
  'Asia/Kolkata':        { get city() { return t('Delhi@@city'); }, latitude: 28.6139, longitude: 77.2090, method: 'Karachi' },
  'Asia/Dhaka':          { get city() { return t('Dhaka@@city'); }, latitude: 23.8103, longitude: 90.4125, method: 'Karachi' },
  'Asia/Jakarta':        { get city() { return t('Jakarta@@city'); }, latitude: -6.2088, longitude: 106.8456, method: 'MWL' },
  'Asia/Kuala_Lumpur':   { get city() { return t('Kuala Lumpur@@city'); }, latitude: 3.1390, longitude: 101.6869, method: 'MWL' },
  'Asia/Singapore':      { get city() { return t('Singapore@@city'); }, latitude: 1.3521, longitude: 103.8198, method: 'MWL' },
  'Africa/Tripoli':      { get city() { return t('Tripoli@@city'); }, latitude: 32.8872, longitude: 13.1913, method: 'Egyptian' },
  'Africa/Tunis':        { get city() { return t('Tunis@@city'); }, latitude: 36.8065, longitude: 10.1815, method: 'MWL' },
  'Africa/Algiers':      { get city() { return t('Algiers@@city'); }, latitude: 36.7538, longitude: 3.0588, method: 'MWL' },
  'Africa/Casablanca':   { get city() { return t('Casablanca@@city'); }, latitude: 33.5731, longitude: -7.5898, method: 'MWL' },
  'Africa/Khartoum':     { get city() { return t('Khartoum@@city'); }, latitude: 15.5007, longitude: 32.5599, method: 'Egyptian' },
  'Africa/Lagos':        { get city() { return t('Lagos@@city'); }, latitude: 6.5244, longitude: 3.3792, method: 'MWL' },
  'Africa/Nairobi':      { get city() { return t('Nairobi@@city'); }, latitude: -1.2921, longitude: 36.8219, method: 'MWL' },
  'Africa/Johannesburg': { get city() { return t('Johannesburg@@city'); }, latitude: -26.2041, longitude: 28.0473, method: 'MWL' },
  'Europe/London':       { get city() { return t('London@@city'); }, latitude: 51.5074, longitude: -0.1278, method: 'MWL' },
  'Europe/Paris':        { get city() { return t('Paris@@city'); }, latitude: 48.8566, longitude: 2.3522, method: 'MWL' },
  'Europe/Berlin':       { get city() { return t('Berlin@@city'); }, latitude: 52.5200, longitude: 13.4050, method: 'MWL' },
  'Europe/Madrid':       { get city() { return t('Madrid@@city'); }, latitude: 40.4168, longitude: -3.7038, method: 'MWL' },
  'Europe/Rome':         { get city() { return t('Rome@@city'); }, latitude: 41.9028, longitude: 12.4964, method: 'MWL' },
  'Europe/Amsterdam':    { get city() { return t('Amsterdam@@city'); }, latitude: 52.3676, longitude: 4.9041, method: 'MWL' },
  'Europe/Moscow':       { get city() { return t('Moscow@@city'); }, latitude: 55.7558, longitude: 37.6173, method: 'MWL' },
  'America/New_York':    { get city() { return t('New York@@city'); }, latitude: 40.7128, longitude: -74.0060, method: 'ISNA' },
  'America/Chicago':     { get city() { return t('Chicago@@city'); }, latitude: 41.8781, longitude: -87.6298, method: 'ISNA' },
  'America/Denver':      { get city() { return t('Denver@@city'); }, latitude: 39.7392, longitude: -104.9903, method: 'ISNA' },
  'America/Los_Angeles': { get city() { return t('Los Angeles@@city'); }, latitude: 34.0522, longitude: -118.2437, method: 'ISNA' },
  'America/Toronto':     { get city() { return t('Toronto@@city'); }, latitude: 43.6532, longitude: -79.3832, method: 'ISNA' },
  'Australia/Sydney':    { get city() { return t('Sydney@@city'); }, latitude: -33.8688, longitude: 151.2093, method: 'MWL' }
};

/** The city prayer times are calculated for in this time zone, or null when it is not known. */
export function placeForZone(zone: string | null | undefined): Place | null {
  return (zone && PLACES[zone]) || null;
}

// ── Trigonometry in degrees ─────────────────────────────────────────────────
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const sin = (d: number) => Math.sin(rad(d));
const cos = (d: number) => Math.cos(rad(d));
const tan = (d: number) => Math.tan(rad(d));
const arcsin = (x: number) => deg(Math.asin(x));
const arccos = (x: number) => deg(Math.acos(x));
const arctan2 = (y: number, x: number) => deg(Math.atan2(y, x));
const arccot = (x: number) => deg(Math.atan(1 / x));
const fix = (value: number, mod: number) => ((value % mod) + mod) % mod;

function julian(year: number, month: number, day: number): number {
  if (month <= 2) { year -= 1; month += 12; }
  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
}

function sunPosition(jd: number): { declination: number; equation: number } {
  const d = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * d, 360);
  const q = fix(280.459 + 0.98564736 * d, 360);
  const l = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * d;
  const ra = arctan2(cos(e) * sin(l), cos(l)) / 15;
  return { declination: arcsin(sin(e) * sin(l)), equation: q / 15 - fix(ra, 24) };
}

/**
 * The six times of one day. `year`, `month` (1-12) and `day` name the calendar day
 * at the place itself. A time the sun never reaches that day (Fajr and Isha far north
 * in summer) is left out of the list.
 */
export function prayerTimes(
  year: number, month: number, day: number, place: Place, method: PrayerMethod = place.method
): PrayerTime[] {
  const { latitude, longitude } = place;
  const angles = PRAYER_METHODS[method];
  // Local midnight at this longitude, as a Julian date.
  const jd = julian(year, month, day) - longitude / (15 * 24);

  const midDay = (t: number) => fix(12 - sunPosition(jd + t).equation, 24);

  const angleTime = (angle: number, t: number, before: boolean) => {
    const declination = sunPosition(jd + t).declination;
    const noon = midDay(t);
    const span = arccos((-sin(angle) - sin(declination) * sin(latitude)) / (cos(declination) * cos(latitude))) / 15;
    return noon + (before ? -span : span);
  };

  const asrTime = (t: number) => {
    const declination = sunPosition(jd + t).declination;
    const angle = -arccot(1 + tan(Math.abs(latitude - declination)));
    return angleTime(angle, t, false);
  };

  // Hours after local-solar midnight; first guesses refined once, as the method prescribes.
  let hours = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18, isha: 18 };
  for (let pass = 0; pass < 2; pass++) {
    const maghrib = angleTime(0.833, hours.maghrib / 24, false);
    hours = {
      fajr: angleTime(angles.fajr, hours.fajr / 24, true),
      sunrise: angleTime(0.833, hours.sunrise / 24, true),
      dhuhr: midDay(hours.dhuhr / 24),
      asr: asrTime(hours.asr / 24),
      maghrib,
      isha: angles.ishaMinutes ? maghrib + angles.ishaMinutes / 60 : angleTime(angles.isha, hours.isha / 24, false)
    };
  }

  // Solar hours become UTC by removing the longitude's share of the day.
  const base = Date.UTC(year, month - 1, day);
  const instant = (solarHours: number) => {
    const ms = base + (solarHours - longitude / 15) * 3_600_000;
    // To the minute, rounded as timetables do.
    return new Date(Math.round(ms / 60_000) * 60_000);
  };

  const all: [PrayerName, number][] = [
    ['Fajr', hours.fajr], ['Sunrise', hours.sunrise], ['Dhuhr', hours.dhuhr],
    ['Asr', hours.asr], ['Maghrib', hours.maghrib], ['Isha', hours.isha]
  ];

  // Far north in summer the sun never gets low enough for Fajr or Isha: those are left out.
  return all
    .filter(([, value]) => Number.isFinite(value))
    .map(([name, value]) => ({ name, at: instant(value) }));
}
