import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TaskService } from '../../../../core/services/task.service';
import { GroupService } from '../../../../core/services/group.service';
import { UserService } from '../../../../core/services/user.service';
import { CalendarStateService } from '../../../../core/services/calendar-state.service';
import { GroupDto, TaskDto } from '../../../../models/api.models';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface MiniDay {
  date: Date;
  day: number;
  /** Days spilling in from the neighbouring month are dimmed. */
  inMonth: boolean;
  isToday: boolean;
}

/** A project the user can toggle on and off in the calendar view. */
interface CalendarFilter {
  id: string;
  name: string;
  checked: boolean;
  color: string;
  taskCount: number;
}

interface UpcomingEvent {
  time: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  dayLabel: string;
}

@Component({
  selector: 'app-calendar-sidebar',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './calendar-sidebar.html',
  styleUrl: './calendar-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalendarSidebar implements OnInit {
  private taskService = inject(TaskService);
  private groupService = inject(GroupService);
  private userService = inject(UserService);
  public calendarState = inject(CalendarStateService);

  miniCalendarWeeks = signal<MiniDay[][]>([]);
  calendars = signal<CalendarFilter[]>([]);

  private tasks = signal<TaskDto[]>([]);
  private groups = signal<GroupDto[]>([]);
  loading = signal(true);

  /**
   * The user's profile zone. Reading it as a signal means every label below
   * recomputes the moment the zone changes in Settings — previously all of this
   * used the browser's zone and never updated.
   */
  readonly timeZone = this.userService.timeZone;

  /** "TODAY, 5 AUG" — this was hardcoded as "TODAY, OCT 19" in the template. */
  readonly todayLabel = computed(() => {
    const label = new Intl.DateTimeFormat(undefined, {
      timeZone: this.timeZone(), day: 'numeric', month: 'short'
    }).format(new Date());
    return `TODAY, ${label.toUpperCase()}`;
  });

  readonly upcomingEvents = computed<UpcomingEvent[]>(() => {
    const now = Date.now();
    const groups = this.groups();

    return this.tasks()
      .filter(task => task.dueDate && new Date(task.dueDate).getTime() >= now)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5)
      .map(task => ({
        time: this.formatTimeRange(task.dueDate),
        title: task.title,
        subtitle: this.statusLabel(task.status),
        icon: 'assignment',
        color: groups.find(group => group.id === task.groupId)?.color || '#9ca3af',
        dayLabel: this.formatDay(task.dueDate)
      }));
  });

  constructor() {
    effect(() => {
      // Regenerates when the month changes and when the zone changes, since
      // which day counts as "today" is zone-dependent.
      const month = this.calendarState.currentMonth();
      this.generateMiniCalendar(month, this.timeZone());
    });
  }

  ngOnInit() {
    this.refreshData();
  }

  /**
   * A real month grid: six weeks from the Sunday before the 1st, each cell
   * carrying its own date. The previous version pushed bare day numbers for five
   * weeks with no month awareness, so trailing days were wrong and nothing could
   * be marked as today.
   */
  generateMiniCalendar(monthDate: Date, timeZone: string) {
    const cursor = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    cursor.setDate(cursor.getDate() - cursor.getDay());

    const todayKey = this.dayKey(new Date(), timeZone);
    const weeks: MiniDay[][] = [];

    for (let week = 0; week < 6; week++) {
      const days: MiniDay[] = [];
      for (let day = 0; day < 7; day++) {
        const date = new Date(cursor);
        days.push({
          date,
          day: date.getDate(),
          inMonth: date.getMonth() === monthDate.getMonth(),
          isToday: this.dayKey(date, timeZone) === todayKey
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(days);
    }

    this.miniCalendarWeeks.set(weeks);
  }

  refreshData() {
    this.loading.set(true);

    forkJoin({
      tasks: this.taskService.getTasks().pipe(catchError(() => of([] as TaskDto[]))),
      groups: this.groupService.getGroups().pipe(catchError(() => of([] as GroupDto[])))
    }).subscribe({
      next: result => {
        this.groups.set(result.groups ?? []);
        this.tasks.set(result.tasks ?? []);

        const tasks = result.tasks ?? [];
        this.calendars.set((result.groups ?? []).map(group => ({
          id: group.id,
          name: group.name,
          checked: true,
          color: group.color || '#2ec4a0',
          // Shown on the row so the list says how much is in each project
          // rather than being a column of bare names.
          taskCount: tasks.filter(t => t.groupId === group.id).length
        })));

        this.loading.set(false);
      },
      error: () => {
        this.groups.set([]);
        this.tasks.set([]);
        this.calendars.set([]);
        this.loading.set(false);
      }
    });
  }

  toggleCalendar(id: string) {
    this.calendars.update(list =>
      list.map(cal => (cal.id === id ? { ...cal, checked: !cal.checked } : cal)));
  }

  /** Drives the "Show all / Hide all" affordance above the list. */
  readonly allShown = computed(() => this.calendars().every(c => c.checked));

  /** One click to get back to seeing everything after filtering things out. */
  setAll(checked: boolean) {
    this.calendars.update(list => list.map(cal => ({ ...cal, checked })));
  }

  trackByCalendarId = (_: number, cal: CalendarFilter) => cal.id;

  // ── Formatting, all in the profile's zone ──────────────────────────────────

  formatTimeRange(dateStr: string): string {
    const start = new Date(dateStr);
    if (Number.isNaN(start.getTime())) return '';

    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const format = new Intl.DateTimeFormat(undefined, {
      timeZone: this.timeZone(), hour: '2-digit', minute: '2-digit'
    });
    return `${format.format(start)} - ${format.format(end)}`;
  }

  formatDay(dateStr: string): string {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';

    const zone = this.timeZone();
    if (this.dayKey(date, zone) === this.dayKey(new Date(), zone)) return 'Today';

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (this.dayKey(date, zone) === this.dayKey(tomorrow, zone)) return 'Tomorrow';

    return new Intl.DateTimeFormat(undefined, {
      timeZone: zone, weekday: 'short', day: 'numeric', month: 'short'
    }).format(date);
  }

  private statusLabel(status: string): string {
    return (status ?? '').replace(/_/g, ' ');
  }

  /** yyyy-mm-dd as seen in a given zone, for same-day comparisons. */
  private dayKey(date: Date, timeZone: string): string {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(date);
    } catch {
      // An unrecognised zone from the profile must not break the calendar.
      return new Intl.DateTimeFormat('en-CA').format(date);
    }
  }

  trackByDay(_index: number, day: MiniDay): number {
    return day.date.getTime();
  }
}
