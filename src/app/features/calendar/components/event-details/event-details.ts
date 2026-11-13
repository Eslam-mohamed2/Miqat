import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AuthService } from '../../../../core/services/auth.service';
import { CalendarDataService } from '../../../../core/services/calendar-data.service';
import { CalendarSelection } from '../../../../core/services/calendar-state.service';
import { EventService } from '../../../../core/services/event.service';
import { ScheduleService } from '../../../../core/services/schedule.service';
import { TaskService } from '../../../../core/services/task.service';
import { ToastService } from '../../../../core/services/toast.service';
import { apiErrorMessage } from '../../../../core/http/api-error';
import { t, tCount } from '../../../../core/i18n/i18n';
import { TPipe } from '../../../../core/i18n/t.pipe';
import {
  AttendeeStatus, CalendarItemDto, EventDto, SaveEventDto, TaskDto, UserAvailabilityDto
} from '../../../../models/api.models';
import { estimateMinutes, formatDuration } from '../../../../core/utils/task-estimate';
import {
  allDaySpan, cellOfInstant, dateInputInZone, dayKeyInZone, formatTimeInZone, instantFromInputs, timeInputInZone,
  timeZoneCity, zonedParts
} from '../../../../core/utils/time-zone';
import { ItemAttachments } from '../../../../shared/item-attachments/item-attachments';
import { ItemReminders } from '../../../../shared/item-reminders/item-reminders';
import { CalendarBoard, DEFAULT_BLOCK_MINUTES } from '../../calendar-board.service';
import { DEFAULT_EVENT_COLOR, DEFAULT_TASK_COLOR } from '../../calendar-chips';
import {
  countdownLabel, dateWords, everyoneFree, initialsOf, joinLink, longDate, prayerDuring, shortDate, startAfterPrayer,
  zoneDifferenceLabel, zoneOffsetMinutes
} from '../../calendar-layout';
import { EventActions } from '../../event-actions.service';
import { OccurrenceTarget } from '../event-editor/event-editor';

type Answer = Exclude<AttendeeStatus, 'Pending'>;

/** Which question the panel is asking before it changes or removes something. */
type Prompt = null | 'edit-which' | 'delete' | 'delete-which';

interface PersonRow {
  id: string;
  initials: string;
  picture: string | null;
  name: string;
  /** "Organizer · Cairo", "London · 2 h behind" */
  note: string;
  /** "Going", "Maybe", "Declined", "Awaiting"; empty for the organizer. */
  status: string;
  tone: 'going' | 'maybe' | 'quiet';
}

interface LinkRow {
  type: string;
  title: string;
  route: string[];
}

/** "Dhuhr is at 11:39 ..." with the time the item can move to. */
interface Suggestion {
  key: string;
  text: string;
  action: string;
  start: Date;
  end: Date;
}

// "Going" is the user's own answer on a button and a guest's state in the list:
// one word in English, two in Arabic.
const ANSWERS: { value: Answer; label: string }[] = [
  { value: 'Accepted', label: t('Going') },
  { value: 'Tentative', label: t('Maybe') },
  { value: 'Declined', label: t('Decline') }
];

const STATUS: Record<AttendeeStatus, { label: string; tone: PersonRow['tone'] }> = {
  Accepted: { label: t('Going@@status'), tone: 'going' },
  Tentative: { label: t('Maybe'), tone: 'maybe' },
  Declined: { label: t('Declined@@guest'), tone: 'quiet' },
  Pending: { label: t('Awaiting'), tone: 'quiet' }
};

const MINUTE = 60_000;
/** A meeting moved clear of a prayer is offered one of this many half hours. */
const MOVE_TRIES = 4;

/** "11:30 – 12:30": the start is read first in either direction. */
function range(start: string, end: string): string {
  return t('{start} – {end}', { start, end });
}

/**
 * Everything about the event or task that was picked on the calendar
 * (design/miqat-2.0: the right panel of Main): when it is, in the other zones too,
 * the way to join, the user's answer, who is coming, the agenda, what it is linked
 * to, and a suggestion when a prayer time falls inside it. Its owner can change
 * or remove it from here. The same content fills a window on a narrow screen.
 */
@Component({
  selector: 'app-event-details',
  standalone: true,
  imports: [RouterLink, ItemReminders, ItemAttachments, TPipe],
  templateUrl: './event-details.html',
  styleUrl: './event-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventDetails {
  private events = inject(EventService);
  private schedule = inject(ScheduleService);
  private taskApi = inject(TaskService);
  private toasts = inject(ToastService);
  private actions = inject(EventActions);
  private data = inject(CalendarDataService);
  private readonly myId = inject(AuthService).getCurrentUserId();
  readonly board = inject(CalendarBoard);

  readonly selection = input.required<CalendarSelection>();
  /** Asked for by the close button, and after the item was removed. */
  readonly closed = output<void>();

  readonly answers = ANSWERS;

  readonly event = signal<EventDto | null>(null);
  /** A task the task list does not have (someone else's, opened by a link). */
  private readonly fetchedTask = signal<TaskDto | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly prompt = signal<Prompt>(null);

  /** Time zones and busy times of the people in the event, when they are shared with the user. */
  private readonly people = signal<UserAvailabilityDto[]>([]);
  /** True once the busy times arrived: nothing is called free before that. */
  private readonly peopleLoaded = signal(false);
  /** True when the busy times of every guest are known, not only the user's own. */
  private readonly everyoneKnown = signal(false);
  /** Suggestions the user sent away, until the page is left. */
  private readonly dismissed = signal<ReadonlySet<string>>(new Set());

  /** The small form that gives a task another time. */
  readonly moving = signal(false);
  readonly moveDate = signal('');
  readonly moveTime = signal('');

  readonly isTask = computed(() => this.selection().kind === 'Task');

  /** Changes when another item, or another date of the same one, is picked: the content then fades in anew. */
  readonly contentKey = computed(() => {
    const selection = this.selection();
    return `${selection.kind}:${selection.id}:${selection.item?.occurrenceStart ?? ''}`;
  });

  /**
   * The date that was picked as the calendar has it now: after a change the
   * picked copy is out of date, the reloaded one is not.
   */
  readonly item = computed<CalendarItemDto | null>(() => {
    const selection = this.selection();
    const picked = selection.item ?? null;
    const fresh = this.board.entries().find(entry =>
      entry.kind === selection.kind && entry.id === selection.id
      && (entry.occurrenceStart ?? null) === (picked?.occurrenceStart ?? null)
      && (selection.kind === 'Event' || !!entry.planned === !!(picked as { planned?: boolean } | null)?.planned));
    if (fresh || !picked?.occurrenceStart) return fresh ?? picked;

    // A change to the whole series (a new time for "All dates") moves every date, so
    // the date that was open no longer exists as it was picked. It is now the date of
    // the same event nearest to it, less than a day away; without this the panel kept
    // showing the old time and called it an exception to the series.
    const pickedAt = new Date(picked.occurrenceStart).getTime();
    let nearest: CalendarItemDto | null = null;
    let nearestGap = 86_400_000;
    for (const entry of this.board.entries()) {
      if (entry.kind !== selection.kind || entry.id !== selection.id || !entry.occurrenceStart) continue;
      const gap = Math.abs(new Date(entry.occurrenceStart).getTime() - pickedAt);
      if (gap < nearestGap) {
        nearest = entry;
        nearestGap = gap;
      }
    }
    return nearest ?? picked;
  });

  // ── A task ─────────────────────────────────────────────────────────────────

  readonly task = computed<TaskDto | null>(() =>
    this.isTask() ? this.board.taskOf(this.selection().id) ?? this.fetchedTask() : null);

  /** True when the task has a time block. */
  readonly planned = computed(() => !!this.task()?.startDate);

  readonly checklist = computed(() => {
    const task = this.task();
    const total = task?.subtaskCount ?? 0;
    if (!total) return null;
    const done = Math.min(total, task?.completedSubtaskCount ?? 0);
    return { done, total, percent: Math.round(done / total * 100) };
  });

  /** What is known about the task's time, said plainly. */
  readonly taskFacts = computed(() => {
    const task = this.task();
    if (!task) return '';
    const zone = this.board.zone();
    const estimate = estimateMinutes(task);
    const due = task.dueDate ? new Date(task.dueDate) : null;
    const sentences: string[] = [];

    if (due) {
      const today = dayKeyInZone(due, zone) === this.board.todayKey();
      const late = due.getTime() < this.board.now().getTime() && task.status !== 'Completed';
      const facts = {
        day: today ? '' : longDate(due, zone), time: this.board.time(due), estimate: estimate ? formatDuration(estimate) : ''
      };
      // One sentence for each case: the words around the day and the time change place in Arabic.
      if (estimate) {
        sentences.push(today
          ? (late ? t('Was due today at {time} and estimated at {estimate}.', facts) : t('Due today at {time} and estimated at {estimate}.', facts))
          : (late ? t('Was due {day} at {time} and estimated at {estimate}.', facts) : t('Due {day} at {time} and estimated at {estimate}.', facts)));
      } else {
        sentences.push(today
          ? (late ? t('Was due today at {time}.', facts) : t('Due today at {time}.', facts))
          : (late ? t('Was due {day} at {time}.', facts) : t('Due {day} at {time}.', facts)));
      }
    } else if (estimate) {
      sentences.push(t('Estimated at {estimate}. It has no due date.', { estimate: formatDuration(estimate) }));
    } else {
      sentences.push(t('It has no due date and no estimate.'));
    }

    if (task.startDate) {
      const end = new Date(new Date(task.startDate).getTime() + (estimate ?? DEFAULT_BLOCK_MINUTES) * MINUTE);
      if (!estimate) sentences.push(t('Without an estimate the block is {n} minutes long.', { n: DEFAULT_BLOCK_MINUTES }));
      if (due && end.getTime() > due.getTime()) sentences.push(t('The block ends after the task is due.'));
    } else if (task.status !== 'Completed' && task.status !== 'Cancelled') {
      sentences.push(t('No time is blocked for it yet.'));
    }
    return sentences.join(' ');
  });

  // ── When ───────────────────────────────────────────────────────────────────

  readonly start = computed<Date | null>(() => {
    const task = this.task();
    // A task is its time block when it has one, otherwise the due time that was picked.
    const value = this.isTask()
      ? task?.startDate ?? this.item()?.start ?? task?.dueDate
      : this.item()?.start ?? this.event()?.startsAt;
    const date = new Date(value ?? '');
    return Number.isNaN(date.getTime()) ? null : date;
  });

  readonly end = computed<Date | null>(() => {
    const start = this.start();
    if (!start) return null;
    if (this.isTask()) {
      const task = this.task();
      if (!task?.startDate) return start;
      return new Date(start.getTime() + (estimateMinutes(task) ?? DEFAULT_BLOCK_MINUTES) * MINUTE);
    }
    const date = new Date(this.item()?.end ?? this.event()?.endsAt ?? '');
    return Number.isNaN(date.getTime()) ? start : date;
  });

  readonly allDay = computed(() => !this.isTask() && (this.item()?.isAllDay ?? this.event()?.isAllDay ?? false));

  readonly title = computed(() =>
    this.isTask() ? this.task()?.title ?? this.item()?.title ?? t('Task') : this.item()?.title ?? this.event()?.title ?? t('Event'));

  readonly color = computed(() => {
    if (this.isTask()) return this.task()?.groupColor || this.item()?.color || DEFAULT_TASK_COLOR;
    return this.event()?.color || this.item()?.color || DEFAULT_EVENT_COLOR;
  });

  /** The calendar or project it belongs to; for an invitation, who sent it. */
  readonly source = computed(() => {
    if (this.isTask()) return this.task()?.groupName || this.item()?.groupName || t('Personal');
    const event = this.event();
    if (event && !event.isOwner) {
      return event.ownerName ? t('Invited by {name}', { name: event.ownerName }) : t('Invited by someone');
    }
    return event?.calendarName || this.item()?.calendarName || t('My calendar');
  });

  /** "Thursday, 12 November · 2 Jumada II" */
  readonly dateLine = computed(() => {
    const start = this.start();
    if (!start) return '';
    const zone = this.board.zone();

    // An all-day event keeps the dates it was given, in whatever zone it is seen.
    const end = this.end();
    if (this.allDay() && end) {
      const span = allDaySpan(start, end, zone);
      const first = new Date(span.year, span.month - 1, span.day);
      const hijri = this.board.hijriOn() ? ` · ${this.board.hijriDay(first)}` : '';
      if (span.days === 1) return `${longDate(first)}${hijri}`;
      const lastDay = new Date(span.year, span.month - 1, span.day + span.days - 1);
      return `${range(this.shortCell(first), this.shortCell(lastDay))}${hijri}`;
    }

    const hijri = this.board.hijriOn() ? ` · ${this.board.hijriDay(cellOfInstant(start, zone))}` : '';

    const last = this.lastInstant();
    if (last && dayKeyInZone(start, zone) !== dayKeyInZone(last, zone)) {
      return `${range(this.board.shortDay(start), this.board.shortDay(last))}${hijri}`;
    }
    return `${longDate(start, zone)}${hijri}`;
  });

  /** "Tue 17 Nov" for a calendar cell (a plain local date). */
  private shortCell(cell: Date): string {
    return shortDate(cell);
  }

  /** The last moment that still belongs to it: an end at midnight is the day before. */
  private lastInstant(): Date | null {
    const start = this.start();
    const end = this.end();
    if (!start || !end) return null;
    return new Date(Math.max(start.getTime(), end.getTime() - 1));
  }

  /** "11:30 – 12:30 · 1 h", "All day", "Due 17:00" */
  readonly timeLine = computed(() => {
    const start = this.start();
    const end = this.end();
    if (!start || !end) return '';
    if (this.allDay()) return t('All day');
    if (end.getTime() <= start.getTime()) {
      return this.isTask() ? t('Due {time}', { time: this.board.time(start) }) : this.board.time(start);
    }

    const length = formatDuration(Math.round((end.getTime() - start.getTime()) / MINUTE));
    return `${range(this.board.time(start), this.board.time(end))} · ${length}`;
  });

  /** The zones worth naming next to the calendar's own: the second column's and the guests'. */
  private readonly otherZones = computed(() => {
    const start = this.start();
    if (!start) return [];
    const base = this.board.zone();
    const baseOffset = zoneOffsetMinutes(base, start);
    const seen = new Set<number>([baseOffset]);
    const zones: string[] = [];

    const candidates = [this.board.secondZone(), ...this.people().filter(person => person.userId !== this.myId).map(person => person.timeZone)];
    for (const zone of candidates) {
      if (!zone) continue;
      const offset = zoneOffsetMinutes(zone, start);
      if (seen.has(offset)) continue;
      seen.add(offset);
      zones.push(zone);
    }
    return zones.slice(0, 3);
  });

  /** "09:30 – 10:30 in London · 12:30 – 13:30 in Riyadh" */
  readonly zoneLine = computed(() => {
    const start = this.start();
    const end = this.end();
    if (!start || !end || this.allDay()) return '';
    const hour24 = this.board.hour24();
    const ranged = end.getTime() > start.getTime();

    return this.otherZones()
      .map(zone => {
        const from = formatTimeInZone(start, zone, hour24);
        return t('{time} in {city}', {
          time: ranged ? range(from, formatTimeInZone(end, zone, hour24)) : from, city: timeZoneCity(zone)
        });
      })
      .join(' · ');
  });

  /** "every 2 weeks", or '' for a one-off. */
  private readonly repeatsEvery = computed(() => {
    const event = this.event();
    if (!event || event.recurrence === 'None') return '';
    const count = Math.max(1, event.recurrenceInterval);
    switch (event.recurrence) {
      case 'Daily': return tCount(count, 'every day', 'every {n} days');
      case 'Weekly': return tCount(count, 'every week', 'every {n} weeks');
      case 'Monthly': return tCount(count, 'every month', 'every {n} months');
      case 'Yearly': return tCount(count, 'every year', 'every {n} years');
      default: return '';
    }
  });

  /** "30 Dec 2026": the last day the event repeats on, or '' when it has no end. */
  private readonly repeatsUntil = computed(() => {
    const until = this.event()?.recurrenceEndDate;
    if (!until) return '';
    return t('{day} {month} {year}',
      dateWords(new Date(until), { day: 'numeric', month: 'short', year: 'numeric', timeZone: this.board.zone() }));
  });

  /** "every 2 weeks until 30 Dec 2026", or '' for a one-off. */
  readonly repeats = computed(() => {
    const every = this.repeatsEvery();
    const date = this.repeatsUntil();
    return every && date ? t('{every} until {date}', { every, date }) : every;
  });

  /** "Repeats every 2 weeks until 30 Dec 2026", as a line of its own. */
  readonly repeatsLine = computed(() => {
    const every = this.repeatsEvery();
    const date = this.repeatsUntil();
    if (!every) return '';
    return date ? t('Repeats {every} until {date}', { every, date }) : t('Repeats {every}', { every });
  });

  /** "Starts in 2 h 06 min", "Started 10 min ago", "Ended". */
  readonly startsIn = computed(() => {
    const start = this.start();
    const end = this.end();
    if (!start || !end) return '';
    const now = this.board.now().getTime();
    if (now >= end.getTime()) return t('Ended');
    if (now >= start.getTime()) return t('Started {time} ago', { time: countdownLabel(now - start.getTime()) });
    if (start.getTime() - now > 24 * 60 * MINUTE) return t('Starts {day}', { day: this.board.shortDay(start) });
    return t('Starts in {time}', { time: countdownLabel(start.getTime() - now) });
  });

  readonly place = computed(() => (this.item() ? this.item()!.location : this.event()?.location) ?? '');
  /** The way in, when the place is a link. */
  readonly join = computed(() => joinLink(this.place()));

  // ── Who ────────────────────────────────────────────────────────────────────

  /** Someone else's event the user is on the guest list of. */
  readonly isInvited = computed(() => {
    const event = this.event();
    return !!event && !event.isOwner && event.myResponse != null;
  });

  readonly peopleRows = computed<PersonRow[]>(() => {
    const event = this.event();
    const start = this.start();
    if (!event || !event.attendees.length) return [];

    const zones = new Map(this.people().map(person => [person.userId, person.timeZone]));
    const where = (userId: string) => {
      const zone = zones.get(userId);
      if (!zone) return '';
      const difference = start ? zoneDifferenceLabel(zone, this.board.zone(), start) : '';
      return difference ? `${timeZoneCity(zone)} · ${difference}` : timeZoneCity(zone);
    };

    const organizer: PersonRow = {
      id: event.ownerId,
      initials: initialsOf(event.ownerName),
      picture: event.ownerProfilePictureUrl || null,
      name: event.ownerName || t('Unknown'),
      note: [t('Organizer'), where(event.ownerId)].filter(Boolean).join(' · '),
      status: '',
      tone: 'quiet'
    };

    return [organizer, ...event.attendees.map(guest => ({
      id: guest.userId,
      initials: initialsOf(guest.fullName),
      picture: guest.profilePictureUrl || null,
      name: guest.fullName || t('Unknown'),
      note: where(guest.userId),
      status: STATUS[guest.status]?.label ?? t(guest.status),
      tone: STATUS[guest.status]?.tone ?? 'quiet'
    }))];
  });

  /** "5 guests · 3 going" */
  readonly peopleLabel = computed(() => {
    const guests = this.event()?.attendees ?? [];
    const going = guests.filter(guest => guest.status === 'Accepted').length;
    return t('{guests} · {n} going', { guests: tCount(guests.length, '{n} guest', '{n} guests'), n: going });
  });

  // ── What ───────────────────────────────────────────────────────────────────

  /** The event's notes, a point per line. */
  readonly agenda = computed(() =>
    (this.event()?.description ?? '').split(/\r?\n/).map(line => line.replace(/^\s*[-–—•*]\s*/, '').trim()).filter(Boolean));

  readonly links = computed<LinkRow[]>(() => {
    if (this.isTask()) {
      const task = this.task();
      if (!task) return [];
      const rows: LinkRow[] = [{ type: t('Task'), title: task.title, route: ['/tasks', task.id] }];
      if (task.groupId) rows.push({ type: t('Project'), title: task.groupName || t('Project'), route: ['/projects', task.groupId] });
      return rows;
    }
    const event = this.event();
    return event?.groupId
      ? [{ type: t('Project'), title: event.groupName || t('Project'), route: ['/projects', event.groupId] }]
      : [];
  });

  /** The clicked date of a repeating event, in the form the editor and the API take. */
  readonly occurrence = computed<OccurrenceTarget | null>(() => {
    const item = this.item();
    if (this.isTask() || !item?.isRecurring || !item.occurrenceStart) return null;
    return {
      occurrenceStart: item.occurrenceStart, start: item.start, end: item.end,
      title: item.title, location: item.location
    };
  });

  /** True when this date was moved or renamed away from what the series says. */
  readonly occurrenceChanged = computed(() => {
    const item = this.item();
    const event = this.event();
    if (!item || !event || !this.occurrence()) return false;
    return new Date(item.start).getTime() !== new Date(item.occurrenceStart!).getTime()
      || item.title !== event.title
      || (item.location ?? '') !== (event.location ?? '');
  });

  // ── A prayer time inside it ────────────────────────────────────────────────

  /**
   * Shown only when it is true: a prayer starts while this is going on, the user
   * may move it, and the time it would move to is free for everyone whose busy
   * times are known.
   */
  readonly suggestion = computed<Suggestion | null>(() => {
    const start = this.start();
    const end = this.end();
    if (!start || !end || this.allDay() || end.getTime() <= start.getTime() || !this.board.prayerOn()) return null;
    if (this.loading() || !this.peopleLoaded() || end.getTime() < this.board.now().getTime()) return null;

    const event = this.event();
    const task = this.task();
    const canMove = this.isTask()
      ? !!task?.startDate && task.status !== 'Completed'
      // A repeating event is moved one date at a time, so the date has to be known.
      : !!event?.isOwner && (event.recurrence === 'None' || !!this.occurrence());
    if (!canMove) return null;

    const zone = this.board.zone();
    const cell = cellOfInstant(start, zone);
    const prayer = prayerDuring(start, end, this.board.prayersOn(cell));
    if (!prayer) return null;

    const key = `${this.contentKey()}:${start.getTime()}:${prayer.name}`;
    if (this.dismissed().has(key)) return null;

    const length = end.getTime() - start.getTime();
    const busy = this.people().map(person => person.busy);
    const own = this.isTask() ? { start: 0, end: 0 } : { start: start.getTime(), end: end.getTime() };
    const first = startAfterPrayer(prayer.minute);

    for (let attempt = 0; attempt < MOVE_TRIES; attempt++) {
      const minute = first + attempt * 30;
      if (minute * MINUTE + length > 24 * 60 * MINUTE) break;
      const from = this.board.instantOn(cell, minute);
      const to = new Date(from.getTime() + length);
      // A move must also stay clear of the prayers that follow.
      if (prayerDuring(from, to, this.board.prayersOn(cell))) continue;
      if (!everyoneFree(busy, from.getTime(), to.getTime(), own)) continue;

      const into = Math.round((prayer.at.getTime() - start.getTime()) / MINUTE);
      const facts = { prayer: t(prayer.name), time: this.board.time(prayer.at) };
      const block = this.isTask();
      const when = into === 0
        ? (block
            ? t('{prayer} is at {time}, right as this block starts.', facts)
            : t('{prayer} is at {time}, right as this meeting starts.', facts))
        : (block
            ? tCount(into, '{prayer} is at {time}, {n} minute into this block.', '{prayer} is at {time}, {n} minutes into this block.', facts)
            : tCount(into, '{prayer} is at {time}, {n} minute into this meeting.', '{prayer} is at {time}, {n} minutes into this meeting.', facts));
      const guests = !block && (event?.attendees.length ?? 0) > 0;
      const free = { from: this.board.time(from), to: this.board.time(to) };
      const who = guests && this.everyoneKnown()
        ? t('Everyone is free from {from} to {to}.', free)
        : t('You are free from {from} to {to}.', free);

      return {
        key,
        text: `${when} ${who}`,
        action: t('Move to {time}', { time: this.board.time(from) }),
        start: from,
        end: to
      };
    }
    return null;
  });

  constructor() {
    // Another item, or another date of the same one, was picked.
    effect(() => {
      const key = this.contentKey();
      untracked(() => this.load(key));
    });

    // The calendar reloaded (a change here, in another tab or by someone else):
    // what is shown is read again, quietly.
    let seen = this.data.items();
    effect(() => {
      const items = this.data.items();
      if (items === seen) return;
      seen = items;
      untracked(() => this.refresh());
    });
  }

  private load(key: string) {
    this.event.set(null);
    this.fetchedTask.set(null);
    this.people.set([]);
    this.peopleLoaded.set(false);
    this.everyoneKnown.set(false);
    this.prompt.set(null);
    this.error.set(null);
    this.loadError.set(null);
    this.moving.set(false);

    const selection = this.selection();
    if (selection.kind === 'Task') {
      this.loading.set(false);
      if (!this.board.taskOf(selection.id)) this.loadTask(selection.id, key);
      else this.loadPeople([], key);
      return;
    }

    this.loading.set(true);
    this.events.getById(selection.id).subscribe({
      next: event => {
        if (key !== this.contentKey()) return;
        this.event.set(event);
        this.loading.set(false);
        this.loadPeople(this.guestIds(event), key);
      },
      error: err => {
        if (key !== this.contentKey()) return;
        this.loading.set(false);
        this.loadError.set(err?.status === 404
          ? t('This event no longer exists.')
          : err?.status === 403
            ? t('You do not have access to this event.')
            : apiErrorMessage(err, t('The event could not be loaded.')));
      }
    });
  }

  private loadTask(id: string, key: string) {
    this.loading.set(true);
    this.taskApi.getTaskById(id).subscribe({
      next: task => {
        if (key !== this.contentKey()) return;
        this.fetchedTask.set(task);
        this.loading.set(false);
        this.loadPeople([], key);
      },
      error: err => {
        if (key !== this.contentKey()) return;
        this.loading.set(false);
        this.loadError.set(err?.status === 404
          ? t('This task no longer exists.')
          : apiErrorMessage(err, t('The task could not be loaded.')));
      }
    });
  }

  private refresh() {
    const selection = this.selection();
    const key = this.contentKey();
    if (selection.kind !== 'Event' || this.loading() || this.loadError()) return;

    this.events.getById(selection.id).subscribe({
      next: event => {
        if (key !== this.contentKey()) return;
        this.event.set(event);
        this.loadPeople(this.guestIds(event), key);
      },
      // Gone since: the panel has nothing left to show.
      error: err => { if (err?.status === 404 && key === this.contentKey()) this.closed.emit(); }
    });
  }

  /** Everyone in the event. The user is named too: with others asked for, the answer has only those named. */
  private guestIds(event: EventDto): string[] {
    const others = [...new Set([event.ownerId, ...event.attendees.map(guest => guest.userId)])]
      .filter(id => id && id !== this.myId);
    return others.length && this.myId ? [this.myId, ...others] : others;
  }

  /**
   * Time zones and busy times around the item, for the "in London" line and the
   * suggestion. Free time is only shared between friends and teammates: when a
   * guest is neither, the user's own is all there is.
   */
  private loadPeople(ids: string[], key: string) {
    const start = this.start();
    const end = this.end();
    if (!start || !end) return;
    const from = new Date(start.getTime() - 60 * MINUTE);
    const to = new Date(Math.max(end.getTime(), start.getTime()) + 12 * 60 * MINUTE);

    this.schedule.getAvailability(ids, from, to).subscribe({
      next: people => {
        if (key !== this.contentKey()) return;
        this.people.set(people);
        this.peopleLoaded.set(true);
        this.everyoneKnown.set(true);
      },
      error: () => {
        if (!ids.length) return;
        this.schedule.getAvailability([], from, to).pipe(catchError(() => of(null)))
          .subscribe(people => {
            if (!people || key !== this.contentKey()) return;
            this.people.set(people);
            this.peopleLoaded.set(true);
            this.everyoneKnown.set(false);
          });
      }
    });
  }

  // ── Answering an invitation ────────────────────────────────────────────────

  respond(status: Answer) {
    const event = this.event();
    if (!event || this.busy() || event.myResponse === status) return;

    this.run(this.events.respond(event.id, status), t('Your answer was not saved.'), updated => {
      // Trust the server's copy when it sends one; otherwise patch what changed.
      this.event.set((updated as EventDto)?.id ? updated as EventDto : { ...event, myResponse: status });
      this.data.reload();
    });
  }

  // ── Changing ───────────────────────────────────────────────────────────────

  edit() {
    if (this.occurrence()) {
      this.prompt.set('edit-which');
      return;
    }
    this.openEditor(false);
  }

  openEditor(onlyThisDate: boolean) {
    const event = this.event();
    if (!event) return;
    this.prompt.set(null);

    this.actions.edit(event, onlyThisDate ? this.occurrence() ?? undefined : undefined)
      .subscribe(saved => { if (saved) this.data.reload(); });
  }

  /** Puts a moved or renamed date back the way the series has it. */
  restore() {
    const event = this.event();
    const occurrence = this.occurrence();
    if (!event || !occurrence || this.busy()) return;

    this.run(this.events.restoreOccurrence(event.id, occurrence.occurrenceStart),
      t('That date could not be put back.'), () => this.data.reload());
  }

  // ── Removing ───────────────────────────────────────────────────────────────

  askDelete() {
    this.prompt.set(this.occurrence() ? 'delete-which' : 'delete');
  }

  /** Takes one date out of a repeating event; the rest of the series stays. */
  skipThisDate() {
    const event = this.event();
    const occurrence = this.occurrence();
    if (!event || !occurrence || this.busy()) return;

    this.run(
      this.events.saveOccurrence(event.id, { occurrenceStart: occurrence.occurrenceStart, cancelled: true }),
      t('That date could not be removed.'), () => this.removed());
  }

  deleteEvent() {
    const event = this.event();
    if (!event || this.busy()) return;
    this.run(this.events.delete(event.id), t('The event could not be deleted.'), () => this.removed());
  }

  private removed() {
    this.data.reload();
    this.closed.emit();
  }

  cancelPrompt() {
    this.prompt.set(null);
  }

  /** Runs a change: one at a time, and a failure says why. */
  private run<T>(request: Observable<T>, failure: string, done: (result: T) => void) {
    this.busy.set(true);
    this.error.set(null);

    request.subscribe({
      next: result => {
        this.busy.set(false);
        this.prompt.set(null);
        done(result);
      },
      error: err => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, failure));
      }
    });
  }

  // ── A task's time block ────────────────────────────────────────────────────

  /** Opens the small form with the block's time, or for a task without one the next free stretch today. */
  startMoving() {
    const task = this.task();
    if (!task) return;
    const zone = this.board.zone();
    const from = task.startDate ? new Date(task.startDate) : this.nextFreeToday(task);
    this.moveDate.set(dateInputInZone(from, zone));
    this.moveTime.set(timeInputInZone(from, zone));
    this.moving.set(true);
  }

  private nextFreeToday(task: TaskDto): Date {
    const zone = this.board.zone();
    const today = cellOfInstant(this.board.now(), zone);
    const parts = zonedParts(this.board.now(), zone);
    const length = estimateMinutes(task) ?? DEFAULT_BLOCK_MINUTES;
    const from = Math.max(this.board.workStart(), Math.ceil((parts.hour * 60 + parts.minute) / 15) * 15);
    return this.board.instantOn(today, Math.min(from, 24 * 60 - length));
  }

  setMoveDate(event: Event) {
    this.moveDate.set((event.target as HTMLInputElement).value);
  }

  setMoveTime(event: Event) {
    this.moveTime.set((event.target as HTMLInputElement).value);
  }

  saveMove(event?: Event) {
    event?.preventDefault();
    const task = this.task();
    const start = instantFromInputs(this.moveDate(), this.moveTime(), this.board.zone());
    if (!task) return;
    if (!start) {
      this.error.set(t('Pick a day and a time for the block.'));
      return;
    }
    this.error.set(null);
    this.moving.set(false);
    this.board.planTask(task, start);
  }

  unplan() {
    const task = this.task();
    if (task) this.board.unplanTask(task);
  }

  // ── The suggestion ─────────────────────────────────────────────────────────

  dismiss(suggestion: Suggestion) {
    this.dismissed.update(keys => new Set(keys).add(suggestion.key));
  }

  /** Moves the item to the suggested time; "Undo" in the toast puts it back. */
  applySuggestion(suggestion: Suggestion) {
    if (this.busy()) return;
    const task = this.task();
    if (this.isTask()) {
      if (task) this.board.planTask(task, suggestion.start);
      return;
    }

    const event = this.event();
    const before = { start: this.start(), end: this.end() };
    if (!event || !before.start || !before.end) return;

    this.run(this.moveEvent(event, suggestion.start, suggestion.end), t('The event was not moved.'), () => {
      this.data.reload();
      this.toasts.show(t('Moved to {time}.', { time: this.board.time(suggestion.start) }), {
        undo: () => this.moveEvent(event, before.start!, before.end!).subscribe({
          next: () => this.data.reload(),
          error: err => this.toasts.show(apiErrorMessage(err, t('The event was not moved back.')), { tone: 'var(--mq-late)' })
        })
      });
    });
  }

  /** One date of a repeating event moves on its own; any other event moves as a whole. */
  private moveEvent(event: EventDto, start: Date, end: Date): Observable<unknown> {
    const occurrence = this.occurrence();
    if (occurrence) {
      return this.events.saveOccurrence(event.id, {
        occurrenceStart: occurrence.occurrenceStart, cancelled: false,
        startsAt: start.toISOString(), endsAt: end.toISOString(),
        title: occurrence.title, location: occurrence.location
      });
    }

    const body: SaveEventDto = {
      title: event.title, description: event.description, location: event.location,
      startsAt: start.toISOString(), endsAt: end.toISOString(), isAllDay: event.isAllDay,
      recurrence: event.recurrence, recurrenceInterval: event.recurrenceInterval,
      recurrenceEndDate: event.recurrenceEndDate, calendarId: event.calendarId, groupId: event.groupId
    };
    return this.events.update(event.id, body);
  }

  close() {
    this.closed.emit();
  }
}
