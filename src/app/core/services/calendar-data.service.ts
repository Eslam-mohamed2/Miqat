import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { CalendarService } from './calendar.service';
import { EventService } from './event.service';
import { GroupService } from './group.service';
import { TaskService } from './task.service';
import {
  CalendarItemDto, CalendarSettingsDto, DayOfWeekName, EventDto, GroupDto, TaskDto, UserCalendarDto
} from '../../models/api.models';

const DAY_NAMES: DayOfWeekName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** How far ahead the "Upcoming" list looks. */
const UPCOMING_DAYS = 14;

/**
 * What the calendar screen shows, loaded once and shared by its parts (the grid,
 * the side panel, the event window). They used to fetch the same lists separately
 * and could disagree for a moment after a change.
 *
 * On an API build that has no events (the feed answers 404) it falls back to the
 * task list, so the calendar still shows due dates there.
 */
@Injectable({
  providedIn: 'root'
})
export class CalendarDataService {
  private calendarApi = inject(CalendarService);
  private eventApi = inject(EventService);
  private groupApi = inject(GroupService);
  private taskApi = inject(TaskService);

  /** What is on the calendar in the weeks on screen. */
  readonly items = signal<CalendarItemDto[]>([]);
  /** From now on, for the "Upcoming" list; not tied to the month on screen. */
  readonly upcoming = signal<CalendarItemDto[]>([]);
  /** The user's own calendars ("Personal", "Work", ...). */
  readonly calendars = signal<UserCalendarDto[]>([]);
  /** Projects, for the colour of their tasks and the project filter. */
  readonly groups = signal<GroupDto[]>([]);
  /** Events other people invited the user to. */
  readonly invitations = signal<EventDto[]>([]);
  /** null until loaded, and on API builds without calendar settings. */
  readonly settings = signal<CalendarSettingsDto | null>(null);

  /**
   * False until the server is known to have events, and on API builds that have
   * none: the calendar then shows tasks only and nothing offers to create an event.
   */
  readonly eventsAvailable = signal(false);
  readonly loading = signal(true);

  /** 0 (Sunday) to 6 (Saturday): the first column of every week. */
  readonly weekStart = computed(() => {
    const index = DAY_NAMES.indexOf(this.settings()?.weekStartsOn ?? 'Sunday');
    return index < 0 ? 0 : index;
  });

  readonly use24HourClock = computed(() => this.settings()?.use24HourClock ?? false);

  /** Invitations the user has not answered yet. */
  readonly pendingInvitations = computed(() =>
    this.invitations().filter(event => (event.myResponse ?? 'Pending') === 'Pending'));

  readonly defaultCalendar = computed(() =>
    this.calendars().find(calendar => calendar.isDefault) ?? this.calendars()[0] ?? null);

  private probed = false;

  /**
   * Asks the server once whether it has events (older builds answer 404). Called
   * by the top bar so "Quick Add" knows before the calendar was ever opened.
   */
  probe() {
    if (this.probed) return;
    this.probed = true;
    this.calendarApi.getCalendars().subscribe({
      next: calendars => {
        this.calendars.set(calendars);
        this.eventsAvailable.set(true);
      },
      error: err => {
        // Anything but "no such endpoint" says nothing about the build: ask again later.
        if (err?.status !== 404) this.probed = false;
      }
    });
  }

  private range: { from: Date; to: Date } | null = null;
  /** Guards against an older, slower answer overwriting a newer one. */
  private feedRequest = 0;

  /** Sets the dates on screen and loads what falls on them. */
  showRange(from: Date, to: Date) {
    if (this.range && this.range.from.getTime() === from.getTime() && this.range.to.getTime() === to.getTime()) return;
    this.range = { from, to };
    this.reloadItems();
  }

  /** Everything: used when the screen opens and after a change that touches several lists. */
  reload() {
    this.reloadLists();
    this.reloadItems();
  }

  /** Calendars, projects, invitations and settings. */
  reloadLists() {
    forkJoin({
      calendars: this.calendarApi.getCalendars().pipe(catchError(() => of([] as UserCalendarDto[]))),
      groups: this.groupApi.getGroups().pipe(catchError(() => of([] as GroupDto[]))),
      invitations: this.eventApi.getInvitations().pipe(catchError(() => of([] as EventDto[]))),
      settings: this.calendarApi.getSettings().pipe(catchError(() => of(null)))
    }).subscribe(result => {
      this.calendars.set(result.calendars ?? []);
      this.groups.set(result.groups ?? []);
      this.invitations.set(result.invitations ?? []);
      if (result.settings) this.settings.set(result.settings);
    });
  }

  /** The dates on screen and the "Upcoming" list. */
  reloadItems() {
    const range = this.range;
    if (!range) return;

    const request = ++this.feedRequest;
    const now = new Date();
    const ahead = new Date(now.getTime() + UPCOMING_DAYS * 86_400_000);

    forkJoin({
      items: this.feed(range.from, range.to),
      upcoming: this.feed(now, ahead)
    }).subscribe(result => {
      if (request !== this.feedRequest) return;
      this.items.set(result.items);
      this.upcoming.set(result.upcoming);
      this.loading.set(false);
    });
  }

  /** The feed, or on an API build without one the tasks due in that range. */
  private feed(from: Date, to: Date): Observable<CalendarItemDto[]> {
    return this.calendarApi.getFeed(from, to).pipe(
      map(items => {
        this.eventsAvailable.set(true);
        return items;
      }),
      catchError(err => {
        if (err?.status !== 404) return of([] as CalendarItemDto[]);
        this.eventsAvailable.set(false);
        return this.taskApi.getTasks().pipe(
          map(tasks => tasks.map(task => this.taskAsItem(task)).filter((item): item is CalendarItemDto => {
            if (!item) return false;
            const start = new Date(item.start).getTime();
            return start >= from.getTime() && start < to.getTime();
          })),
          catchError(() => of([] as CalendarItemDto[]))
        );
      })
    );
  }

  private taskAsItem(task: TaskDto): CalendarItemDto | null {
    if (!task.dueDate || Number.isNaN(new Date(task.dueDate).getTime())) return null;
    return {
      kind: 'Task', id: task.id, title: task.title, start: task.dueDate, end: task.dueDate,
      isAllDay: false, isRecurring: false, groupId: task.groupId || null, groupName: task.groupName || null,
      isOwner: false, attendeeCount: 0, status: task.status, priority: task.priority,
      isOverdue: task.isOverdue ?? false
    };
  }
}
