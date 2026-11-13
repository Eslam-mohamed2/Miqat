import { Injectable, WritableSignal, signal } from '@angular/core';

import { HijriCalendar } from '../utils/hijri';
import { PrayerMethod } from '../utils/prayer-times';

const STORAGE_PREFIX = 'miqat.pref.';

/**
 * Display choices the API has no field for, kept in this browser (localStorage):
 * the calendar layers, the second time zone, planning guardrails and the like.
 *
 * Everything the server does store (week start, working hours, work days, 24-hour
 * clock, notification switches, theme) stays where it is; this is only for the rest.
 *
 *   readonly prefs = inject(LocalPrefsService);
 *   prefs.prayerTimes()            // read
 *   prefs.prayerTimes.set(false)   // write: saved straight away
 *
 * A screen with a choice of its own asks for a named one:
 *   readonly wipLimit = this.prefs.value('board.wip.InProgress', 3);
 */
@Injectable({ providedIn: 'root' })
export class LocalPrefsService {
  private cache = new Map<string, WritableSignal<unknown>>();

  // ── Calendar layers (calendar side panel, Settings → Calendar and time) ────
  /** Prayer times as a quiet layer on the calendar. */
  readonly prayerTimes = this.value('layers.prayerTimes', true);
  /** null follows the method normally used in the user's time zone. */
  readonly prayerMethod = this.value<PrayerMethod | null>('layers.prayerMethod', null);
  /** Hijri date next to every Gregorian date. */
  readonly hijriDates = this.value('layers.hijriDates', true);
  readonly hijriCalendar = this.value<HijriCalendar>('layers.hijriCalendar', 'islamic-umalqura');
  /** A second column of hours in day and week views. */
  readonly secondZone = this.value('layers.secondZone', false);
  /** IANA name of that second zone. */
  readonly secondZoneId = this.value('layers.secondZoneId', 'Europe/London');
  /** Public holidays and special occasions as a quiet layer on the calendar. */
  readonly occasions = this.value('layers.occasions', true);
  /** ISO code of the country whose holidays show; null follows the profile's time zone. */
  readonly occasionsCountry = this.value<string | null>('layers.occasionsCountry', null);

  // ── Planning guardrails (Plan my day, Settings → Planning and focus) ───────
  /** Leave 10 minutes free after every meeting. */
  readonly bufferAfterMeetings = this.value('plan.bufferAfterMeetings', true);
  /** Do not place work across a prayer time. */
  readonly planAroundPrayer = this.value('plan.aroundPrayer', true);
  /** Keep the lunch hour free. */
  readonly protectLunch = this.value('plan.protectLunch', true);
  /** "HH:mm" */
  readonly lunchStart = this.value('plan.lunchStart', '13:00');
  readonly lunchEnd = this.value('plan.lunchEnd', '14:00');
  /** Warn when meetings pass this many hours in a day. */
  readonly capMeetings = this.value('plan.capMeetings', false);
  readonly meetingCapHours = this.value('plan.meetingCapHours', 4);

  /**
   * A saved value by name. The same name always returns the same signal, so two
   * screens that show one choice stay in step. `fallback` is what a browser that
   * has never saved it gets.
   */
  value<T>(key: string, fallback: T): WritableSignal<T> {
    const cached = this.cache.get(key);
    if (cached) return cached as WritableSignal<T>;

    const inner = signal<T>(this.read(key, fallback));
    const set = inner.set.bind(inner);

    // Every write goes through set(), so saving there covers update() too.
    inner.set = (next: T) => {
      set(next);
      this.write(key, next);
    };
    inner.update = (change: (current: T) => T) => inner.set(change(inner()));

    this.cache.set(key, inner as WritableSignal<unknown>);
    return inner;
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      // Private browsing, blocked storage or a value from an older build.
      return fallback;
    }
  }

  private write<T>(key: string, value: T): void {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch {
      /* The choice still applies for this visit. */
    }
  }
}
