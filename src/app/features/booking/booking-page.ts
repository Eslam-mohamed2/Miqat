import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { cityOfZone, zoneLabel } from '../../authentication/local-place';
import { locale, num, t, tCount } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { ThemeService } from '../../core/services/theme.service';
import { MiqatLogo } from '../../shared/logo/miqat-logo';
import {
  browserTimeZone, dayKeyInZone, dayKeyOfCell, timeInputInZone, todayInZone, zonedParts
} from '../../core/utils/time-zone';

/** A public booking link: what its owner offers, and when. */
export interface BookingLink {
  /** "Eslam Mohamed" */
  hostName: string;
  /** What is being booked: "Sprint review". */
  title: string;
  description: string;
  durationMinutes: number;
  /** How the meeting is held: "Google Meet, link sent on booking". */
  place: string;
  /** IANA name of the owner's time zone. */
  hostZone: string;
  /** The days the owner does not work (0 is Sunday). */
  weekend: number[];
  /** The start of every time that is still free, as ISO instants. */
  openTimes: string[];
}

// Names of days and months in the interface language. The dates handed in are
// calendar cells (plain local dates), so they are read as they stand.
const dayName = (day: number, weekday: 'long' | 'narrow') =>
  new Intl.DateTimeFormat(locale(), { weekday, timeZone: 'UTC' }).format(Date.UTC(2026, 10, 8 + day));
const monthName = (month: number) =>
  new Intl.DateTimeFormat(locale(), { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, month, 15));

/** Minutes a zone is ahead of UTC at an instant. */
function offsetMinutes(at: Date, zone: string): number {
  const p = zonedParts(at, zone);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - at.getTime()) / 60000);
}

/**
 * The public booking page, /book/:handle (design/miqat-2.0: V2-Booking).
 *
 * The API has no booking links yet, so no handle has a page behind it and the screen
 * says so. The designed page is all here and draws only from a `BookingLink`: when
 * the API can answer for a handle, setting `link` is all that is missing.
 */
@Component({
  selector: 'app-booking-page',
  standalone: true,
  imports: [RouterLink, MiqatLogo, TPipe],
  templateUrl: './booking-page.html',
  styleUrl: './booking-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingPage {
  private route = inject(ActivatedRoute);

  readonly handle = toSignal(this.route.paramMap.pipe(map(params => params.get('handle') ?? '')), { initialValue: '' });
  /** The address of this page, as the visitor was given it. */
  readonly address = computed(() => `${location.host}/book/${this.handle()}`);

  /** The link behind the handle; null while there is none to show. */
  readonly link = signal<BookingLink | null>(null);

  /** "S M T W T F S" */
  readonly weekdays = Array.from({ length: 7 }, (_, day) => dayName(day, 'narrow'));
  readonly visitorZone = browserTimeZone();

  // ── What the visitor has picked ─────────────────────────────────────────────
  /** Whose clock the times are shown on. */
  readonly zoneChoice = signal<'visitor' | 'host'>('visitor');
  /** First day of the month on show; null follows the first open time. */
  private monthChoice = signal<Date | null>(null);
  /** `yyyy-mm-dd` of the chosen day; null follows the first day with open times. */
  private dayChoice = signal<string | null>(null);
  readonly slotIndex = signal(0);

  readonly zone = computed(() => (this.zoneChoice() === 'host' ? this.link()?.hostZone ?? this.visitorZone : this.visitorZone));
  readonly sameZone = computed(() => {
    const link = this.link();
    return !link || offsetMinutes(new Date(), link.hostZone) === offsetMinutes(new Date(), this.visitorZone);
  });

  readonly firstName = computed(() => this.link()?.hostName.trim().split(/\s+/)[0] ?? '');
  /** "45 minutes" */
  readonly duration = computed(() => tCount(this.link()?.durationMinutes ?? 0, '{n} minute', '{n} minutes'));
  readonly keptBy = computed(() => t('{name}’s calendar is kept by Miqat. Only free times are shown.', { name: this.firstName() }));
  readonly initials = computed(() => {
    const words = (this.link()?.hostName ?? '').trim().split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '').slice(0, 2)).toUpperCase();
  });

  /** Open times that are still ahead, by the day they fall on in the zone on show. */
  private openByDay = computed(() => {
    const byDay = new Map<string, Date[]>();
    const now = Date.now();
    const zone = this.zone();
    for (const iso of this.link()?.openTimes ?? []) {
      const at = new Date(iso);
      if (Number.isNaN(at.getTime()) || at.getTime() <= now) continue;
      const key = dayKeyInZone(at, zone);
      byDay.set(key, [...(byDay.get(key) ?? []), at]);
    }
    for (const times of byDay.values()) times.sort((a, b) => a.getTime() - b.getTime());
    return byDay;
  });

  readonly day = computed(() => {
    const open = this.openByDay();
    const chosen = this.dayChoice();
    if (chosen && open.has(chosen)) return chosen;
    return [...open.keys()].sort()[0] ?? null;
  });

  readonly month = computed(() => {
    const chosen = this.monthChoice();
    if (chosen) return chosen;
    const day = this.day();
    if (day) return new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, 1);
    const today = todayInZone(this.zone());
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  /** "November 2026" */
  readonly monthTitle = computed(() => t('{month} {year}', {
    month: monthName(this.month().getMonth()),
    year: num(this.month().getFullYear())
  }));

  /** The month as whole weeks from Sunday, with the days around it that complete them. */
  readonly cells = computed(() => {
    const month = this.month();
    const open = this.openByDay();
    const selected = this.day();
    const todayKey = dayKeyOfCell(todayInZone(this.zone()));
    const first = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const count = Math.ceil((month.getDay() + daysInMonth) / 7) * 7;

    return Array.from({ length: count }, (_, index) => {
      const cell = new Date(first.getFullYear(), first.getMonth(), first.getDate() + index);
      const key = dayKeyOfCell(cell);
      const inMonth = cell.getMonth() === month.getMonth();
      const has = inMonth && open.has(key);
      return {
        key,
        day: num(cell.getDate()),
        has,
        on: has && key === selected,
        today: inMonth && key === todayKey,
        label: t(has ? '{day} {month}, times available' : '{day} {month}, unavailable', {
          day: cell.getDate(),
          month: monthName(cell.getMonth())
        })
      };
    });
  });

  readonly dayTitle = computed(() => {
    const day = this.day();
    if (!day) return '';
    const cell = new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
    return t('{weekday}, {day} {month}', {
      weekday: dayName(cell.getDay(), 'long'),
      day: cell.getDate(),
      month: monthName(cell.getMonth())
    });
  });

  /** "Detected: London (GMT). Eslam is in Cairo, 2 h ahead." */
  readonly zoneNote = computed(() => {
    const link = this.link();
    if (!link) return '';
    const name = this.firstName();
    if (this.zoneChoice() === 'host') return t('{zone}, {name}’s time zone.', { zone: zoneLabel(link.hostZone), name });

    const now = new Date();
    const ahead = (offsetMinutes(now, link.hostZone) - offsetMinutes(now, this.visitorZone)) / 60;
    const zone = zoneLabel(this.visitorZone);
    if (!ahead) return t('Detected: {zone}. {name} is on the same time.', { zone, name });
    return t(ahead > 0
      ? 'Detected: {zone}. {name} is in {city}, {hours} h ahead.'
      : 'Detected: {zone}. {name} is in {city}, {hours} h behind.',
      { zone, name, city: cityOfZone(link.hostZone), hours: Math.abs(ahead) });
  });

  readonly zoneChoices = computed(() => {
    const link = this.link();
    if (!link) return [];
    return [
      { id: 'visitor' as const, label: t('{zone} · detected', { zone: cityOfZone(this.visitorZone) }) },
      { id: 'host' as const, label: cityOfZone(link.hostZone) }
    ];
  });

  /** The open times of the chosen day: "10:00 – 10:45". */
  readonly slots = computed(() => {
    const link = this.link();
    const day = this.day();
    if (!link || !day) return [];
    const zone = this.zone();
    return (this.openByDay().get(day) ?? []).map(start => {
      const end = new Date(start.getTime() + link.durationMinutes * 60000);
      return t('{start} – {end}', { start: num(timeInputInZone(start, zone)), end: num(timeInputInZone(end, zone)) });
    });
  });

  readonly chosenSlot = computed(() => Math.min(this.slotIndex(), Math.max(0, this.slots().length - 1)));

  /** "Fridays and Saturdays are Eslam’s weekend." */
  readonly weekendNote = computed(() => {
    const link = this.link();
    if (!link?.weekend.length) return '';
    const days = [...link.weekend].sort((a, b) => ((a + 2) % 7) - ((b + 2) % 7))
      // "Fridays"
      .map(day => t('{day}s', { day: dayName(day, 'long') }));
    const list = days.length > 1
      ? t('{first} and {last}', { first: days.slice(0, -1).join(t(', ')), last: days[days.length - 1] })
      : days[0];
    return t(days.length > 1 ? '{days} are {name}’s weekend.' : '{days} is {name}’s weekend.', { days: list, name: this.firstName() });
  });

  constructor() {
    // Creating the service applies the saved theme; this page is outside the app shell.
    inject(ThemeService);
  }

  pickDay(key: string): void {
    this.dayChoice.set(key);
    this.slotIndex.set(0);
  }

  stepMonth(by: number): void {
    const month = this.month();
    this.monthChoice.set(new Date(month.getFullYear(), month.getMonth() + by, 1));
  }
}
