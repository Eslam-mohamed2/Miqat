import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TaskDto } from '../../../models/api.models';
import { UserService } from '../../../core/services/user.service';
import { CalendarStateService } from '../../../core/services/calendar-state.service';
import { dayKeyInZone, dayKeyOfCell } from '../../../core/utils/time-zone';

interface MiniDay {
  date: Date;
  num: number;
  other: boolean;
  today: boolean;
  /** How many tasks are due that day. */
  count: number;
}

@Component({
  selector: 'app-mini-calendar',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './mini-calendar.html',
  styleUrl: './mini-calendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MiniCalendar {
  private router = inject(Router);
  private userService = inject(UserService);
  private calendarState = inject(CalendarStateService);

  readonly daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  /** Handed in by the dashboard, which already has them, instead of fetched again. */
  readonly tasks = input<TaskDto[]>([]);

  /** The month on show (the 1st of it). */
  private month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  readonly monthName = computed(() =>
    this.month().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));

  /** Six weeks from the Sunday before the 1st, in the user's own time zone. */
  readonly grid = computed<MiniDay[]>(() => {
    const month = this.month();
    const zone = this.userService.timeZone();
    const todayKey = dayKeyInZone(new Date(), zone);

    const counts = new Map<string, number>();
    for (const task of this.tasks()) {
      if (!task.dueDate) continue;
      const due = new Date(task.dueDate);
      if (Number.isNaN(due.getTime())) continue;
      const key = dayKeyInZone(due, zone);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const cursor = new Date(month.getFullYear(), month.getMonth(), 1);
    cursor.setDate(cursor.getDate() - cursor.getDay());

    const days: MiniDay[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(cursor);
      const key = dayKeyOfCell(date);
      days.push({
        date,
        num: date.getDate(),
        other: date.getMonth() !== month.getMonth(),
        today: key === todayKey,
        count: counts.get(key) ?? 0
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  });

  prevMonth() {
    this.month.update(month => new Date(month.getFullYear(), month.getMonth() - 1, 1));
  }

  nextMonth() {
    this.month.update(month => new Date(month.getFullYear(), month.getMonth() + 1, 1));
  }

  /**
   * Opens that day in the calendar. A day used to do something only when it had a
   * task (and then opened just the first one in an edit dialog); every other day
   * had a pointer cursor and no effect.
   */
  onDayClick(day: MiniDay) {
    this.calendarState.showDay(day.date, 'day');
    this.router.navigate(['/calendar']);
  }

  label(day: MiniDay): string {
    const date = day.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    if (!day.count) return date;
    return `${date}, ${day.count} ${day.count === 1 ? 'task' : 'tasks'} due`;
  }

  trackByDay = (_: number, day: MiniDay) => day.date.getTime();
}
