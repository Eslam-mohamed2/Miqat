import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, forkJoin, of, tap } from 'rxjs';

import { Language, currentLanguage, locale, num, setLanguage, t } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { CalendarDataService } from '../../core/services/calendar-data.service';
import { CalendarService } from '../../core/services/calendar.service';
import { LocalPrefsService } from '../../core/services/local-prefs.service';
import { UserService } from '../../core/services/user.service';
import { hijriDate } from '../../core/utils/hijri';
import { PRAYER_METHODS, PrayerMethod, placeForZone, prayerLabel, prayerTimes } from '../../core/utils/prayer-times';
import { browserTimeZone, isValidTimeZone, todayInZone, zonedParts, zonedTimeToUtc } from '../../core/utils/time-zone';
import { CalendarSettingsDto, DayOfWeekName, UserDto } from '../../models/api.models';
import { AuthShell } from '../auth-shell/auth-shell';
import { cityOfZone, zoneLabel } from '../local-place';
import { authError } from '../server-text';

type WorkWeek = 'sun' | 'mon' | 'sat';

const DAYS: DayOfWeekName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The short name of a day of the week (0 is Sunday) in the interface language: "Sun", "الأحد". */
const dayShort = (day: number) =>
  new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, 10, 8 + day));

/** The three work weeks on offer: the label, the first day, and the days worked (0 is Sunday). */
const WEEKS: { id: WorkWeek; label: string; start: DayOfWeekName; days: number[] }[] = [
  { id: 'sun' as const, start: 'Sunday' as const, days: [0, 1, 2, 3, 4] },
  { id: 'mon' as const, start: 'Monday' as const, days: [1, 2, 3, 4, 5] },
  { id: 'sat' as const, start: 'Saturday' as const, days: [6, 0, 1, 2, 3] }
].map(week => ({
  ...week,
  // "Sun – Thu"
  label: t('{from} – {to}', { from: dayShort(week.days[0]), to: dayShort(week.days[week.days.length - 1]) })
}));

/**
 * Where the choices on this screen wait while the page reloads in the other
 * language, so that picking a language does not undo them.
 */
const DRAFT_KEY = 'miqat.setup.draft';

interface Draft {
  zone: string;
  week: WorkWeek;
  prayer: boolean;
  hijri: boolean;
  method: PrayerMethod | null;
  chosen: ('zone' | 'week')[];
}

function takeDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    sessionStorage.removeItem(DRAFT_KEY);
    const draft = raw ? (JSON.parse(raw) as Draft) : null;
    // Only a draft this screen can show: a known week and a zone the browser knows.
    return draft && WEEKS.some(week => week.id === draft.week) && isValidTimeZone(draft.zone) ? draft : null;
  } catch {
    return null;
  }
}

/**
 * "Set up your week": the last step of signing up (design/miqat-2.0: V2-SignIn).
 * The time zone goes to the profile, the work week to the calendar settings, and the
 * choices the API has no field for (prayer times, Hijri dates) to this browser.
 * The language is the interface's own (core/i18n): picking the other one reloads this
 * screen in it, with the choices made so far still in place.
 */
@Component({
  selector: 'app-setup-week',
  standalone: true,
  imports: [AuthShell, TPipe],
  templateUrl: './setup-week.html',
  styleUrl: './setup-week.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SetupWeek {
  private router = inject(Router);
  private users = inject(UserService);
  private calendar = inject(CalendarService);
  private calendarData = inject(CalendarDataService);
  private prefs = inject(LocalPrefsService);

  /** What was chosen here before the page reloaded in the other language. */
  private draft = takeDraft();

  readonly weeks = WEEKS;
  readonly methods = (Object.keys(PRAYER_METHODS) as PrayerMethod[])
    .map(value => ({ value, label: PRAYER_METHODS[value].label }));
  // Each language is named in itself, so the person it is for can read it.
  readonly languages: { id: Language; label: string }[] = [
    { id: 'en', label: 'English' }, { id: 'ar', label: 'العربية' }
  ];
  readonly language = currentLanguage();

  readonly detectedZone = browserTimeZone();

  // ── What is on the server ───────────────────────────────────────────────────
  private me = signal<UserDto | null>(null);
  /** null on an API build without calendar settings: the work week is then not saved. */
  private settings = signal<CalendarSettingsDto | null>(null);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');

  // ── The choices on this screen ──────────────────────────────────────────────
  readonly zone = signal(this.draft?.zone ?? this.detectedZone);
  readonly week = signal<WorkWeek>(this.draft?.week ?? 'sun');
  readonly prayer = signal(this.draft?.prayer ?? this.prefs.prayerTimes());
  readonly hijri = signal(this.draft?.hijri ?? this.prefs.hijriDates());
  /** null follows the method normally used in the chosen time zone. */
  private methodChoice = signal<PrayerMethod | null>(this.draft ? this.draft.method : this.prefs.prayerMethod());
  /** What the visitor already changed: the account's own values, arriving later, leave those alone. */
  private chosen = new Set<'zone' | 'week'>(this.draft?.chosen ?? []);

  private place = computed(() => placeForZone(this.zone()));
  readonly method = computed<PrayerMethod>(() => this.methodChoice() ?? this.place()?.method ?? 'Egyptian');

  /** Every time zone the browser knows, by city, with the device's own first. */
  readonly zones = computed(() => {
    const names = new Set<string>(this.supportedZones());
    names.add(this.detectedZone);
    // The account's own zone may be an older name the browser no longer lists.
    const own = this.me()?.timeZone;
    if (isValidTimeZone(own)) names.add(own.trim());
    return [...names]
      .map(value => ({
        value,
        label: value === this.detectedZone ? t('{zone} · detected', { zone: zoneLabel(value) }) : zoneLabel(value),
        detected: value === this.detectedZone
      }))
      .sort((a, b) => Number(b.detected) - Number(a.detected) || a.label.localeCompare(b.label, locale()));
  });

  // ── The preview in the side panel ───────────────────────────────────────────
  /** This week, Sunday to Saturday, as it falls in the chosen time zone. */
  readonly previewDays = computed(() => {
    const zone = this.zone();
    const today = todayInZone(zone);
    const worked = WEEKS.find(week => week.id === this.week())!.days;

    return DAYS.map((_, index) => {
      const cell = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() + index);
      // Noon of that day in the zone: an instant that is safely inside the day.
      const noon = zonedTimeToUtc(cell.getFullYear(), cell.getMonth() + 1, cell.getDate(), 12, 0, zone);
      return {
        // Seven narrow cells: Arabic names go without their article, as in the design ("أحد").
        dow: dayShort(index).replace(/^ال/, ''),
        day: num(cell.getDate()),
        hijri: num(hijriDate(noon, zone, this.prefs.hijriCalendar()).day),
        today: index === today.getDay(),
        work: worked.includes(index)
      };
    });
  });

  /** "Working hours 09:00 – 17:00 · Cairo", once the calendar settings are known. */
  readonly previewHours = computed(() => {
    const settings = this.settings();
    if (!settings) return '';
    return t('Working hours {start} – {end} · {city}', {
      start: num(settings.workDayStart.slice(0, 5)),
      end: num(settings.workDayEnd.slice(0, 5)),
      city: cityOfZone(this.zone())
    });
  });

  /** Today's prayer times in the chosen zone; empty when its city is not known. */
  readonly previewPrayers = computed(() => {
    const place = this.place();
    if (!place) return [];
    const zone = this.zone();
    const today = todayInZone(zone);
    const times = prayerTimes(today.getFullYear(), today.getMonth() + 1, today.getDate(), place, this.method())
      .filter(prayer => prayer.name !== 'Sunrise');
    const now = Date.now();
    // After the last one of the day, the next prayer is tomorrow's first.
    const next = times.find(prayer => prayer.at.getTime() > now) ?? times[0];

    return times.map(prayer => {
      const { hour, minute } = zonedParts(prayer.at, zone);
      return {
        name: prayerLabel(prayer.name),
        time: num(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`),
        next: prayer === next
      };
    });
  });

  readonly previewCity = computed(() => cityOfZone(this.zone()));

  constructor() {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    forkJoin({
      me: this.users.getMe(),
      // 404: the server has no calendar settings (an older build).
      settings: this.calendar.getSettings().pipe(catchError(() => of(null)))
    }).pipe(
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: ({ me, settings }) => {
        this.me.set(me);
        this.settings.set(settings);

        // A zone already chosen for the account wins over the device's. "UTC" is
        // what an account gets when it never said, so it does not count.
        if (!this.chosen.has('zone') && isValidTimeZone(me.timeZone) && me.timeZone !== 'UTC') {
          this.zone.set(me.timeZone.trim());
        }

        const known = settings && WEEKS.find(week =>
          week.start === settings.weekStartsOn
          && week.days.length === settings.workDays.length
          && week.days.every(day => settings.workDays.includes(DAYS[day])));
        if (known && !this.chosen.has('week')) this.week.set(known.id);
      },
      error: err => this.errorMessage.set(authError(err, 'Could not load your account. Please try again.'))
    });
  }

  pickZone(value: string): void {
    this.chosen.add('zone');
    this.zone.set(value);
  }

  pickWeek(week: WorkWeek): void {
    this.chosen.add('week');
    this.week.set(week);
  }

  pickMethod(value: string): void {
    this.methodChoice.set(value as PrayerMethod);
  }

  /**
   * English or Arabic: the whole interface changes, so the page reloads (core/i18n).
   * The choices made so far are put aside first and picked up again after the reload.
   */
  pickLanguage(language: Language): void {
    if (language === this.language) return;
    const draft: Draft = {
      zone: this.zone(),
      week: this.week(),
      prayer: this.prayer(),
      hijri: this.hijri(),
      method: this.methodChoice(),
      chosen: [...this.chosen]
    };
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* Private browsing: the screen then starts again from the account's values. */
    }
    setLanguage(language);
  }

  /** "Start with today": saves every choice, then opens the calendar. */
  start(): void {
    if (this.isSaving() || this.isLoading()) return;

    const me = this.me();
    if (!me) {
      this.load();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');

    const zone = this.zone();
    const week = WEEKS.find(item => item.id === this.week())!;
    const settings = this.settings();
    const saves: Observable<unknown>[] = [];

    if (me.timeZone !== zone) {
      saves.push(this.users.updateMe({
        fullName: me.fullName,
        phoneNumber: me.phoneNumber || null,
        country: me.country || null,
        timeZone: zone,
        gender: me.gender || null,
        dateOfBirth: me.dateOfBirth || null,
        bio: me.bio ?? null
      }));
    }

    if (settings) {
      const next: CalendarSettingsDto = {
        ...settings,
        weekStartsOn: week.start,
        // Kept in calendar order, as the settings screen sends them.
        workDays: DAYS.filter((_, index) => week.days.includes(index))
      };
      saves.push(this.calendar.saveSettings(next).pipe(
        // The calendar screen reads this, so it opens with the new week.
        tap(saved => this.calendarData.settings.set(saved?.weekStartsOn ? saved : next))
      ));
    }

    (saves.length ? forkJoin(saves) : of([])).pipe(
      finalize(() => this.isSaving.set(false))
    ).subscribe({
      next: () => {
        this.prefs.prayerTimes.set(this.prayer());
        this.prefs.prayerMethod.set(this.methodChoice());
        this.prefs.hijriDates.set(this.hijri());
        this.router.navigateByUrl('/calendar');
      },
      error: err => this.errorMessage.set(authError(err, 'Could not save your week. Please try again.'))
    });
  }

  private supportedZones(): string[] {
    try {
      const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
        .supportedValuesOf?.('timeZone');
      if (supported?.length) return supported;
    } catch {
      /* fall through to the short list */
    }
    return [
      'UTC', 'Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
      'Asia/Karachi', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo'
    ];
  }
}
