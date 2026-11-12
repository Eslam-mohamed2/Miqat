import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';

import { EventService } from '../../../../core/services/event.service';
import { CalendarDataService } from '../../../../core/services/calendar-data.service';
import { AttendeeDto, AttendeeStatus, CalendarItemDto, EventDto } from '../../../../models/api.models';
import { apiErrorMessage } from '../../../../core/http/api-error';
import { dayKeyInZone, formatTimeInZone } from '../../../../core/utils/time-zone';
import { ItemReminders } from '../../../../shared/item-reminders/item-reminders';
import { ItemAttachments } from '../../../../shared/item-attachments/item-attachments';
import { DEFAULT_EVENT_COLOR } from '../../calendar-chips';
import { EventEditor, EventEditorData, OccurrenceTarget } from '../event-editor/event-editor';

export interface EventWindowData {
  eventId: string;
  /** The zone the calendar is shown in. */
  zone: string;
  /** The date that was clicked, when the window was opened from the calendar. */
  item?: CalendarItemDto;
}

type Answer = Exclude<AttendeeStatus, 'Pending'>;

/** Which question the window is asking before it changes or removes something. */
type Prompt = null | 'edit-which' | 'delete' | 'delete-which';

const ANSWERS: { value: Answer; label: string; icon: string }[] = [
  { value: 'Accepted', label: 'Going', icon: 'check_circle' },
  { value: 'Tentative', label: 'Maybe', icon: 'help' },
  { value: 'Declined', label: 'Can’t go', icon: 'cancel' }
];

const STATUS_TEXT: Record<AttendeeStatus, string> = {
  Accepted: 'Going', Tentative: 'Maybe', Declined: 'Can’t go', Pending: 'No answer yet'
};

/**
 * One event, opened from the calendar, a notification or search: when and where
 * it is, who is coming, the user's own answer when they are invited, and for its
 * owner the ways to change or remove it.
 */
@Component({
  selector: 'app-event-window',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, ItemReminders, ItemAttachments],
  templateUrl: './event-window.html',
  styleUrl: './event-window.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventWindow {
  private events = inject(EventService);
  private dialog = inject(MatDialog);
  private dialogRef = inject(MatDialogRef<EventWindow>);
  private calendarData = inject(CalendarDataService);
  readonly data = inject<EventWindowData>(MAT_DIALOG_DATA);

  readonly zone = this.data.zone;
  readonly item = this.data.item ?? null;
  readonly answers = ANSWERS;

  readonly event = signal<EventDto | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly prompt = signal<Prompt>(null);

  /** True once something was saved, so the calendar behind reloads when this closes. */
  private changed = false;

  /** The clicked date of a repeating event, in the form the editor and the API take. */
  readonly occurrence = computed<OccurrenceTarget | null>(() => {
    const item = this.item;
    if (!item?.isRecurring || !item.occurrenceStart) return null;
    return {
      occurrenceStart: item.occurrenceStart, start: item.start, end: item.end,
      title: item.title, location: item.location
    };
  });

  /** True when this date was moved or renamed away from what the series says. */
  readonly occurrenceChanged = computed(() => {
    const item = this.item;
    const event = this.event();
    if (!item || !event || !this.occurrence()) return false;
    return new Date(item.start).getTime() !== new Date(item.occurrenceStart!).getTime()
      || item.title !== event.title
      || (item.location ?? '') !== (event.location ?? '');
  });

  readonly title = computed(() => this.item?.title ?? this.event()?.title ?? 'Event');
  readonly location = computed(() => this.item ? this.item.location : this.event()?.location);
  readonly color = computed(() => this.event()?.color || this.item?.color || DEFAULT_EVENT_COLOR);

  /** Someone else's event the user is on the guest list of. */
  readonly isInvited = computed(() => {
    const event = this.event();
    return !!event && !event.isOwner && event.myResponse != null;
  });

  /** "Thursday, 13 November · 10:00 – 11:00 AM", in the calendar's zone. */
  readonly when = computed(() => {
    const event = this.event();
    const start = new Date(this.item?.start ?? event?.startsAt ?? '');
    const end = new Date(this.item?.end ?? event?.endsAt ?? '');
    if (Number.isNaN(start.getTime())) return '';

    const allDay = this.item?.isAllDay ?? event?.isAllDay ?? false;
    const hour24 = this.calendarData.use24HourClock();
    const day = (date: Date, long: boolean) => new Intl.DateTimeFormat(undefined, long
      ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: this.zone }
      : { weekday: 'short', day: 'numeric', month: 'short', timeZone: this.zone }).format(date);

    // The last moment that still belongs to the event: an end at midnight is the day before.
    const last = new Date(Math.max(start.getTime(), end.getTime() - 1));
    const sameDay = dayKeyInZone(start, this.zone) === dayKeyInZone(last, this.zone);

    if (allDay) return sameDay ? `${day(start, true)} · All day` : `${day(start, false)} – ${day(last, false)} · All day`;
    if (sameDay) {
      return `${day(start, true)} · ${formatTimeInZone(start, this.zone, hour24)} – ${formatTimeInZone(end, this.zone, hour24)}`;
    }
    return `${day(start, false)}, ${formatTimeInZone(start, this.zone, hour24)} – ${day(end, false)}, ${formatTimeInZone(end, this.zone, hour24)}`;
  });

  /** "Repeats every 2 weeks until 30 Dec 2026", or '' for a one-off. */
  readonly repeats = computed(() => {
    const event = this.event();
    if (!event || event.recurrence === 'None') return '';

    const unit = { Daily: 'day', Weekly: 'week', Monthly: 'month', Yearly: 'year' }[event.recurrence];
    const every = event.recurrenceInterval > 1 ? `every ${event.recurrenceInterval} ${unit}s` : `every ${unit}`;
    const until = event.recurrenceEndDate
      ? ' until ' + new Intl.DateTimeFormat(undefined, {
          day: 'numeric', month: 'short', year: 'numeric', timeZone: this.zone
        }).format(new Date(event.recurrenceEndDate))
      : '';
    return `Repeats ${every}${until}`;
  });

  readonly guestSummary = computed(() => {
    const guests = this.event()?.attendees ?? [];
    if (!guests.length) return '';
    const going = guests.filter(guest => guest.status === 'Accepted').length;
    const waiting = guests.filter(guest => guest.status === 'Pending').length;
    const parts = [`${guests.length} ${guests.length === 1 ? 'guest' : 'guests'}`];
    if (going) parts.push(`${going} going`);
    if (waiting) parts.push(`${waiting} not answered`);
    return parts.join(' · ');
  });

  constructor() {
    // Closing by the backdrop or Escape goes through close() as well, so an
    // answer given here still reloads the calendar behind.
    this.dialogRef.disableClose = true;
    this.dialogRef.backdropClick().subscribe(() => this.close());
    this.dialogRef.keydownEvents().subscribe(event => {
      if (event.key !== 'Escape') return;
      if (this.prompt()) this.prompt.set(null);
      else this.close();
    });

    this.load();
  }

  private load() {
    this.loading.set(true);
    this.loadError.set(null);

    this.events.getById(this.data.eventId).subscribe({
      next: event => {
        this.event.set(event);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(err?.status === 404
          ? 'This event no longer exists.'
          : err?.status === 403
            ? 'You do not have access to this event.'
            : apiErrorMessage(err, 'The event could not be loaded.'));
      }
    });
  }

  // ── Answering an invitation ────────────────────────────────────────────────

  respond(status: Answer) {
    const event = this.event();
    if (!event || this.busy() || event.myResponse === status) return;

    this.run(this.events.respond(event.id, status), 'Your answer was not saved.', updated => {
      // Trust the server's copy when it sends one; otherwise patch what changed.
      this.event.set((updated as EventDto)?.id ? updated as EventDto : { ...event, myResponse: status });
      this.calendarData.reloadLists();
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

    const data: EventEditorData = {
      zone: this.zone, event, occurrence: onlyThisDate ? this.occurrence() ?? undefined : undefined
    };
    this.dialog
      .open(EventEditor, { panelClass: 'custom-dialog-container', autoFocus: false, data })
      .afterClosed()
      // What this window shows came from the calendar and is out of date now, so
      // it closes too and the calendar reloads.
      .subscribe(saved => { if (saved) this.dialogRef.close(true); });
  }

  /** Puts a moved or renamed date back the way the series has it. */
  restore() {
    const event = this.event();
    const occurrence = this.occurrence();
    if (!event || !occurrence || this.busy()) return;

    this.run(this.events.restoreOccurrence(event.id, occurrence.occurrenceStart),
      'That date could not be put back.', () => this.dialogRef.close(true));
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
      'That date could not be removed.', () => this.dialogRef.close(true));
  }

  deleteEvent() {
    const event = this.event();
    if (!event || this.busy()) return;
    this.run(this.events.delete(event.id), 'The event could not be deleted.', () => this.dialogRef.close(true));
  }

  cancelPrompt() {
    this.prompt.set(null);
  }

  /** Runs a change: one at a time, and a failure says why instead of closing the window. */
  private run<T>(request: Observable<T>, failure: string, done: (result: T) => void) {
    this.busy.set(true);
    this.error.set(null);

    request.subscribe({
      next: result => {
        this.busy.set(false);
        this.changed = true;
        this.prompt.set(null);
        done(result);
      },
      error: err => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, failure));
      }
    });
  }

  close() {
    this.dialogRef.close(this.changed);
  }

  // ── Display ────────────────────────────────────────────────────────────────

  statusText(status: AttendeeStatus): string {
    return STATUS_TEXT[status] ?? status;
  }

  initials(name?: string | null): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    return parts.length ? (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase() : '?';
  }

  /** A link is clickable when the place is a web address. */
  isLink(value?: string | null): boolean {
    return /^https?:\/\/\S+$/i.test((value ?? '').trim());
  }

  trackByGuest = (_: number, guest: AttendeeDto) => guest.userId;
}
