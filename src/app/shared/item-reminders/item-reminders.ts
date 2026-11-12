import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import { ReminderService } from '../../core/services/reminder.service';
import { UserService } from '../../core/services/user.service';
import { CalendarItemKind, ReminderDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';
import { REMINDER_PRESETS, reminderLabel } from '../../core/utils/reminder-label';

/** The API allows this many reminders on one task or event. */
const MAX_REMINDERS = 5;

/**
 * "Remind me" for one task or event: the reminders the signed-in user has set on
 * it, and the choices to add another. Used by the task page and the event window,
 * so both behave the same.
 *
 * It hides itself on API builds that have no reminders, rather than showing a
 * section that can only fail.
 */
@Component({
  selector: 'app-item-reminders',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './item-reminders.html',
  styleUrl: './item-reminders.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.unavailable]': '!available()' }
})
export class ItemReminders {
  private reminders = inject(ReminderService);
  private users = inject(UserService);

  readonly kind = input.required<CalendarItemKind>();
  readonly itemId = input.required<string>();

  readonly list = signal<ReminderDto[]>([]);
  readonly loading = signal(true);
  readonly available = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly isFull = computed(() => this.list().length >= MAX_REMINDERS);

  /** The presets, each marked when the user already has it. */
  readonly choices = computed(() => {
    const taken = new Set(this.list().map(reminder => reminder.minutesBefore));
    return REMINDER_PRESETS.map(minutes => ({
      minutes,
      label: reminderLabel(minutes, this.kind()),
      taken: taken.has(minutes)
    }));
  });

  constructor() {
    // Reloads when the component is pointed at another item.
    effect(() => this.load(this.kind(), this.itemId()));
  }

  private load(kind: CalendarItemKind, itemId: string) {
    this.loading.set(true);
    this.error.set(null);

    this.reminders.getForItem(kind, itemId).subscribe({
      next: list => {
        this.list.set(this.sorted(list));
        this.available.set(true);
        this.loading.set(false);
      },
      error: err => {
        // 404 here means the API has no reminders at all (an older build).
        this.available.set(err?.status !== 404);
        this.list.set([]);
        this.loading.set(false);
        if (err?.status !== 404) this.error.set(apiErrorMessage(err, 'Reminders could not be loaded.'));
      }
    });
  }

  add(minutesBefore: number) {
    if (this.busy() || this.isFull()) return;
    this.busy.set(true);
    this.error.set(null);

    this.reminders.add(this.kind(), this.itemId(), minutesBefore).subscribe({
      next: reminder => {
        this.list.update(list => this.sorted([...list.filter(r => r.id !== reminder.id), reminder]));
        this.busy.set(false);
      },
      error: err => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'That reminder was not saved.'));
      }
    });
  }

  remove(reminder: ReminderDto) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);

    this.reminders.delete(reminder.id).subscribe({
      next: () => {
        this.list.update(list => list.filter(r => r.id !== reminder.id));
        this.busy.set(false);
      },
      error: err => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'That reminder was not removed.'));
      }
    });
  }

  label(reminder: ReminderDto): string {
    return reminderLabel(reminder.minutesBefore, this.kind());
  }

  /** "Rings Thu 13 Nov, 4:45 PM", in the profile's time zone. */
  ringsAt(reminder: ReminderDto): string {
    if (!reminder.remindAt) return 'Nothing ahead to remind about';
    const date = new Date(reminder.remindAt);
    if (Number.isNaN(date.getTime())) return '';
    return 'Rings ' + new Intl.DateTimeFormat(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
      timeZone: this.users.timeZone()
    }).format(date);
  }

  private sorted(list: ReminderDto[]): ReminderDto[] {
    return [...list].sort((a, b) => a.minutesBefore - b.minutesBefore);
  }

  trackById = (_: number, reminder: ReminderDto) => reminder.id;
}
