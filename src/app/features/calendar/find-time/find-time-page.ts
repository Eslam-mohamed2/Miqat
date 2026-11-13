import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AuthService } from '../../../core/services/auth.service';
import { CalendarDataService } from '../../../core/services/calendar-data.service';
import { EventService } from '../../../core/services/event.service';
import { LocalPrefsService } from '../../../core/services/local-prefs.service';
import { ScheduleService } from '../../../core/services/schedule.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserService } from '../../../core/services/user.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { num, t, tCount } from '../../../core/i18n/i18n';
import { NumPipe, TCountPipe, TPipe } from '../../../core/i18n/t.pipe';
import { ContactDto, TimeSlotDto, UserAvailabilityDto } from '../../../models/api.models';
import { formatDuration } from '../../../core/utils/task-estimate';
import {
  dayKeyInZone, dayKeyOfCell, formatTimeInZone, timeZoneCity, todayInZone, zonedParts
} from '../../../core/utils/time-zone';
import { CalendarBoard } from '../calendar-board.service';
import { dateWords, initialsOf, weekdayName, zoneDifferenceLabel, zoneOffsetMinutes } from '../calendar-layout';

const MINUTE = 60_000;
/** Working days the screen looks at, and how many suggestions it lists. */
const DAYS_AHEAD = 5;
const BEST_TIMES = 4;
/** Free time is drawn and tested a quarter of an hour at a time. */
const STEP = 15;

/** "30 min", "45 min", "1 h" */
const DURATIONS = [30, 45, 60].map(minutes => ({ minutes, label: formatDuration(minutes) }));

interface Bar {
  left: number;
  width: number;
}

interface DayTab {
  cell: Date;
  key: string;
  dow: string;
  number: number;
  label: string;
  /** Suggested times on this day. */
  count: number;
}

/** A time the server found free for everyone, as the list shows it. */
interface BestTime {
  slot: TimeSlotDto;
  start: Date;
  end: Date;
  dayIndex: number;
  /** "Sun 15 Nov · 13:00–13:45" */
  when: string;
  badge: string;
  why: string;
}

/**
 * "Find a time" (design/miqat-2.0: V2-FindTime): the next working days of the
 * people picked, when each is busy, when all are free, and the best times to
 * meet. A time can be sent as an invitation or copied as text.
 */
@Component({
  selector: 'app-find-time-page',
  standalone: true,
  imports: [RouterLink, TPipe, TCountPipe, NumPipe],
  templateUrl: './find-time-page.html',
  styleUrl: './find-time-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FindTimePage {
  private schedule = inject(ScheduleService);
  private events = inject(EventService);
  private users = inject(UserService);
  private data = inject(CalendarDataService);
  private prefs = inject(LocalPrefsService);
  private toasts = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private readonly myId = inject(AuthService).getCurrentUserId();
  readonly board = inject(CalendarBoard);

  /**
   * What a link to this page asked for: `?with=<id>[,<id>]` (who to meet),
   * `?title=` (what for) and `?minutes=` (how long). A person's profile, the
   * command palette and the inbox link here that way.
   */
  private readonly asked = this.readLink();

  /** The lengths on offer: the usual three, and the one a link asked for when it is none of them. */
  readonly durations = this.asked.minutes && !DURATIONS.some(choice => choice.minutes === this.asked.minutes)
    ? [...DURATIONS, { minutes: this.asked.minutes, label: formatDuration(this.asked.minutes) }]
        .sort((a, b) => a.minutes - b.minutes)
    : DURATIONS;

  readonly title = signal(this.asked.title);
  readonly duration = signal(this.asked.minutes ?? 45);
  /** The people to meet, besides the user. */
  readonly guests = signal<ContactDto[]>([]);
  readonly contacts = signal<ContactDto[]>([]);
  readonly query = signal('');
  readonly listOpen = signal(false);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly sending = signal(false);
  private readonly availability = signal<UserAvailabilityDto[]>([]);
  private readonly slots = signal<TimeSlotDto[]>([]);

  /** The day on show; null follows the chosen time. */
  private readonly dayPicked = signal<number | null>(null);
  readonly pickIndex = signal(0);

  readonly zoneCity = computed(() => timeZoneCity(this.board.zone()));

  /** The next working days, today included while it is one. */
  readonly days = computed<DayTab[]>(() => {
    const workDays = this.board.workDays();
    const today = todayInZone(this.board.zone());
    const days: DayTab[] = [];
    for (let offset = 0; days.length < DAYS_AHEAD && offset < 21; offset++) {
      const cell = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      if (!workDays.has(cell.getDay())) continue;
      const key = dayKeyOfCell(cell);
      days.push({
        cell, key,
        dow: weekdayName(cell.getDay()),
        number: cell.getDate(),
        label: t('{weekday} {day} {month}', dateWords(cell, { weekday: 'long', day: 'numeric', month: 'long' })),
        count: 0
      });
    }
    return days;
  });

  /** The hours drawn: from an hour before the working day to two after it. */
  private readonly window = computed(() => {
    const start = Math.max(0, Math.floor(this.board.workStart() / 60) - 1);
    const end = Math.min(24, Math.ceil(this.board.workEnd() / 60) + 2);
    return { start: start * 60, end: Math.max(end, start + 4) * 60 };
  });

  readonly ticks = computed(() => {
    const { start, end } = this.window();
    const hour24 = this.board.hour24();
    const hours = (end - start) / 60;
    return Array.from({ length: hours + 1 }, (_, index) => {
      const hour = start / 60 + index;
      const label = hour24
        ? num(`${String(hour).padStart(2, '0')}:00`)
        : hour % 24 < 12 ? t('{h} AM', { h: hour % 12 || 12 }) : t('{h} PM', { h: hour % 12 || 12 });
      return { left: index / hours * 100, label: index % 2 === 0 ? label : '' };
    });
  });

  // ── Suggestions ────────────────────────────────────────────────────────────

  /** The server's free times on the days shown, without the ones a prayer falls in. */
  private readonly usable = computed(() => {
    const zone = this.board.zone();
    const days = this.days();
    const aroundPrayer = this.board.prayerOn() && this.prefs.planAroundPrayer();

    return this.slots()
      .map(slot => {
        const start = new Date(slot.start);
        const end = new Date(slot.end);
        return { slot, start, end, dayIndex: days.findIndex(day => day.key === dayKeyInZone(start, zone)) };
      })
      .filter(time => time.dayIndex >= 0)
      .filter(time => !aroundPrayer || !this.board.prayersOn(days[time.dayIndex].cell)
        .some(prayer => prayer.at.getTime() >= time.start.getTime() && prayer.at.getTime() < time.end.getTime()));
  });

  readonly dayTabs = computed<DayTab[]>(() => {
    const usable = this.usable();
    return this.days().map((day, index) => ({ ...day, count: usable.filter(time => time.dayIndex === index).length }));
  });

  /**
   * The best of them, ranked as the design does: early afternoon first, then the
   * time with the most room around it, then the soonest.
   */
  readonly best = computed<BestTime[]>(() => {
    const zone = this.board.zone();
    const hour24 = this.board.hour24();
    const others = this.availability().filter(person => person.userId !== this.myId);
    const hourOf = (date: Date) => {
      const parts = zonedParts(date, zone);
      return parts.hour + parts.minute / 60;
    };
    const afternoon = (date: Date) => hourOf(date) >= 13 && hourOf(date) <= 15 ? 1 : 0;

    return this.usable()
      .map(time => ({ ...time, room: this.roomAfter(time.dayIndex, time.end) }))
      .sort((a, b) => afternoon(b.start) - afternoon(a.start) || b.room - a.room || a.start.getTime() - b.start.getTime())
      .slice(0, BEST_TIMES)
      .map((time, index) => {
        const hour = hourOf(time.start);
        const elsewhere = others
          .filter(person => zoneOffsetMinutes(person.timeZone, time.start) !== zoneOffsetMinutes(zone, time.start))
          .slice(0, 2)
          .map(person => t('{name} at {time} {city}', {
            name: (person.fullName || t('A guest')).split(' ')[0],
            time: formatTimeInZone(time.start, person.timeZone, hour24),
            city: timeZoneCity(person.timeZone)
          }));

        return {
          slot: time.slot, start: time.start, end: time.end, dayIndex: time.dayIndex,
          when: this.whenLabel(time.start, time.end),
          badge: index === 0 ? t('Best') : hour >= 12 && hour <= 15 ? t('Good') : t('Possible'),
          why: [
            others.length ? t('Everyone inside working hours') : t('Inside your working hours'),
            time.room >= STEP ? t('room to run over') : t('tight fit'),
            ...elsewhere
          ].join(' · ')
        };
      });
  });

  readonly chosen = computed<BestTime | null>(() => {
    const best = this.best();
    return best[Math.min(this.pickIndex(), best.length - 1)] ?? null;
  });

  readonly dayIndex = computed(() => this.dayPicked() ?? this.chosen()?.dayIndex ?? 0);

  /** "Sun 13:00", for the button. */
  readonly chosenShort = computed(() => {
    const chosen = this.chosen();
    return chosen ? t('{day} {time}', { day: this.days()[chosen.dayIndex].dow, time: this.board.time(chosen.start) }) : '';
  });

  /** "Send invite for Sun 13:00", or what stands in its way. */
  readonly sendLabel = computed(() => {
    if (this.sending()) return t('Sending…');
    if (!this.chosen()) return t('Pick a time first');
    const when = this.chosenShort();
    return this.guests().length ? t('Send invite for {when}', { when }) : t('Add to my calendar for {when}', { when });
  });

  // ── The day on show ────────────────────────────────────────────────────────

  private dayStart(index: number): number {
    return this.board.instantOn(this.days()[index].cell, this.window().start).getTime();
  }

  /** Where a stretch of time sits on the day's bar, in percent; null when it is outside. */
  private bar(index: number, from: number, to: number): Bar | null {
    const span = (this.window().end - this.window().start) * MINUTE;
    const origin = this.dayStart(index);
    const start = Math.max(from, origin);
    const end = Math.min(to, origin + span);
    if (end <= start) return null;
    return { left: (start - origin) / span * 100, width: (end - start) / span * 100 };
  }

  /** The user's row first, then the people picked, each with their busy times. */
  readonly rows = computed(() => {
    const index = this.dayIndex();
    const zone = this.board.zone();
    const day = this.days()[index];
    const origin = this.dayStart(index);
    const byId = new Map(this.availability().map(person => [person.userId, person]));
    const me = this.users.currentUser();

    const row = (id: string, name: string, picture: string | null | undefined, mine: boolean) => {
      const person = byId.get(id);
      const personZone = person?.timeZone ?? (mine ? zone : '');
      const difference = personZone ? zoneDifferenceLabel(personZone, zone, new Date(origin)) : '';
      const place = personZone ? timeZoneCity(personZone) : '';
      return {
        id,
        name,
        initials: initialsOf(name),
        picture: picture || null,
        mine,
        note: mine
          ? [place, t('you')].filter(Boolean).join(' · ')
          : [place, difference].filter(Boolean).join(' · ') || t('Time zone not shared'),
        // Only the user's own working hours are known here.
        off: mine ? this.offHours(index) : [],
        busy: (person?.busy ?? [])
          .map(slot => this.bar(index, new Date(slot.start).getTime(), new Date(slot.end).getTime()))
          .filter((bar): bar is Bar => !!bar)
      };
    };

    return {
      day,
      people: [
        row(this.myId ?? me?.id ?? '', me?.fullName || t('You'), me?.profilePictureUrl, true),
        ...this.guests().map(guest => row(guest.id, guest.fullName, guest.profilePictureUrl, false))
      ]
    };
  });

  /** The parts of the day's bar outside the user's working hours. */
  private offHours(index: number): Bar[] {
    const { start, end } = this.window();
    const span = end - start;
    const from = Math.min(Math.max(this.board.workStart(), start), end);
    const to = Math.min(Math.max(this.board.workEnd(), start), end);
    const bars: Bar[] = [];
    if (from > start) bars.push({ left: 0, width: (from - start) / span * 100 });
    if (to < end) bars.push({ left: (to - start) / span * 100, width: (end - to) / span * 100 });
    return bars;
  }

  /**
   * When nobody is busy, inside the user's working hours and, when the user plans
   * around prayer, clear of the quarter hour after each prayer time.
   */
  private freeMinutes(index: number): [number, number][] {
    const day = this.days()[index];
    const midnight = this.board.instantOn(day.cell, 0).getTime();
    const busy = this.availability().flatMap(person => person.busy)
      .map(slot => [new Date(slot.start).getTime(), new Date(slot.end).getTime()] as const);
    const prayers = this.board.prayerOn() && this.prefs.planAroundPrayer()
      ? this.board.prayersOn(day.cell).map(prayer => prayer.minute)
      : [];
    const now = Date.now();

    const from = Math.max(this.window().start, this.board.workStart());
    const to = Math.min(this.window().end, this.board.workEnd());
    const segments: [number, number][] = [];
    let current: [number, number] | null = null;

    for (let minute = Math.ceil(from / STEP) * STEP; minute + STEP <= to; minute += STEP) {
      const start = midnight + minute * MINUTE;
      const end = start + STEP * MINUTE;
      const free = start >= now
        && !busy.some(([busyStart, busyEnd]) => busyStart < end && busyEnd > start)
        && !prayers.some(prayer => minute < prayer + STEP && minute + STEP > prayer);

      if (free) {
        if (current) current[1] = minute + STEP;
        else current = [minute, minute + STEP];
      } else if (current) {
        segments.push(current);
        current = null;
      }
    }
    if (current) segments.push(current);
    return segments;
  }

  /** Free minutes that follow a time, before someone is busy again. */
  private roomAfter(index: number, end: Date): number {
    const midnight = this.board.instantOn(this.days()[index].cell, 0).getTime();
    const minute = Math.round((end.getTime() - midnight) / MINUTE);
    const segment = this.freeMinutes(index).find(([from, to]) => from <= minute && minute <= to);
    return segment ? segment[1] - minute : 0;
  }

  readonly freeBars = computed(() => {
    const index = this.dayIndex();
    const midnight = this.board.instantOn(this.days()[index].cell, 0).getTime();
    return this.freeMinutes(index)
      .map(([from, to]) => this.bar(index, midnight + from * MINUTE, midnight + to * MINUTE))
      .filter((bar): bar is Bar => !!bar);
  });

  readonly prayerLines = computed(() => {
    if (!this.board.prayerOn()) return [];
    const index = this.dayIndex();
    return this.board.prayersOn(this.days()[index].cell)
      .map(prayer => ({ name: prayer.label, bar: this.bar(index, prayer.at.getTime(), prayer.at.getTime() + MINUTE) }))
      .filter(prayer => !!prayer.bar)
      .map(prayer => ({ name: prayer.name, left: prayer.bar!.left }));
  });

  /** The chosen time on the day's bars, when that day is the one on show. */
  readonly band = computed(() => {
    const chosen = this.chosen();
    if (!chosen || chosen.dayIndex !== this.dayIndex()) return null;
    const bar = this.bar(chosen.dayIndex, chosen.start.getTime(), chosen.end.getTime());
    return bar ? { ...bar, label: this.timeRange(chosen.start, chosen.end) } : null;
  });

  // ── Sharing ────────────────────────────────────────────────────────────────

  readonly shareText = computed(() => {
    const best = this.best().slice(0, 3);
    if (!best.length) return '';
    // The text is in the interface language: it is what the user would write themselves.
    const title = this.title().trim();
    const facts = { title, city: this.zoneCity() };
    const opening = title
      ? tCount(this.duration(), 'Here are times for a {n}-minute {title} ({city} time):', 'Here are times for a {n}-minute {title} ({city} time):', facts)
      : tCount(this.duration(), 'Here are times for a {n}-minute meeting ({city} time):', 'Here are times for a {n}-minute meeting ({city} time):', facts);
    return `${opening}\n`
      + best.map(time => `• ${time.when}`).join('\n')
      + `\n${t('Reply with the one that suits you.')}`;
  });

  /** People who can still be added, narrowed by what was typed. */
  readonly matches = computed(() => {
    const taken = new Set(this.guests().map(guest => guest.id));
    const query = this.query().trim().toLowerCase();
    return this.contacts()
      .filter(contact => !taken.has(contact.id))
      .filter(contact => !query
        || contact.fullName.toLowerCase().includes(query)
        || (contact.email ?? '').toLowerCase().includes(query))
      .slice(0, 6);
  });

  constructor() {
    // Working hours and the 24-hour clock come from the calendar settings.
    if (!this.data.settings()) this.data.reloadLists();
    // The user's own row carries their name: this page may be the first to ask for the profile.
    if (!this.users.currentUser()) this.users.getMe().subscribe({ error: () => {} });
    this.users.getContacts().pipe(catchError(() => of([] as ContactDto[])))
      .subscribe(contacts => {
        this.contacts.set(contacts);
        // The people a link named start out picked. An id that is not a friend or a
        // teammate cannot be looked up, and is left out without a word.
        const picked = contacts.filter(contact => this.asked.people.includes(contact.id));
        if (picked.length) this.guests.set(picked);
      });

    // Other people, another length or other days: everything is looked up again.
    effect(() => {
      // The user is asked for by id too: with other people named, the answer has only those named.
      const guests = this.guests().map(guest => guest.id);
      const ids = guests.length && this.myId ? [this.myId, ...guests] : guests;
      const minutes = this.duration();
      const days = this.days();
      untracked(() => this.load(ids, minutes, days));
    });
  }

  private readLink(): { people: string[]; title: string; minutes: number | null } {
    const params = this.route.snapshot.queryParamMap;
    const minutes = Math.round(Number(params.get('minutes')));
    return {
      people: (params.get('with') ?? '').split(',').map(id => id.trim()).filter(Boolean),
      title: (params.get('title') ?? '').trim().slice(0, 200),
      minutes: minutes >= 5 && minutes <= 480 ? minutes : null
    };
  }

  /** Guards against an older, slower answer overwriting a newer one. */
  private request = 0;

  private load(ids: string[], minutes: number, days: DayTab[]) {
    if (!days.length) {
      this.loading.set(false);
      return;
    }
    const request = ++this.request;
    const from = this.board.instantOn(days[0].cell, 0);
    const to = new Date(this.board.instantOn(days[days.length - 1].cell, 0).getTime() + 24 * 60 * MINUTE);

    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      availability: this.schedule.getAvailability(ids, from, to),
      slots: this.schedule.suggest({
        attendeeIds: ids.filter(id => id !== this.myId), durationMinutes: minutes,
        from: from.toISOString(), to: to.toISOString(), maxResults: 20, workingHoursOnly: true
      })
    }).subscribe({
      next: result => {
        if (request !== this.request) return;
        this.availability.set(result.availability);
        this.slots.set(result.slots);
        this.pickIndex.set(0);
        this.dayPicked.set(null);
        this.loading.set(false);
      },
      error: err => {
        if (request !== this.request) return;
        this.availability.set([]);
        this.slots.set([]);
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, t('Free times could not be looked up.')));
      }
    });
  }

  private whenLabel(start: Date, end: Date): string {
    return `${this.board.shortDay(start)} · ${this.timeRange(start, end)}`;
  }

  /** "13:00–13:45": the start is read first in either direction. */
  private timeRange(start: Date, end: Date): string {
    return t('{start}–{end}', { start: this.board.time(start), end: this.board.time(end) });
  }

  /** "Lisa Chen: 2 busy times on Sunday 15 November", for a screen reader. */
  trackLabel(name: string, busy: number, day: string): string {
    return tCount(busy, '{name}: {n} busy time on {day}', '{name}: {n} busy times on {day}', { name, day });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  initials(name: string): string {
    return initialsOf(name);
  }

  setTitle(event: Event) {
    this.title.set((event.target as HTMLInputElement).value);
  }

  setDuration(minutes: number) {
    this.duration.set(minutes);
  }

  pickDay(index: number) {
    this.dayPicked.set(index);
  }

  pickTime(index: number) {
    this.pickIndex.set(index);
    this.dayPicked.set(null);
  }

  search(event: Event) {
    this.query.set((event.target as HTMLInputElement).value);
    this.listOpen.set(true);
  }

  addGuest(contact: ContactDto, input: HTMLInputElement) {
    this.guests.update(list => [...list, contact]);
    this.query.set('');
    input.value = '';
    input.focus();
  }

  removeGuest(id: string) {
    this.guests.update(list => list.filter(guest => guest.id !== id));
  }

  /** Closes the list a moment later, so a click on one of its rows still lands. */
  closeList() {
    setTimeout(() => this.listOpen.set(false), 150);
  }

  /** Creates the event at the chosen time; its guests are invited by the server. */
  send(titleInput: HTMLInputElement) {
    const chosen = this.chosen();
    if (!chosen || this.sending()) return;
    const title = this.title().trim();
    if (!title) {
      this.error.set(t('Give the meeting a title first.'));
      titleInput.focus();
      return;
    }

    this.sending.set(true);
    this.error.set(null);
    this.events.create({
      title,
      startsAt: chosen.start.toISOString(), endsAt: chosen.end.toISOString(), isAllDay: false,
      recurrence: 'None', recurrenceInterval: 1,
      attendeeIds: this.guests().map(guest => guest.id)
    }).subscribe({
      next: event => {
        this.sending.set(false);
        this.data.reload();
        this.toasts.show(this.guests().length
          ? t('Invite sent for {when}.', { when: chosen.when })
          : t('Added to your calendar: {when}.', { when: chosen.when }));
        this.router.navigate(['/calendar'], {
          queryParams: { date: dayKeyInZone(chosen.start, this.board.zone()), event: event.id }
        });
      },
      error: err => {
        this.sending.set(false);
        this.error.set(apiErrorMessage(err, t('The invite was not sent.')));
      }
    });
  }

  copy() {
    const text = this.shareText();
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => this.toasts.show(t('Copied.')),
      () => this.toasts.show(t('The text could not be copied.'), { tone: 'var(--mq-late)' }));
  }
}
