import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, computed, effect, inject,
  input, output, signal, untracked
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { CalendarDataService } from '../../core/services/calendar-data.service';
import { CalendarService } from '../../core/services/calendar.service';
import { ChatService } from '../../core/services/chat.service';
import { EventService } from '../../core/services/event.service';
import { FriendService } from '../../core/services/friend.service';
import { GroupService } from '../../core/services/group.service';
import { ImagePaletteService } from '../../core/services/image-palette.service';
import { LocalPrefsService } from '../../core/services/local-prefs.service';
import { ScheduleService } from '../../core/services/schedule.service';
import { TaskService } from '../../core/services/task.service';
import { ToastService } from '../../core/services/toast.service';
import { UserService } from '../../core/services/user.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { formatNumber, isArabic, locale, t, tCount } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { placeForZone, prayerTimes } from '../../core/utils/prayer-times';
import { formatDuration } from '../../core/utils/task-estimate';
import {
  allDaySpan, dayKeyInZone, formatTimeInZone, isValidTimeZone, zonedParts, zonedTimeToUtc
} from '../../core/utils/time-zone';
import {
  CalendarItemDto, DayOfWeekName, EventDto, GroupDto, SharedProjectDto, TaskDto, TimeSlotDto, UserAvailabilityDto,
  UserDto, UserProfileDto
} from '../../models/api.models';
import {
  Span, axisPercent, clockHours, formatClock, listText, offsetText, onViewerClock, sharedSpans, visibleSpans,
  weekdayLabel, zoneCity, zoneOffsetHours
} from './day-overlap';

/** What a button on the profile did to the relationship, so the list beside it can follow. */
export type RelationChange =
  'requested' | 'accepted' | 'declined' | 'cancelled' | 'unfriended' | 'blocked' | 'unblocked';

interface Bar {
  label: string;
  kind: 'you' | 'them' | 'overlap';
  parts: { left: number; width: number }[];
}

interface TogetherRow {
  key: string;
  when: string;
  title: string;
  color: string | null;
  date: string;
  eventId: string;
}

interface ProjectRow {
  id: string;
  name: string;
  percent: number;
}

interface RecentRow {
  taskId: string;
  text: string;
  at: number;
}

const DAYS: DayOfWeekName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** How many shared projects are listed before "and N more". */
const PROJECTS_SHOWN = 5;
/** Another person's working hours are not shared by the API: the chart draws the usual office day. */
const ASSUMED_DAY: Span = { start: 9, end: 17 };
const DAY_MS = 86_400_000;
const LOOK_AHEAD_DAYS = 7;

/**
 * One person, as the People screen shows them on the right (design/miqat-2.0,
 * V2-People): who they are, how their working day lines up with the viewer's,
 * what the two have coming up together and the projects they share.
 *
 * Everything is derived from what the viewer is allowed to see: the profile
 * endpoint, free / busy times (friends and teammates only), the viewer's own
 * calendar, projects and tasks.
 */
@Component({
  selector: 'app-person-profile',
  standalone: true,
  imports: [RouterLink, TPipe],
  templateUrl: './person-profile.html',
  styleUrl: './person-profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PersonProfile {
  private users = inject(UserService);
  private friends = inject(FriendService);
  private schedule = inject(ScheduleService);
  private calendarApi = inject(CalendarService);
  private calendarData = inject(CalendarDataService);
  private events = inject(EventService);
  private groupApi = inject(GroupService);
  private taskApi = inject(TaskService);
  private palette = inject(ImagePaletteService);
  private prefs = inject(LocalPrefsService);
  private toasts = inject(ToastService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected chat = inject(ChatService);

  readonly userId = input.required<string>();
  /** A relationship button was used; the page reloads its lists. */
  readonly changed = output<RelationChange>();
  /** "Back to people", shown where the profile takes the whole page. */
  readonly back = output<void>();

  protected readonly state = signal<'loading' | 'ready' | 'missing'>('loading');
  protected readonly person = signal<UserDto | null>(null);
  protected readonly relation = signal<{ status: string; id: string | null }>({ status: 'None', id: null });
  private readonly mutualCount = signal(0);
  private readonly shared = signal<SharedProjectDto[]>([]);
  private readonly groups = signal<GroupDto[] | null>(null);
  private readonly tasks = signal<TaskDto[] | null>(null);
  /** Free / busy for the next day; null when the API does not share it with the viewer. */
  private readonly availability = signal<UserAvailabilityDto | null>(null);
  /** Half-hour times the server finds for both in the coming week; null when it cannot be asked. */
  private readonly weekSlots = signal<TimeSlotDto[] | null>(null);
  /** The first two free hours the server finds for both. */
  private readonly firstSlot = signal<TimeSlotDto | null>(null);
  protected readonly together = signal<TogetherRow[] | null>(null);
  private readonly ring = signal<string | null>(null);
  protected readonly pictureFailed = signal(false);

  protected readonly acting = signal(false);
  protected readonly error = signal('');
  protected readonly menuOpen = signal(false);
  /** The menu choice that is asking "are you sure". */
  protected readonly confirming = signal<'block' | 'unfriend' | null>(null);

  /** Moves the local times and the "now" line along. */
  private readonly now = signal(new Date());
  private eventCache = new Map<string, EventDto>();
  private loadId = 0;

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    effect(() => {
      const id = this.userId();
      untracked(() => this.load(id));
    });

    // The viewer's own working hours come from the calendar settings.
    if (!this.calendarData.settings()) {
      this.calendarApi.getSettings().subscribe({
        next: settings => this.calendarData.settings.set(settings),
        error: () => { /* the chart then uses 09:00 to 17:00 */ }
      });
    }
  }

  // ── Who ────────────────────────────────────────────────────────────────────

  protected readonly firstName = computed(() => (this.person()?.fullName ?? '').trim().split(/\s+/)[0] || t('them@@person'));
  protected readonly status = computed(() => this.relation().status);
  protected readonly isFriend = computed(() => this.status() === 'Friends');
  protected readonly isBlocked = computed(() => this.status() === 'Blocked');
  /** Free / busy is shared: a friend or someone on one of the viewer's projects. */
  protected readonly connected = computed(() => this.availability() !== null);

  protected readonly initials = computed(() => {
    const words = (this.person()?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
  });

  protected readonly picture = computed(() =>
    this.pictureFailed() ? null : this.person()?.profilePictureUrl || null);

  /** The ring takes the picture's main colour when it can be read. */
  protected readonly ringColor = computed(() => (this.picture() ? this.ring() : null));

  /** Under the name: what they say about themselves, or how the two are connected. */
  protected readonly roleLine = computed(() => {
    const person = this.person();
    if (!person) return '';

    const relation: Record<string, string> = {
      Friends: t('Friend'), Sent: t('Friend request sent'), Pending: t('Wants to be your friend'),
      Blocked: t('Blocked@@person')
    };
    const first = person.bio?.trim() || relation[this.status()] || t('Not in your friends yet');
    const mutual = this.mutualCount();
    const second = this.shared()[0]?.name
      ?? (mutual ? tCount(mutual, '{n} mutual friend', '{n} mutual friends') : person.country || '');
    return second ? `${first} · ${second}` : first;
  });

  private readonly myZone = this.users.timeZone;
  private readonly hour24 = this.calendarData.use24HourClock;

  private readonly theirZone = computed(() => {
    const zone = this.availability()?.timeZone || this.person()?.timeZone;
    return isValidTimeZone(zone) ? zone.trim() : null;
  });

  /** Hours their clock runs ahead of the viewer's (negative: behind). */
  private readonly ahead = computed(() => {
    const zone = this.theirZone();
    if (!zone) return 0;
    const at = this.now();
    return zoneOffsetHours(zone, at) - zoneOffsetHours(this.myZone(), at);
  });

  /** A meeting of theirs that is going on right now, when free / busy is shared. */
  private readonly busyUntil = computed(() => {
    const at = this.now().getTime();
    const slot = this.availability()?.busy.find(b =>
      new Date(b.start).getTime() <= at && at < new Date(b.end).getTime());
    return slot ? new Date(slot.end) : null;
  });

  /** Colour of the dot in front of the status; null when nothing is known. */
  protected readonly presence = computed<'online' | 'busy' | 'away' | null>(() => {
    if (this.isBlocked()) return null;
    if (this.busyUntil()) return 'busy';
    if (!this.isFriend()) return null;
    return this.chat.isOnline(this.userId()) ? 'online' : 'away';
  });

  protected readonly statusLine = computed(() => {
    const parts: string[] = [];
    const busyUntil = this.busyUntil();
    const presence = this.presence();

    if (busyUntil) parts.push(t('In a meeting until {time}', { time: this.time(busyUntil) }));
    else if (presence === 'online') parts.push(t('Online'));
    else if (presence === 'away') parts.push(t('Offline'));

    const zone = this.theirZone();
    if (zone) {
      parts.push(t('{time} in {city}, {offset}', {
        time: formatTimeInZone(this.now(), zone, this.hour24()), city: zoneCity(zone), offset: offsetText(this.ahead())
      }));
    } else if (this.person()?.country) {
      parts.push(this.person()!.country);
    }
    return parts.join(' · ');
  });

  // ── Your day and theirs ────────────────────────────────────────────────────

  protected readonly hasChart = computed(() => !!this.theirZone() && !this.isBlocked());
  protected readonly myCity = computed(() => zoneCity(this.myZone()));

  private readonly mySpan = computed<Span>(() => {
    const settings = this.calendarData.settings();
    const start = clockHours(settings?.workDayStart, ASSUMED_DAY.start);
    const end = clockHours(settings?.workDayEnd, ASSUMED_DAY.end);
    return end > start ? { start, end } : ASSUMED_DAY;
  });

  private readonly theirSpan = computed(() => onViewerClock(ASSUMED_DAY, this.ahead()));
  private readonly overlap = computed(() => sharedSpans(this.mySpan(), this.theirSpan()));
  private readonly overlapHours = computed(() => this.overlap().reduce((sum, s) => sum + s.end - s.start, 0));

  protected readonly assumedNote = computed(() =>
    t('{name}’s day assumed {from} – {to}', {
      name: this.firstName(), from: this.clock(ASSUMED_DAY.start), to: this.clock(ASSUMED_DAY.end)
    }));

  protected readonly overlapLabel = computed(() => {
    const hours = this.overlapHours();
    return hours > 0 ? t('{duration} overlap', { duration: formatDuration(Math.round(hours * 60)) }) : t('No overlap');
  });

  protected readonly bars = computed<Bar[]>(() => {
    const parts = (spans: Span[]) => spans.flatMap(visibleSpans).map(s => ({
      left: axisPercent(s.start), width: axisPercent(s.end) - axisPercent(s.start)
    }));
    return [
      { label: t('You'), kind: 'you', parts: parts([this.mySpan()]) },
      { label: this.firstName(), kind: 'them', parts: parts([this.theirSpan()]) },
      { label: t('Overlap'), kind: 'overlap', parts: parts(this.overlap()) }
    ];
  });

  protected readonly axisLabels = computed(() => [6, 10, 14, 18, 22].map(hour => this.clock(hour)));

  /** Today's prayer times on the viewer's clock, when that layer is switched on. */
  protected readonly prayerTicks = computed(() => {
    const zone = this.myZone();
    const place = placeForZone(zone);
    if (!this.prefs.prayerTimes() || !place) return [];

    const today = zonedParts(this.now(), zone);
    return prayerTimes(today.year, today.month, today.day, place, this.prefs.prayerMethod() ?? place.method)
      .filter(prayer => prayer.name !== 'Sunrise')
      .map(prayer => this.hourOnMyClock(prayer.at))
      .filter(hour => hour > 6 && hour < 22)
      .map(axisPercent);
  });

  protected readonly nowTick = computed(() => {
    const hour = this.hourOnMyClock(this.now());
    return hour >= 6 && hour <= 22 ? axisPercent(hour) : null;
  });

  /** The sentence under the chart: the best time to meet. */
  protected readonly overlapText = computed(() => {
    const name = this.firstName();
    const ahead = this.ahead();

    const slot = this.bestSlot();
    if (slot) {
      const mine = { day: this.dayWord(slot.start), from: this.time(slot.start), to: this.time(slot.end), name };
      return ahead !== 0
        ? t('Best window: {day} {from} – {to} your time ({theirFrom} – {theirTo} for {name}). Miqat suggests this time first when you invite {name}.', {
          ...mine, theirFrom: this.timeIn(slot.start, this.theirZone()!), theirTo: this.timeIn(slot.end, this.theirZone()!)
        })
        : t('Best window: {day} {from} – {to} your time. Miqat suggests this time first when you invite {name}.', mine);
    }
    if (this.weekSlots()) {
      return t('Miqat found no time in the next {n} days that is free for you both and inside both working days.',
        { n: LOOK_AHEAD_DAYS });
    }

    // Free / busy is not shared (or could not be asked): the sentence follows the chart.
    const usual = { name, usualFrom: this.clock(ASSUMED_DAY.start), usualTo: this.clock(ASSUMED_DAY.end) };
    const window = this.overlap()[0];
    if (!window) return t('Your working hours don’t overlap if {name} keeps the usual {usualFrom} – {usualTo}.', usual);

    const end = Math.min(window.end, window.start + 2);
    const mine = { ...usual, from: this.clock(window.start), to: this.clock(end) };
    return ahead !== 0
      ? t('Best window: {from} – {to} your time ({theirFrom} – {theirTo} for {name}), if {name} keeps the usual {usualFrom} – {usualTo}.', {
        ...mine, theirFrom: this.clock(window.start + ahead), theirTo: this.clock(end + ahead)
      })
      : t('Best window: {from} – {to} your time, if {name} keeps the usual {usualFrom} – {usualTo}.', mine);
  });

  /** The working days the two can really meet on, from what the server finds for the coming week. */
  protected readonly daysText = computed(() => {
    const slots = this.weekSlots();
    const name = this.firstName();
    if (!slots) return t('{name}’s working days are shared with friends and teammates only.', { name });

    const zone = this.myZone();
    const found = new Set(slots.map(slot => this.weekday(new Date(slot.start), zone)));
    const settings = this.calendarData.settings();
    const startAt = Math.max(0, DAYS.indexOf(settings?.weekStartsOn ?? 'Sunday'));
    const week = [...DAYS.slice(startAt), ...DAYS.slice(0, startAt)];

    const sharedDays = week.filter(day => found.has(day));
    const mineOnly = week.filter(day => (settings?.workDays ?? []).includes(day) && !found.has(day));
    const names = (days: DayOfWeekName[]) => listText(days.map(day => weekdayLabel(day, 'short')));

    // With nothing shared, the sentence above the days has already said so.
    if (!sharedDays.length) return '';

    const share = tCount(sharedDays.length,
      'You share {n} working day in the next week ({days}).', 'You share {n} working days in the next week ({days}).',
      { days: names(sharedDays) });
    if (!mineOnly.length) return share;

    const rest = tCount(mineOnly.length,
      '{days} is your workday but has no shared hours with {name}.',
      '{days} are your workdays but have no shared hours with {name}.',
      { days: names(mineOnly), name });
    return `${share} ${rest}`;
  });

  /** Two free hours when the server finds them, otherwise the first run of free half hours. */
  private readonly bestSlot = computed<{ start: Date; end: Date } | null>(() => {
    const long = this.firstSlot();
    if (long) return { start: new Date(long.start), end: new Date(long.end) };

    const slots = this.weekSlots();
    if (!slots?.length) return null;
    const start = new Date(slots[0].start);
    let end = new Date(slots[0].end);
    for (const slot of slots.slice(1)) {
      if (new Date(slot.start).getTime() !== end.getTime()) break;
      end = new Date(slot.end);
    }
    return { start, end };
  });

  // ── Shared projects, recently ──────────────────────────────────────────────

  protected readonly projects = computed<ProjectRow[]>(() => {
    const groups = this.groups() ?? [];
    return this.shared().slice(0, PROJECTS_SHOWN).map(project => {
      const group = groups.find(g => g.id === project.id);
      const total = group?.taskCount ?? 0;
      return {
        id: project.id,
        name: project.name,
        percent: total ? Math.round(((group?.completedTaskCount ?? 0) / total) * 100) : 0
      };
    });
  });

  protected readonly moreProjects = computed(() => Math.max(0, this.shared().length - PROJECTS_SHOWN));

  /** Room for "Thu 16:30", or "Thu 4:30 PM" on a 12-hour clock. Arabic writes the day in full. */
  protected readonly whenWidth = computed(() => (this.hour24() ? 74 : 92) + (isArabic() ? 22 : 0));

  /** 45 -> "45%". */
  protected percent(value: number): string {
    return formatNumber(value / 100, { style: 'percent', maximumFractionDigits: 0 });
  }

  /** What they did lately on tasks the viewer can see: created one, or had one of theirs completed. */
  protected readonly recent = computed<RecentRow[]>(() => {
    const id = this.userId();
    const rows: RecentRow[] = [];
    for (const task of this.tasks() ?? []) {
      const created = new Date(task.createdAt).getTime();
      if (task.userId === id && Number.isFinite(created)) {
        rows.push({ taskId: task.id, at: created, text: t('Created {title}', { title: task.title }) });
      }
      const completed = task.completedAt ? new Date(task.completedAt).getTime() : NaN;
      if ((task.assignedToUserId === id || task.userId === id) && Number.isFinite(completed)) {
        rows.push({ taskId: task.id, at: completed, text: t('{title} was completed', { title: task.title }) });
      }
    }
    return rows.sort((a, b) => b.at - a.at).slice(0, 3);
  });

  protected ago(at: number): string {
    const now = this.now().getTime();
    const minutes = Math.floor((now - at) / 60_000);
    if (minutes < 1) return t('just now');
    if (minutes < 60) return tCount(minutes, '{n} min ago', '{n} min ago');
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return tCount(hours, '{n} h ago', '{n} h ago');
    const days = Math.floor(hours / 24);
    if (days === 1) return t('yesterday');
    const date = new Date(at);
    if (days < 7) return date.toLocaleDateString(locale(), { weekday: 'long', timeZone: this.myZone() });
    return date.toLocaleDateString(locale(), { day: 'numeric', month: 'long', timeZone: this.myZone() });
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  /** Reads everything about a person. `quiet` keeps what is on screen until the answers arrive. */
  private load(id: string, quiet = false): void {
    const request = ++this.loadId;
    const current = () => request === this.loadId;

    if (!quiet) {
      this.state.set('loading');
      this.error.set('');
      this.menuOpen.set(false);
      this.confirming.set(null);
      this.pictureFailed.set(false);
      this.ring.set(null);
      this.availability.set(null);
      this.weekSlots.set(null);
      this.firstSlot.set(null);
      this.together.set(null);
    }

    this.fetchProfile(id).subscribe(profile => {
      if (!current()) return;
      if (!profile) {
        this.person.set(null);
        this.state.set('missing');
        return;
      }
      this.person.set(profile.user);
      this.relation.set({ status: profile.friendship?.status ?? 'None', id: profile.friendship?.id ?? null });
      this.mutualCount.set(profile.mutualFriendsCount ?? 0);
      this.shared.set(profile.sharedProjects ?? []);
      this.state.set('ready');

      this.palette.extract(profile.user.profilePictureUrl).then(found => {
        if (current()) this.ring.set(found?.dominant ?? null);
      });
    });

    const now = new Date();
    this.schedule.getAvailability([id], now, new Date(now.getTime() + DAY_MS)).pipe(
      map(rows => rows.find(row => row.userId === id) ?? null),
      // 403: not a friend or teammate. 404: an API build without scheduling.
      catchError(() => of(null))
    ).subscribe(row => {
      if (!current()) return;
      this.availability.set(row);
      if (row) this.loadSlots(id, current);
      else { this.weekSlots.set(null); this.firstSlot.set(null); }
    });

    this.loadTogether(id, current);
    if (!this.groups()) this.groupApi.getGroups().pipe(catchError(() => of([]))).subscribe(g => this.groups.set(g ?? []));
    if (!this.tasks()) this.taskApi.getTasks().pipe(catchError(() => of([]))).subscribe(t => this.tasks.set(t ?? []));
  }

  /** The profile in one call; on an API build without it, the person and the friendship separately. */
  private fetchProfile(id: string): Observable<UserProfileDto | null> {
    return this.users.getProfile(id).pipe(
      catchError(() => this.users.getUserById(id).pipe(
        switchMap(user => this.friends.getFriendshipStatus(id).pipe(
          catchError(() => of({ status: 'None', id: null })),
          map(friendship => ({
            user, isMe: false, friendship, friendsCount: 0, mutualFriendsCount: 0, mutualFriends: []
          }) as UserProfileDto)
        )),
        catchError(() => of(null))
      ))
    );
  }

  /** Asks the server when both are free inside both working days (their hours are not shared directly). */
  private loadSlots(id: string, current: () => boolean): void {
    const zone = this.myZone();
    const today = zonedParts(new Date(), zone);
    const tomorrow = zonedTimeToUtc(today.year, today.month, today.day + 1, 0, 0, zone);
    const base = { attendeeIds: [id], workingHoursOnly: true };

    forkJoin({
      week: this.schedule.suggest({
        ...base, durationMinutes: 30, maxResults: 20,
        from: tomorrow.toISOString(), to: new Date(tomorrow.getTime() + LOOK_AHEAD_DAYS * DAY_MS).toISOString()
      }),
      first: this.schedule.suggest({
        ...base, durationMinutes: 120, maxResults: 1,
        to: new Date(Date.now() + LOOK_AHEAD_DAYS * DAY_MS).toISOString()
      })
    }).pipe(catchError(() => of(null))).subscribe(result => {
      if (!current() || !result) return;
      this.weekSlots.set(result.week ?? []);
      this.firstSlot.set(result.first?.[0] ?? null);
    });
  }

  /** Upcoming events both people are part of, from the viewer's own calendar. */
  private loadTogether(id: string, current: () => boolean): void {
    const now = new Date();
    this.calendarApi.getFeed(now, new Date(now.getTime() + 30 * DAY_MS), false).pipe(
      catchError(() => of([] as CalendarItemDto[])),
      switchMap(items => {
        // Only events with guests, or that someone else organised, can include them.
        const candidates = items.filter(item => item.kind === 'Event' && (item.attendeeCount > 0 || !item.isOwner));
        const ids = [...new Set(candidates.map(item => item.id))].slice(0, 30);
        const lookups = ids.map(eventId => {
          const cached = this.eventCache.get(eventId);
          return cached ? of(cached) : this.events.getById(eventId).pipe(catchError(() => of(null)));
        });
        const found$: Observable<(EventDto | null)[]> = lookups.length ? forkJoin(lookups) : of([]);
        return found$.pipe(map(found => ({ candidates, found })));
      })
    ).subscribe(({ candidates, found }) => {
      if (!current()) return;
      for (const event of found) if (event) this.eventCache.set(event.id, event);

      const withThem = (event: EventDto | undefined) => !!event
        && (event.isOwner || event.myResponse !== 'Declined')
        && (event.ownerId === id || event.attendees.some(a => a.userId === id && a.status !== 'Declined'));

      this.together.set(candidates
        .filter(item => withThem(this.eventCache.get(item.id)))
        .sort((a, b) => a.start.localeCompare(b.start))
        .slice(0, 4)
        .map(item => this.togetherRow(item)));
    });
  }

  private togetherRow(item: CalendarItemDto): TogetherRow {
    const start = new Date(item.start);
    const zone = this.myZone();
    const soon = start.getTime() - Date.now() < 7 * DAY_MS;
    // An all-day event keeps the date it was given, whatever zone it is seen from.
    const given = item.isAllDay ? allDaySpan(start, new Date(item.end), zone) : null;
    const shown = given ? new Date(Date.UTC(given.year, given.month - 1, given.day, 12)) : start;
    const shownZone = given ? 'UTC' : zone;
    const day = soon
      ? shown.toLocaleDateString(locale(), { weekday: 'short', timeZone: shownZone })
      : shown.toLocaleDateString(locale(), { day: 'numeric', month: 'short', timeZone: shownZone });
    return {
      key: `${item.id}|${item.start}`,
      when: item.isAllDay || !soon ? day : `${day} ${this.time(start)}`,
      title: item.title,
      color: item.color || null,
      date: dayKeyInZone(shown, shownZone),
      eventId: item.id
    };
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  protected addFriend(): void {
    const person = this.person();
    if (!person) return;
    this.act(this.friends.sendRequest(person.id), 'requested',
      t('Friend request sent to {name}', { name: this.firstName() }), t('Could not send that friend request.'));
  }

  protected cancelRequest(): void {
    const id = this.relation().id;
    if (!id) return;
    this.act(this.friends.unfriend(id), 'cancelled', t('Friend request cancelled'), t('Could not cancel that request.'));
  }

  protected accept(): void {
    const id = this.relation().id;
    if (!id) return;
    this.act(this.friends.acceptRequest(id), 'accepted',
      t('You’re now friends with {name}', { name: this.firstName() }), t('Could not accept that request.'));
  }

  protected decline(): void {
    const id = this.relation().id;
    if (!id) return;
    this.act(this.friends.rejectRequest(id), 'declined',
      t('Request declined. {name} isn’t told.', { name: this.firstName() }), t('Could not decline that request.'));
  }

  protected unfriend(): void {
    const id = this.relation().id;
    if (!id) return;
    this.act(this.friends.unfriend(id), 'unfriended',
      t('{name} is no longer in your friends', { name: this.firstName() }), t('Could not remove that friend.'));
  }

  protected block(): void {
    const person = this.person();
    if (!person) return;
    this.act(this.friends.blockUser(person.id), 'blocked',
      t('{name} is blocked. They aren’t told.', { name: this.firstName() }), t('Could not block that person.'));
  }

  protected unblock(): void {
    const person = this.person();
    if (!person) return;
    this.act(this.friends.unblockUser(person.id), 'unblocked',
      t('{name} is unblocked', { name: this.firstName() }), t('Could not unblock that person.'));
  }

  /** Opens the pop-up chat with this friend. */
  protected message(): void {
    this.error.set('');
    this.chat.openWith(this.userId()).subscribe({
      error: err => this.error.set(apiErrorMessage(err, t('Could not open the chat.')))
    });
  }

  private act(request: Observable<unknown>, change: RelationChange, done: string, failed: string): void {
    if (this.acting()) return;
    const id = this.userId();

    this.acting.set(true);
    this.error.set('');
    this.menuOpen.set(false);
    this.confirming.set(null);

    request.subscribe({
      next: () => {
        this.acting.set(false);
        this.toasts.show(done);
        this.changed.emit(change);
        // Free / busy follows the friendship, so everything is read again.
        if (id === this.userId()) this.load(id, true);
      },
      error: err => {
        this.acting.set(false);
        this.error.set(apiErrorMessage(err, failed));
      }
    });
  }

  protected toggleMenu(): void {
    this.confirming.set(null);
    this.menuOpen.update(open => !open);
  }

  @HostListener('document:pointerdown', ['$event'])
  protected onOutside(event: Event): void {
    if (!this.menuOpen()) return;
    const menu = this.host.nativeElement.querySelector('.more');
    if (!menu?.contains(event.target as Node)) this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.menuOpen.set(false);
  }

  // ── Formatting ─────────────────────────────────────────────────────────────

  /** A moment on the viewer's clock. */
  private time(date: Date): string {
    return formatTimeInZone(date, this.myZone(), this.hour24());
  }

  private timeIn(date: Date, zone: string): string {
    return formatTimeInZone(date, zone, this.hour24());
  }

  private clock(hour: number): string {
    return formatClock(hour, this.hour24());
  }

  private hourOnMyClock(date: Date): number {
    const parts = zonedParts(date, this.myZone());
    return parts.hour + parts.minute / 60;
  }

  private weekday(date: Date, zone: string): DayOfWeekName {
    const parts = zonedParts(date, zone);
    return DAYS[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()];
  }

  /** "today", "tomorrow" or the short weekday of a moment, on the viewer's calendar. */
  private dayWord(date: Date): string {
    const zone = this.myZone();
    const key = dayKeyInZone(date, zone);
    if (key === dayKeyInZone(this.now(), zone)) return t('today');
    if (key === dayKeyInZone(new Date(this.now().getTime() + DAY_MS), zone)) return t('tomorrow');
    return date.toLocaleDateString(locale(), { weekday: 'short', timeZone: zone });
  }
}
