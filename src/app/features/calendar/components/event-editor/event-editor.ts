import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { EventService } from '../../../../core/services/event.service';
import { ScheduleService } from '../../../../core/services/schedule.service';
import { UserService } from '../../../../core/services/user.service';
import { AuthService } from '../../../../core/services/auth.service';
import { CalendarDataService } from '../../../../core/services/calendar-data.service';
import {
  ContactDto, EventDto, RecurrencePattern, SaveEventDto, TimeSlotDto
} from '../../../../models/api.models';
import { apiErrorMessage } from '../../../../core/http/api-error';
import {
  dateInputInZone, dayKeyOfCell, formatTimeInZone, instantFromInputs, timeInputInZone, timeZoneLabel,
  zonedParts
} from '../../../../core/utils/time-zone';
import { REMINDER_PRESETS, reminderLabel } from '../../../../core/utils/reminder-label';

/** One date of a repeating event, as the calendar showed it. */
export interface OccurrenceTarget {
  occurrenceStart: string;
  start: string;
  end: string;
  title: string;
  location?: string | null;
}

export interface EventEditorData {
  /** The zone the calendar is shown in; the form's dates and times are read in it. */
  zone: string;
  /** New event: the day (a calendar cell) it starts on. */
  date?: Date;
  /** Edit: the event to change. */
  event?: EventDto;
  /** Edit one date of a repeating event: only its time, title and place change. */
  occurrence?: OccurrenceTarget;
}

interface Guest {
  id: string;
  name: string;
  picture?: string | null;
}

const MINUTE = 60_000;
/** Limits of the API, checked here first so the message is next to the field. */
const MAX_EVENT_DAYS = 31;

const REPEATS: { value: RecurrencePattern; label: string; unit: string }[] = [
  { value: 'None', label: 'Does not repeat', unit: '' },
  { value: 'Daily', label: 'Every day', unit: 'day' },
  { value: 'Weekly', label: 'Every week', unit: 'week' },
  { value: 'Monthly', label: 'Every month', unit: 'month' },
  { value: 'Yearly', label: 'Every year', unit: 'year' }
];

/**
 * The window an event is created and changed in.
 *
 * Dates and times are typed as they read on the calendar - in the zone the
 * calendar is shown in - and turned into moments only when saving, so "09:00"
 * here is the 09:00 the grid shows, whatever zone the device is in.
 */
@Component({
  selector: 'app-event-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './event-editor.html',
  styleUrl: './event-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventEditor {
  private fb = inject(FormBuilder);
  private events = inject(EventService);
  private schedule = inject(ScheduleService);
  private users = inject(UserService);
  private readonly myId = inject(AuthService).getCurrentUserId();
  private dialogRef = inject(MatDialogRef<EventEditor>);
  readonly calendarData = inject(CalendarDataService);
  readonly data = inject<EventEditorData>(MAT_DIALOG_DATA);

  readonly zone = this.data.zone;
  readonly zoneLabel = timeZoneLabel(this.zone);
  readonly event = this.data.event ?? null;
  readonly occurrence = this.data.occurrence ?? null;
  readonly isEdit = !!this.event;
  /** Changing one date of a series: most of the form does not apply. */
  readonly isOccurrence = !!this.occurrence;

  readonly repeats = REPEATS;
  readonly reminderChoices = REMINDER_PRESETS.map(minutes => ({ value: String(minutes), label: reminderLabel(minutes) }));

  readonly form: FormGroup;

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  // Guests
  readonly guests = signal<Guest[]>([]);
  readonly contacts = signal<ContactDto[]>([]);
  readonly guestQuery = signal('');
  readonly guestListOpen = signal(false);

  /** People who can still be added, narrowed by what was typed. */
  readonly guestMatches = computed(() => {
    const taken = new Set(this.guests().map(guest => guest.id));
    const query = this.guestQuery().trim().toLowerCase();
    return this.contacts()
      .filter(contact => !taken.has(contact.id))
      .filter(contact => !query
        || contact.fullName.toLowerCase().includes(query)
        || (contact.email ?? '').toLowerCase().includes(query))
      .slice(0, 6);
  });

  // "Find a time"
  readonly suggestions = signal<TimeSlotDto[] | null>(null);
  readonly suggesting = signal(false);

  /**
   * Who already has something at the chosen time: 'You' and / or guests' names.
   * Only the fact that they are busy is known, never what with.
   */
  readonly busyPeople = signal<string[]>([]);

  /** "You already have something at that time." / "You and Lisa Chen are busy at that time." */
  readonly busyText = computed(() => {
    const people = this.busyPeople();
    if (!people.length) return '';
    if (people.length === 1 && people[0] === 'You') return 'You already have something at that time.';

    const names = people.length > 1
      ? `${people.slice(0, -1).join(', ')} and ${people[people.length - 1]}`
      : people[0];
    return `${names} ${people.length > 1 ? 'are' : 'is'} busy at that time.`;
  });

  private busyTimer?: ReturnType<typeof setTimeout>;
  /** Guards against an older, slower answer overwriting a newer one. */
  private busyRequest = 0;

  /** Minutes between start and end, kept when the start is moved. */
  private duration = 60;

  constructor() {
    const settings = this.calendarData.settings();
    this.duration = settings?.defaultEventMinutes ?? 60;

    const source = this.occurrence
      ? { start: new Date(this.occurrence.start), end: new Date(this.occurrence.end) }
      : this.event
        ? { start: new Date(this.event.startsAt), end: new Date(this.event.endsAt) }
        : this.defaultTimes(settings?.workDayStart);

    const allDay = !this.occurrence && !!this.event?.isAllDay;
    // An all-day event is stored up to the next midnight; the form shows its last day.
    const shownEnd = allDay ? new Date(source.end.getTime() - 1) : source.end;
    this.duration = Math.max(5, Math.round((source.end.getTime() - source.start.getTime()) / MINUTE));

    this.form = this.fb.group({
      title: [this.occurrence?.title ?? this.event?.title ?? '', [Validators.required, Validators.maxLength(200)]],
      isAllDay: [allDay],
      startDate: [dateInputInZone(source.start, this.zone), Validators.required],
      startTime: [timeInputInZone(source.start, this.zone), Validators.required],
      endDate: [dateInputInZone(shownEnd, this.zone), Validators.required],
      endTime: [timeInputInZone(source.end, this.zone), Validators.required],
      recurrence: [this.event?.recurrence ?? 'None'],
      recurrenceInterval: [this.event?.recurrenceInterval ?? 1, [Validators.min(1), Validators.max(99)]],
      recurrenceEndDate: [this.event?.recurrenceEndDate ? dateInputInZone(new Date(this.event.recurrenceEndDate), this.zone) : ''],
      calendarId: [this.event?.calendarId ?? this.calendarData.defaultCalendar()?.id ?? ''],
      groupId: [this.event?.groupId ?? ''],
      location: [this.occurrence?.location ?? this.event?.location ?? '', Validators.maxLength(300)],
      description: [this.event?.description ?? '', Validators.maxLength(2000)],
      // 'default' leaves the choice to the calendar settings.
      reminder: ['default']
    });

    if (this.event) {
      this.guests.set(this.event.attendees.map(attendee => ({
        id: attendee.userId, name: attendee.fullName || 'Unknown', picture: attendee.profilePictureUrl
      })));
    }

    if (!this.isOccurrence) {
      this.users.getContacts().pipe(catchError(() => of([] as ContactDto[])))
        .subscribe(contacts => this.contacts.set(contacts));
    }

    this.checkBusy();
  }

  get heading(): string {
    if (this.isOccurrence) return 'Change this date only';
    return this.isEdit ? 'Edit event' : 'New event';
  }

  get isAllDay(): boolean {
    return !!this.form.get('isAllDay')?.value;
  }

  get repeatsNow(): boolean {
    return this.form.get('recurrence')?.value !== 'None';
  }

  /** "week" -> "weeks" when the interval is more than one. */
  get repeatUnit(): string {
    const unit = REPEATS.find(repeat => repeat.value === this.form.get('recurrence')?.value)?.unit ?? '';
    return Number(this.form.get('recurrenceInterval')?.value) === 1 ? unit : `${unit}s`;
  }

  /** What the default reminder is, so "Default" says what it means. */
  get defaultReminderLabel(): string {
    const minutes = this.calendarData.settings()?.defaultReminderMinutes;
    return minutes === null || minutes === undefined ? 'Default (none)' : `Default (${reminderLabel(minutes).toLowerCase()})`;
  }

  // ── Dates ──────────────────────────────────────────────────────────────────

  /** Today in the calendar's zone: the next full hour. Another day: when the working day starts. */
  private defaultTimes(workDayStart?: string): { start: Date; end: Date } {
    const cell = this.data.date ?? new Date();
    const now = new Date();
    const today = zonedParts(now, this.zone);
    const isToday = dayKeyOfCell(cell) === dateInputInZone(now, this.zone);

    let time = /^\d{2}:\d{2}$/.test(workDayStart ?? '') ? workDayStart! : '09:00';
    if (isToday) {
      const hour = Math.min(23, today.hour + 1);
      time = `${String(hour).padStart(2, '0')}:00`;
    }
    const start = instantFromInputs(dayKeyOfCell(cell), time, this.zone) ?? now;
    return { start, end: new Date(start.getTime() + this.duration * MINUTE) };
  }

  private startInstant(): Date | null {
    const value = this.form.getRawValue();
    return instantFromInputs(value.startDate, this.isAllDay ? '00:00' : value.startTime, this.zone);
  }

  /** For an all-day event: the midnight after its last day. */
  private endInstant(): Date | null {
    const value = this.form.getRawValue();
    if (!this.isAllDay) return instantFromInputs(value.endDate, value.endTime, this.zone);

    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.endDate ?? '');
    if (!day) return null;
    const next = new Date(+day[1], +day[2] - 1, +day[3] + 1);
    return instantFromInputs(dayKeyOfCell(next), '00:00', this.zone);
  }

  /**
   * Looks up whether the user or a guest is busy at the chosen time, a moment
   * after the last change. Only for a new, timed event: an existing event would
   * find itself, and "busy" says little about a whole day.
   */
  private checkBusy() {
    clearTimeout(this.busyTimer);
    if (this.isEdit || this.isAllDay) {
      this.busyPeople.set([]);
      return;
    }

    this.busyTimer = setTimeout(() => {
      const start = this.startInstant();
      const end = this.endInstant();
      if (!start || !end || end.getTime() <= start.getTime()) {
        this.busyPeople.set([]);
        return;
      }

      const request = ++this.busyRequest;
      this.schedule.getAvailability(this.guests().map(guest => guest.id), start, end).subscribe({
        next: people => {
          if (request !== this.busyRequest) return;
          const overlaps = (slot: TimeSlotDto) =>
            new Date(slot.start).getTime() < end.getTime() && new Date(slot.end).getTime() > start.getTime();
          this.busyPeople.set(people
            .filter(person => person.busy.some(overlaps))
            .map(person => person.userId === this.myId ? 'You' : person.fullName || 'A guest')
            // "You" first.
            .sort((a, b) => Number(b === 'You') - Number(a === 'You')));
        },
        // A hint only: without it the event can still be saved.
        error: () => this.busyPeople.set([])
      });
    }, 400);
  }

  /** Moving the start moves the end with it, so the length stays what it was. */
  startChanged() {
    this.checkBusy();
    this.suggestions.set(null);
    const start = this.startInstant();
    if (!start) return;

    if (this.isAllDay) {
      const value = this.form.getRawValue();
      if (value.endDate < value.startDate) this.form.patchValue({ endDate: value.startDate });
      return;
    }
    const end = new Date(start.getTime() + this.duration * MINUTE);
    this.form.patchValue({ endDate: dateInputInZone(end, this.zone), endTime: timeInputInZone(end, this.zone) });
  }

  /** Changing the end changes the length. */
  endChanged() {
    this.checkBusy();
    this.suggestions.set(null);
    const start = this.startInstant();
    const end = this.endInstant();
    if (start && end && !this.isAllDay && end.getTime() > start.getTime()) {
      this.duration = Math.round((end.getTime() - start.getTime()) / MINUTE);
    }
  }

  allDayChanged() {
    this.checkBusy();
    this.suggestions.set(null);
    if (this.isAllDay) return;
    // Back to a timed event: the end follows the start again.
    this.startChanged();
  }

  // ── Guests ─────────────────────────────────────────────────────────────────

  searchGuests(event: Event) {
    this.guestQuery.set((event.target as HTMLInputElement).value);
    this.guestListOpen.set(true);
  }

  addGuest(contact: ContactDto, input: HTMLInputElement) {
    this.guests.update(list => [...list, { id: contact.id, name: contact.fullName, picture: contact.profilePictureUrl }]);
    this.guestQuery.set('');
    input.value = '';
    input.focus();
    this.suggestions.set(null);
    this.checkBusy();
  }

  removeGuest(guest: Guest) {
    this.guests.update(list => list.filter(other => other.id !== guest.id));
    this.suggestions.set(null);
    this.checkBusy();
  }

  /** Closes the list a moment later, so a click on one of its rows still lands. */
  closeGuestList() {
    setTimeout(() => this.guestListOpen.set(false), 150);
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.length ? (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase() : '?';
  }

  // ── Find a time ────────────────────────────────────────────────────────────

  /** Asks the server when everyone is free, from the chosen day on. */
  findTimes() {
    if (this.suggesting()) return;
    const start = this.startInstant();
    const from = start && start.getTime() > Date.now() ? instantFromInputs(this.form.getRawValue().startDate, '00:00', this.zone) : new Date();

    this.suggesting.set(true);
    this.error.set(null);
    this.schedule.suggest({
      attendeeIds: this.guests().map(guest => guest.id),
      durationMinutes: Math.min(24 * 60, Math.max(5, this.duration)),
      from: (from ?? new Date()).toISOString(),
      maxResults: 5,
      workingHoursOnly: true
    }).subscribe({
      next: slots => {
        this.suggestions.set(slots);
        this.suggesting.set(false);
      },
      error: err => {
        this.suggesting.set(false);
        this.error.set(apiErrorMessage(err, 'Free times could not be looked up.'));
      }
    });
  }

  useSlot(slot: TimeSlotDto) {
    const start = new Date(slot.start);
    const end = new Date(slot.end);
    this.duration = Math.round((end.getTime() - start.getTime()) / MINUTE);
    this.form.patchValue({
      startDate: dateInputInZone(start, this.zone), startTime: timeInputInZone(start, this.zone),
      endDate: dateInputInZone(end, this.zone), endTime: timeInputInZone(end, this.zone)
    });
    this.suggestions.set(null);
    this.checkBusy();
  }

  /** "Thu 13 Nov · 10:00 AM – 11:00 AM", in the calendar's zone. */
  slotLabel(slot: TimeSlotDto): string {
    const start = new Date(slot.start);
    const hour24 = this.calendarData.use24HourClock();
    const day = new Intl.DateTimeFormat(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: this.zone
    }).format(start);
    return `${day} · ${formatTimeInZone(start, this.zone, hour24)} – ${formatTimeInZone(new Date(slot.end), this.zone, hour24)}`;
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  save() {
    if (this.saving()) return;
    this.error.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set(this.form.get('title')?.invalid ? 'Give the event a title.' : 'Check the highlighted fields.');
      return;
    }

    const start = this.startInstant();
    const end = this.endInstant();
    if (!start || !end) {
      this.error.set('Fill in when the event starts and ends.');
      return;
    }
    if (end.getTime() <= start.getTime()) {
      this.error.set('The event has to end after it starts.');
      return;
    }
    if (end.getTime() - start.getTime() > MAX_EVENT_DAYS * 86_400_000) {
      this.error.set(`An event cannot be longer than ${MAX_EVENT_DAYS} days.`);
      return;
    }

    const value = this.form.getRawValue();
    const title = String(value.title).trim();
    const location = String(value.location ?? '').trim() || null;

    let request: Observable<unknown>;

    if (this.occurrence && this.event) {
      request = this.events.saveOccurrence(this.event.id, {
        occurrenceStart: this.occurrence.occurrenceStart,
        cancelled: false,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        title,
        location
      });
    } else {
      const repeats = value.recurrence !== 'None';
      let repeatEnd: string | null = null;
      if (repeats && value.recurrenceEndDate) {
        if (value.recurrenceEndDate < value.startDate) {
          this.error.set('The repeat cannot end before the event starts.');
          return;
        }
        // The whole last day counts.
        repeatEnd = instantFromInputs(value.recurrenceEndDate, '23:59', this.zone)?.toISOString() ?? null;
      }

      const body: SaveEventDto = {
        title,
        description: String(value.description ?? '').trim() || null,
        location,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        isAllDay: this.isAllDay,
        recurrence: value.recurrence,
        recurrenceInterval: repeats ? Number(value.recurrenceInterval) || 1 : 1,
        recurrenceEndDate: repeatEnd,
        calendarId: value.calendarId || null,
        groupId: value.groupId || null
      };

      if (this.event) {
        request = this.events.update(this.event.id, body).pipe(switchMap(() => this.saveGuestChanges(this.event!)));
      } else {
        body.attendeeIds = this.guests().map(guest => guest.id);
        if (value.reminder === 'none') body.reminderMinutes = [];
        else if (value.reminder !== 'default') body.reminderMinutes = [Number(value.reminder)];
        request = this.events.create(body);
      }
    }

    this.saving.set(true);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogRef.close(true);
      },
      error: err => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(err, 'The event was not saved.'));
      }
    });
  }

  /** Guests are not part of the update call: new ones are invited, removed ones taken off. */
  private saveGuestChanges(event: EventDto): Observable<unknown> {
    const before = new Set(event.attendees.map(attendee => attendee.userId));
    const after = new Set(this.guests().map(guest => guest.id));
    const added = [...after].filter(id => !before.has(id));
    const removed = [...before].filter(id => !after.has(id));

    const calls: Observable<unknown>[] = removed.map(id => this.events.removeAttendee(event.id, id));
    if (added.length) calls.push(this.events.invite(event.id, added));
    return calls.length ? forkJoin(calls) : of(null);
  }

  close() {
    this.dialogRef.close(false);
  }

  trackByGuest = (_: number, guest: Guest) => guest.id;
  trackByContact = (_: number, contact: ContactDto) => contact.id;
}
