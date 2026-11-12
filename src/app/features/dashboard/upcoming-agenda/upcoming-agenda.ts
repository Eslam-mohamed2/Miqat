import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges,
  computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TaskService } from '../../../core/services/task.service';
import { CalendarService } from '../../../core/services/calendar.service';
import { UserService } from '../../../core/services/user.service';
import { CalendarItemDto, TaskDto } from '../../../models/api.models';
import { dayKeyInZone, formatTimeInZone } from '../../../core/utils/time-zone';

interface AgendaItem {
  id: string;
  title: string;
  description: string;
  day: string;
  time: string;
  color: string;
  /** Events open in the calendar, tasks on their own page. */
  isEvent: boolean;
  link: string[];
  query: Record<string, string> | null;
  /** For the order of the list. */
  at: number;
}

/** How far ahead the list looks. */
const DAYS_AHEAD = 7;

@Component({
  selector: 'app-upcoming-agenda',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  templateUrl: './upcoming-agenda.html',
  styleUrl: './upcoming-agenda.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UpcomingAgenda implements OnInit, OnChanges {
  private taskService = inject(TaskService);
  private calendarService = inject(CalendarService);
  private userService = inject(UserService);

  /** Changes whenever the dashboard wants the list re-read (e.g. a task was added). */
  @Input() refresh = 0;
  /** The "+" in the header: the dashboard owns the add-task dialog. */
  @Output() addTask = new EventEmitter<void>();

  private dueSoon = signal<TaskDto[]>([]);
  /** Events of the same days. Empty on API builds that have no events. */
  private events = signal<CalendarItemDto[]>([]);
  readonly loaded = signal(false);

  /**
   * Each row says which day it is due as well as the time, in the profile's zone.
   * The row used to print the time alone, so a task due next Monday read the same
   * as one due in an hour.
   */
  readonly items = computed<AgendaItem[]>(() => {
    const zone = this.userService.timeZone();
    const todayKey = dayKeyInZone(new Date(), zone);
    const tomorrowKey = dayKeyInZone(new Date(Date.now() + 24 * 60 * 60 * 1000), zone);

    const dayLabel = (date: Date) => {
      const key = dayKeyInZone(date, zone);
      if (key === todayKey) return 'Today';
      if (key === tomorrowKey) return 'Tomorrow';
      return new Intl.DateTimeFormat(undefined, { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(date);
    };

    const tasks: AgendaItem[] = this.dueSoon()
      .filter(task => task.dueDate && !Number.isNaN(new Date(task.dueDate).getTime()))
      .map(task => {
        const due = new Date(task.dueDate);
        return {
          id: task.id,
          title: task.title,
          description: task.description || 'No description',
          day: dayLabel(due),
          time: formatTimeInZone(due, zone),
          color: this.priorityColor(task.priority),
          isEvent: false,
          link: ['/tasks', task.id],
          query: null,
          at: due.getTime()
        };
      });

    const events: AgendaItem[] = this.events()
      .filter(event => event.kind === 'Event' && event.myResponse !== 'Declined')
      .filter(event => !Number.isNaN(new Date(event.start).getTime()))
      .map(event => {
        const start = new Date(event.start);
        return {
          // A repeating event has the same id on every date.
          id: `${event.id}:${event.start}`,
          title: event.title,
          description: event.myResponse === 'Pending'
            ? 'Invitation · not answered yet'
            : event.location || event.calendarName || 'Event',
          day: dayLabel(start),
          time: event.isAllDay ? 'All day' : formatTimeInZone(start, zone),
          color: event.color || '#4F46E5',
          isEvent: true,
          link: ['/calendar'],
          query: { event: event.id, date: dayKeyInZone(start, zone) },
          at: start.getTime()
        };
      });

    return [...tasks, ...events].sort((a, b) => a.at - b.at);
  });

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['refresh'] && !changes['refresh'].firstChange) this.load();
  }

  private load() {
    const now = new Date();
    const until = new Date(now.getTime() + DAYS_AHEAD * 86_400_000);

    forkJoin({
      tasks: this.taskService.getDueSoonTasks(DAYS_AHEAD).pipe(catchError(() => of([] as TaskDto[]))),
      // Answers 404 on API builds without events: the list is then tasks only.
      events: this.calendarService.getFeed(now, until, false).pipe(catchError(() => of([] as CalendarItemDto[])))
    }).subscribe(result => {
      this.dueSoon.set(result.tasks ?? []);
      this.events.set(result.events ?? []);
      this.loaded.set(true);
    });
  }

  private priorityColor(priority: string | undefined): string {
    if (priority === 'High') return '#ef4444';
    if (priority === 'Medium') return '#f4a835';
    if (priority === 'Low') return '#2ec4a0';
    return '#9ca3af';
  }

  trackById = (_: number, item: AgendaItem) => item.id;
}
