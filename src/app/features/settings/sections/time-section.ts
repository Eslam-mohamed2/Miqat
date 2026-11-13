import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import { CalendarDataService } from '../../../core/services/calendar-data.service';
import { CalendarService } from '../../../core/services/calendar.service';
import { LocalPrefsService } from '../../../core/services/local-prefs.service';
import { UserService } from '../../../core/services/user.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { t } from '../../../core/i18n/i18n';
import { TPipe } from '../../../core/i18n/t.pipe';
import { HIJRI_CALENDARS, HijriCalendar, hijriFullLabel } from '../../../core/utils/hijri';
import { PRAYER_METHODS, PrayerMethod, placeForZone, prayerTimes } from '../../../core/utils/prayer-times';
import { REMINDER_PRESETS, durationLabel, reminderLabel } from '../../../core/utils/reminder-label';
import {
  OCCASION_COUNTRIES, countryName, hasHolidays, isMuslimMajority, occasionsBetween
} from '../../../core/utils/occasions';
import {
  browserTimeZone, dayKey, formatTimeInZone, isValidTimeZone, timeZoneLabel, zonedParts
} from '../../../core/utils/time-zone';
import { countryOfZone } from '../../../core/utils/zone-country';
import { CalendarSettingsDto, CalendarViewName, DayOfWeekName, UpdateProfileDto } from '../../../models/api.models';
import { clockHours, dayMonthLabel, formatClock, weekdayLabel } from '../../profile/day-overlap';
import { SettingsStatus } from '../settings-status';

interface ZoneGroup {
  /** The first part of the zone ids: "Africa". */
  region: string;
  /** The region as it is shown. */
  label: string;
  zones: { id: string; label: string }[];
}

/** The regions of the zone list, named in the interface language. A region not listed keeps its own name. */
const REGION_LABELS: Record<string, string> = {
  Africa: t('Africa@@region'),
  America: t('America@@region'),
  Antarctica: t('Antarctica@@region'),
  Arctic: t('Arctic@@region'),
  Asia: t('Asia@@region'),
  Atlantic: t('Atlantic@@region'),
  Australia: t('Australia@@region'),
  Europe: t('Europe@@region'),
  Indian: t('Indian@@region'),
  Pacific: t('Pacific@@region'),
  Other: t('Other@@region')
};

const DAYS: DayOfWeekName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_STARTS: DayOfWeekName[] = ['Saturday', 'Sunday', 'Monday'];
const EVENT_LENGTHS = [15, 30, 45, 60, 90, 120];

/** The three work weeks of the design; any other set of days is "Custom". */
const WORK_WEEKS: { key: string; label: string; days: DayOfWeekName[] }[] = ([
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday']
] as DayOfWeekName[][]).map(days => ({
  key: days.join(),
  // "Sun – Thu"
  label: t('{from} – {to}@@days', { from: weekdayLabel(days[0], 'short'), to: weekdayLabel(days[days.length - 1], 'short') }),
  days
}));

/** The calendar views, as the API names them, with what the picker shows. */
const VIEWS: { value: CalendarViewName; label: string }[] = [
  { value: 'Month', label: t('Month view') },
  { value: 'Week', label: t('Week view') },
  { value: 'Day', label: t('Day view') },
  { value: 'Agenda', label: t('Agenda view') }
];

/** Used by browsers that cannot list their own time zones. */
const FALLBACK_ZONES = [
  'UTC', 'Africa/Cairo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Riyadh',
  'Asia/Karachi', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'America/New_York',
  'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo'
];

let zoneGroups: ZoneGroup[] | null = null;

/** Every zone the browser knows, by region, labelled "Cairo (GMT+2)". Built once. */
function allZoneGroups(): ZoneGroup[] {
  if (zoneGroups) return zoneGroups;

  let ids = FALLBACK_ZONES;
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf?.('timeZone');
    if (supported?.length) ids = supported;
  } catch {
    /* the short list */
  }

  const byRegion = new Map<string, { id: string; label: string }[]>();
  for (const id of ids) {
    const region = id.includes('/') ? id.split('/')[0] : 'Other';
    const list = byRegion.get(region) ?? [];
    list.push({ id, label: timeZoneLabel(id) });
    byRegion.set(region, list);
  }
  zoneGroups = [...byRegion.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, zones]) => ({
      region,
      label: REGION_LABELS[region] ?? region,
      zones: zones.sort((a, b) => a.label.localeCompare(b.label))
    }));
  return zoneGroups;
}

/**
 * Settings → Calendar and time. Three stores are behind it: the profile (time
 * zone), the calendar settings on the server (week, hours, clock, new events) and
 * this browser (second time zone, prayer times, Hijri dates: LocalPrefsService).
 */
@Component({
  selector: 'app-settings-time',
  standalone: true,
  imports: [NgTemplateOutlet, TPipe],
  templateUrl: './time-section.html',
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimeSection {
  private users = inject(UserService);
  private calendarApi = inject(CalendarService);
  private calendarData = inject(CalendarDataService);
  private status = inject(SettingsStatus);
  protected prefs = inject(LocalPrefsService);

  protected readonly zoneGroups = allZoneGroups();
  protected readonly workWeeks = WORK_WEEKS;
  protected readonly allDays = DAYS;
  protected readonly views = VIEWS;
  protected readonly hijriCalendars = HIJRI_CALENDARS;
  protected readonly methods = (Object.keys(PRAYER_METHODS) as PrayerMethod[])
    .map(key => ({ key, label: PRAYER_METHODS[key].label }));

  /** 'unavailable': an API build without calendar settings; those rows are then switched off. */
  protected readonly state = signal<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  protected readonly settings = signal<CalendarSettingsDto | null>(null);
  /** The work week is being chosen day by day. */
  protected readonly customWeek = signal(false);
  private saveId = 0;

  constructor() {
    if (!this.users.currentUser()) this.users.getMe().subscribe({ error: () => {} });
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.calendarApi.getSettings().subscribe({
      next: settings => {
        const clean = this.clean(settings);
        this.settings.set(clean);
        this.customWeek.set(!this.weekOf(clean.workDays));
        this.state.set('ready');
      },
      // 404: the server has no calendar settings (an older build).
      error: err => this.state.set(err?.status === 404 ? 'unavailable' : 'error')
    });
  }

  // ── Time zones ─────────────────────────────────────────────────────────────

  /** The zone saved on the profile, as it is (it can be free text from an older sign-up). */
  protected readonly zone = computed(() => this.users.currentUser()?.timeZone?.trim() || '');
  protected readonly zoneKnown = computed(() => isValidTimeZone(this.zone()));

  protected readonly zoneHint = computed(() => {
    const device = browserTimeZone();
    if (!this.zoneKnown()) {
      return t('Not a zone Miqat knows, so this device’s is used: {zone}', { zone: timeZoneLabel(device) });
    }
    return this.zone() === device
      ? t('Same as this device')
      : t('This device is on {zone}', { zone: timeZoneLabel(device) });
  });

  protected setZone(zone: string): void {
    const user = this.users.currentUser();
    if (!user || !zone) return;

    const orNull = (value: string | null | undefined) => (value ?? '').trim() || null;
    // PUT /api/User/me replaces every editable field, so the others are sent along unchanged.
    const body: UpdateProfileDto = {
      fullName: user.fullName, phoneNumber: orNull(user.phoneNumber), country: orNull(user.country),
      timeZone: zone, gender: orNull(user.gender), dateOfBirth: user.dateOfBirth || null, bio: orNull(user.bio)
    };

    this.status.saving();
    this.users.updateMe(body).subscribe({
      next: () => {
        this.status.saved();
        // The calendar settings repeat the zone; keep the shared copy in step.
        this.calendarData.settings.update(current => (current ? { ...current, timeZone: zone } : current));
      },
      error: err => this.status.failed(apiErrorMessage(err, t('Your time zone could not be saved.')))
    });
  }

  protected readonly secondZone = computed(() => (this.prefs.secondZone() ? this.prefs.secondZoneId() : ''));

  protected setSecondZone(zone: string): void {
    if (zone) this.prefs.secondZoneId.set(zone);
    this.prefs.secondZone.set(!!zone);
    this.status.saved();
  }

  // ── Week, hours, clock (calendar settings on the server) ───────────────────

  protected readonly hour24 = computed(() => this.settings()?.use24HourClock ?? false);

  /** Which of the three work weeks the saved days are, if any. */
  protected readonly week = computed(() => this.weekOf(this.settings()?.workDays ?? []));

  private weekOf(days: DayOfWeekName[]): string | null {
    const key = (list: DayOfWeekName[]) => DAYS.filter(day => list.includes(day)).join();
    return WORK_WEEKS.find(week => key(week.days) === key(days))?.key ?? null;
  }

  protected setWeek(days: DayOfWeekName[]): void {
    this.customWeek.set(false);
    this.patch({ workDays: days });
  }

  protected isWorkDay(day: DayOfWeekName): boolean {
    return this.settings()?.workDays.includes(day) ?? false;
  }

  protected toggleWorkDay(day: DayOfWeekName): void {
    const current = this.settings()?.workDays ?? [];
    const days = current.includes(day) ? current.filter(item => item !== day) : [...current, day];
    // Kept in calendar order, whatever order they were clicked in.
    this.patch({ workDays: DAYS.filter(item => days.includes(item)) });
  }

  /** A week day in the interface language: "Sunday", or "Sun" where there is little room. */
  protected dayName(day: DayOfWeekName, width: 'long' | 'short' = 'long'): string {
    return weekdayLabel(day, width);
  }

  /** The seven days, starting on the day the week starts on. */
  protected readonly orderedDays = computed<DayOfWeekName[]>(() => {
    const start = Math.max(0, DAYS.indexOf(this.settings()?.weekStartsOn ?? 'Sunday'));
    return [...DAYS.slice(start), ...DAYS.slice(0, start)];
  });

  /** Saturday, Sunday and Monday, plus the stored day when it is another one. */
  protected readonly weekStarts = computed<DayOfWeekName[]>(() => {
    const stored = this.settings()?.weekStartsOn;
    return stored && !WEEK_STARTS.includes(stored) ? [...WEEK_STARTS, stored] : WEEK_STARTS;
  });

  /** Every half hour of the day, plus the stored times when they are not on one. */
  protected readonly hourChoices = computed(() => {
    const settings = this.settings();
    const values = new Set<string>();
    for (let minutes = 0; minutes < 1440; minutes += 30) {
      values.add(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
    }
    if (settings) { values.add(settings.workDayStart); values.add(settings.workDayEnd); }
    return [...values].sort().map(value => ({ value, label: formatClock(clockHours(value, 0), this.hour24()) }));
  });

  protected setHours(from: HTMLSelectElement, to: HTMLSelectElement): void {
    const settings = this.settings();
    if (!settings) return;

    if (from.value >= to.value) {
      // Put the pickers back: the selects have already moved.
      from.value = settings.workDayStart;
      to.value = settings.workDayEnd;
      this.status.failed(t('The working day must end after it starts.'));
      return;
    }
    this.patch({ workDayStart: from.value, workDayEnd: to.value });
  }

  // ── New events ─────────────────────────────────────────────────────────────

  /** The usual lengths, plus the stored one when it is not among them. */
  protected readonly eventLengths = computed(() => {
    const stored = this.settings()?.defaultEventMinutes;
    const values = stored && !EVENT_LENGTHS.includes(stored) ? [...EVENT_LENGTHS, stored] : EVENT_LENGTHS;
    return [...values].sort((a, b) => a - b).map(minutes => ({ minutes, label: durationLabel(minutes) }));
  });

  /** The usual reminders, plus the stored one when it is not among them. */
  protected readonly reminderChoices = computed(() => {
    const stored = this.settings()?.defaultReminderMinutes;
    const values = stored != null && !REMINDER_PRESETS.includes(stored)
      ? [...REMINDER_PRESETS, stored]
      : [...REMINDER_PRESETS];
    return values.sort((a, b) => a - b).map(minutes => ({ minutes, label: reminderLabel(minutes) }));
  });

  /** The reminder select holds '' for "no reminder"; the API wants null. */
  protected setReminder(value: string): void {
    this.patch({ defaultReminderMinutes: value === '' ? null : Number(value) });
  }

  /** Saves the calendar settings as a whole (PUT replaces all of them). A failed save puts the row back. */
  protected patch(changes: Partial<CalendarSettingsDto>): void {
    const before = this.settings();
    if (!before) return;

    const next = { ...before, ...changes };
    const request = ++this.saveId;
    this.settings.set(next);
    this.status.saving();

    this.calendarApi.saveSettings(next).subscribe({
      next: saved => {
        if (request !== this.saveId) return;
        // Trust the server's copy when it sends one back.
        const clean = this.clean(saved?.weekStartsOn ? saved : next);
        this.settings.set(clean);
        // The calendar screen reads this, so it follows without a reload.
        this.calendarData.settings.set(clean);
        this.status.saved();
      },
      error: err => {
        if (request !== this.saveId) return;
        this.settings.set(before);
        this.status.failed(apiErrorMessage(err, t('Your calendar settings could not be saved.')));
      }
    });
  }

  /** Times as "HH:mm" exactly, and never a missing list. */
  private clean(settings: CalendarSettingsDto): CalendarSettingsDto {
    return {
      ...settings,
      workDayStart: (settings.workDayStart ?? '09:00').slice(0, 5),
      workDayEnd: (settings.workDayEnd ?? '17:00').slice(0, 5),
      workDays: settings.workDays ?? [],
      defaultReminderMinutes: settings.defaultReminderMinutes ?? null
    };
  }

  // ── Layers kept in this browser ────────────────────────────────────────────

  private readonly place = computed(() => placeForZone(this.users.timeZone()));
  protected readonly hasPlace = computed(() => !!this.place());
  protected readonly method = computed<PrayerMethod>(() => this.prefs.prayerMethod() ?? this.place()?.method ?? 'MWL');

  protected readonly methodHint = computed(() => {
    const place = this.place();
    if (!place) return t('Prayer times are not available for your time zone yet');

    const zone = this.users.timeZone();
    const today = zonedParts(new Date(), zone);
    const times = prayerTimes(today.year, today.month, today.day, place, this.method());
    const at = (name: string, label: string) => {
      const found = times.find(time => time.name === name);
      return found ? t('{prayer} {time}', { prayer: label, time: formatTimeInZone(found.at, zone, this.hour24()) }) : '';
    };
    return t('Times for {city} today: {times}', {
      city: place.city,
      times: [at('Dhuhr', t('Dhuhr')), at('Asr', t('Asr'))].filter(Boolean).join(' · ')
    });
  });

  protected readonly hijriHint = computed(() =>
    t('Today is {date}', { date: hijriFullLabel(new Date(), this.users.timeZone(), this.prefs.hijriCalendar()) }));

  protected togglePrayer(): void {
    this.prefs.prayerTimes.update(on => !on);
    this.status.saved();
  }

  protected setMethod(method: string): void {
    this.prefs.prayerMethod.set(method as PrayerMethod);
    this.status.saved();
  }

  protected toggleHijri(): void {
    this.prefs.hijriDates.update(on => !on);
    this.status.saved();
  }

  protected setHijriCalendar(calendar: string): void {
    this.prefs.hijriCalendar.set(calendar as HijriCalendar);
    this.status.saved();
  }

  // ── Holidays and occasions ─────────────────────────────────────────────────

  protected readonly occasionCountries = OCCASION_COUNTRIES;

  /** The country the profile's time zone is in, when one is known. */
  private readonly zoneCountry = computed(() => countryOfZone(this.users.timeZone()));

  /** "Follow my time zone (Egypt)" */
  protected readonly followLabel = computed(() => {
    const code = this.zoneCountry();
    return code ? t('Follow my time zone ({country})', { country: countryName(code) }) : t('Follow my time zone');
  });

  /** The next public holiday of the chosen country, or why there is none to show. */
  protected readonly occasionsHint = computed(() => {
    const code = this.prefs.occasionsCountry() ?? this.zoneCountry();
    const islamic = this.prefs.hijriDates() || isMuslimMajority(code);
    if (!code) {
      return islamic
        ? t('No country is known for your time zone: Islamic occasions only')
        : t('No country is known for your time zone: pick one here');
    }
    if (!hasHolidays(code)) {
      return islamic
        ? t('No holidays are built in for {country}: Islamic occasions only', { country: countryName(code) })
        : t('No holidays are built in for {country}', { country: countryName(code) });
    }

    const today = zonedParts(new Date(), this.users.timeZone());
    const from = dayKey(today.year, today.month, today.day);
    const next = occasionsBetween(from, dayKey(today.year + 1, today.month, today.day), {
      country: code, hijriCalendar: this.prefs.hijriCalendar(), hijriLayer: this.prefs.hijriDates()
    }).find(occasion => occasion.kind === 'holiday' && occasion.date >= from);
    if (!next) return countryName(code);

    const date = dayMonthLabel(new Date(`${next.date}T00:00:00Z`), 'UTC', 'long');
    return next.mayVary
      ? t('Next public holiday: {name}, {date} (date may vary)', { name: next.name, date })
      : t('Next public holiday: {name}, {date}', { name: next.name, date });
  });

  protected toggleOccasions(): void {
    this.prefs.occasions.update(on => !on);
    this.status.saved();
  }

  /** '' follows the profile's time zone. */
  protected setOccasionsCountry(code: string): void {
    this.prefs.occasionsCountry.set(code || null);
    this.status.saved();
  }
}
