import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';

import { UserService } from '../../../../core/services/user.service';
import { CalendarService } from '../../../../core/services/calendar.service';
import { CalendarDataService } from '../../../../core/services/calendar-data.service';
import { EventService } from '../../../../core/services/event.service';
import { ReminderService } from '../../../../core/services/reminder.service';
import { RealtimeService } from '../../../../core/services/realtime.service';
import { CalendarStateService, PERSONAL_CALENDAR_ID } from '../../../../core/services/calendar-state.service';
import {
  AttendeeStatus, CalendarItemDto, EventDto, ReminderDto, UserCalendarDto
} from '../../../../models/api.models';
import { apiErrorMessage } from '../../../../core/http/api-error';
import {
  dayKey, dayKeyInZone, dayKeyOfCell, formatTimeInZone
} from '../../../../core/utils/time-zone';
import { DEFAULT_EVENT_COLOR, DEFAULT_TASK_COLOR, timeRangeLabel } from '../../calendar-chips';

interface MiniDay {
  date: Date;
  day: number;
  /** Days spilling in from the neighbouring month are dimmed. */
  inMonth: boolean;
  isToday: boolean;
  /** The day the main grid is focused on. */
  isSelected: boolean;
}

/** A project (or "Personal") whose tasks can be switched on and off. */
interface ProjectFilter {
  id: string;
  name: string;
  color: string;
  /** Tasks due in the month on screen - what ticking this row shows or hides. */
  taskCount: number;
}

interface UpcomingRow {
  item: CalendarItemDto;
  dayLabel: string;
  time: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
}

/** The calendar being added or changed in the small form. */
interface CalendarDraft {
  /** null while adding. */
  id: string | null;
  name: string;
  color: string;
}

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Colours offered for a calendar. All have enough contrast to carry white or dark text. */
const CALENDAR_COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#F97316', '#EF4444', '#EC4899', '#8B5CF6'];

const SNOOZES = [
  { minutes: 10, label: '10 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 1440, label: 'Tomorrow' }
];

@Component({
  selector: 'app-calendar-sidebar',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './calendar-sidebar.html',
  styleUrl: './calendar-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalendarSidebar implements OnInit {
  private userService = inject(UserService);
  private calendarApi = inject(CalendarService);
  private eventApi = inject(EventService);
  private reminderApi = inject(ReminderService);
  private realtime = inject(RealtimeService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  public calendarState = inject(CalendarStateService);
  public data = inject(CalendarDataService);

  readonly calendarColors = CALENDAR_COLORS;
  readonly snoozes = SNOOZES;

  /** The calendar form, when it is open. */
  draft = signal<CalendarDraft | null>(null);
  savingCalendar = signal(false);
  /** Id of the invitation being answered, so its buttons can wait. */
  answering = signal<string | null>(null);
  reminders = signal<ReminderDto[]>([]);
  /** Id of the reminder whose snooze choices are open. */
  snoozeOpenFor = signal<string | null>(null);
  error = signal<string | null>(null);

  /** The zone the calendar is shown in: picked from the chip, otherwise the profile's. */
  readonly timeZone = computed(() => this.calendarState.displayZone() ?? this.userService.timeZone());

  readonly dayInitials = computed(() => {
    const start = this.data.weekStart();
    return DAY_INITIALS.map((_, index) => DAY_INITIALS[(start + index) % 7]);
  });

  readonly todayLabel = computed(() => {
    const label = new Intl.DateTimeFormat(undefined, {
      timeZone: this.timeZone(), day: 'numeric', month: 'short'
    }).format(new Date());
    return `TODAY, ${label.toUpperCase()}`;
  });

  /** Six weeks from the start of the week that holds the 1st. */
  readonly miniCalendarWeeks = computed<MiniDay[][]>(() => {
    const monthDate = this.calendarState.currentMonth();
    const selectedKey = dayKeyOfCell(this.calendarState.selectedDate());
    const todayKey = dayKeyInZone(new Date(), this.timeZone());

    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const back = (first.getDay() - this.data.weekStart() + 7) % 7;
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1 - back);

    const weeks: MiniDay[][] = [];
    for (let week = 0; week < 6; week++) {
      const days: MiniDay[] = [];
      for (let day = 0; day < 7; day++) {
        const date = new Date(cursor);
        const key = dayKeyOfCell(date);
        days.push({
          date,
          day: date.getDate(),
          inMonth: date.getMonth() === monthDate.getMonth(),
          isToday: key === todayKey,
          isSelected: key === selectedKey
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(days);
    }
    return weeks;
  });

  /**
   * One row per project, plus "Personal" when there are tasks that belong to no
   * project. The number is how many of its tasks fall in the month on screen.
   */
  readonly projects = computed<ProjectFilter[]>(() => {
    const month = this.calendarState.currentMonth();
    const zone = this.timeZone();
    const monthPrefix = dayKey(month.getFullYear(), month.getMonth() + 1, 1).slice(0, 7);

    const dueThisMonth = new Map<string, number>();
    let hasPersonalTasks = false;

    for (const item of this.data.items()) {
      if (item.kind !== 'Task') continue;
      const key = item.groupId || PERSONAL_CALENDAR_ID;
      if (!item.groupId) hasPersonalTasks = true;
      if (dayKeyInZone(new Date(item.start), zone).startsWith(monthPrefix)) {
        dueThisMonth.set(key, (dueThisMonth.get(key) ?? 0) + 1);
      }
    }

    const rows: ProjectFilter[] = this.data.groups().map(group => ({
      id: group.id,
      name: group.name,
      color: group.color || DEFAULT_TASK_COLOR,
      taskCount: dueThisMonth.get(group.id) ?? 0
    }));

    if (hasPersonalTasks) {
      rows.push({
        id: PERSONAL_CALENDAR_ID,
        name: 'Personal',
        color: DEFAULT_TASK_COLOR,
        taskCount: dueThisMonth.get(PERSONAL_CALENDAR_ID) ?? 0
      });
    }
    return rows;
  });

  readonly allProjectsShown = computed(() =>
    this.projects().every(project => this.calendarState.isCalendarVisible(project.id)));

  /** What is next, from now on: events and tasks, minus what is switched off. */
  readonly upcomingRows = computed<UpcomingRow[]>(() => {
    const zone = this.timeZone();
    const hour24 = this.data.use24HourClock();
    const hiddenProjects = this.calendarState.hiddenCalendarIds();
    const hiddenCalendars = new Set(this.data.calendars().filter(c => !c.isVisible).map(c => c.id));
    const groupColors = new Map(this.data.groups().map(group => [group.id, group.color || DEFAULT_TASK_COLOR]));
    const now = Date.now();

    return this.data.upcoming()
      .filter(item => item.kind === 'Task'
        ? !hiddenProjects.has(item.groupId || PERSONAL_CALENDAR_ID) && item.status !== 'Completed'
        : !hiddenCalendars.has(item.calendarId ?? '') && item.myResponse !== 'Declined')
      // Still ahead, or going on right now.
      .filter(item => new Date(item.kind === 'Task' ? item.start : item.end).getTime() >= now)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 6)
      .map(item => {
        const isTask = item.kind === 'Task';
        return {
          item,
          dayLabel: this.formatDay(item.start),
          time: isTask ? `Due ${formatTimeInZone(new Date(item.start), zone, hour24)}` : timeRangeLabel(item, zone, hour24),
          title: item.title,
          subtitle: isTask
            ? item.groupName || 'Personal task'
            : item.myResponse === 'Pending' ? 'Invitation · not answered' : item.location || item.calendarName || 'Event',
          icon: isTask ? 'task_alt' : item.myResponse === 'Pending' ? 'mail' : item.location ? 'place' : 'event',
          color: isTask ? groupColors.get(item.groupId ?? '') ?? DEFAULT_TASK_COLOR : item.color || DEFAULT_EVENT_COLOR
        };
      });
  });

  ngOnInit() {
    this.loadReminders();
    // A reminder that just rang, or an event that changed, moves this list.
    this.realtime.notification$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadReminders());
  }

  /** Jump the main grid to a day. */
  selectDay(day: MiniDay) {
    this.calendarState.selectDate(day.date);
  }

  // ── Invitations ────────────────────────────────────────────────────────────

  answer(event: EventDto, status: Exclude<AttendeeStatus, 'Pending'>) {
    if (this.answering()) return;
    this.answering.set(event.id);
    this.error.set(null);

    this.eventApi.respond(event.id, status).subscribe({
      next: () => {
        this.answering.set(null);
        this.data.reload();
      },
      error: err => {
        this.answering.set(null);
        this.error.set(apiErrorMessage(err, 'Your answer was not saved.'));
      }
    });
  }

  /** Opens the event in its window; the grid component listens for this address. */
  openEvent(eventId: string) {
    this.router.navigate([], { queryParams: { event: eventId }, queryParamsHandling: 'merge' });
  }

  invitationWhen(event: EventDto): string {
    const start = new Date(event.startsAt);
    if (Number.isNaN(start.getTime())) return '';
    const zone = this.timeZone();
    const day = this.formatDay(event.startsAt);
    if (event.isAllDay) return `${day} · All day`;
    return `${day} · ${formatTimeInZone(start, zone, this.data.use24HourClock())}`;
  }

  // ── My calendars ───────────────────────────────────────────────────────────

  /** Shows or hides a calendar. The switch moves at once; the server is told behind it. */
  toggleCalendar(calendar: UserCalendarDto) {
    const isVisible = !calendar.isVisible;
    this.patchCalendar(calendar.id, { isVisible });
    this.error.set(null);

    this.calendarApi.updateCalendar(calendar.id, { isVisible }).subscribe({
      // A calendar that comes back on has to be fetched: hidden ones are left out of the feed.
      next: () => this.data.reloadItems(),
      error: err => {
        this.patchCalendar(calendar.id, { isVisible: !isVisible });
        this.error.set(apiErrorMessage(err, 'That calendar could not be changed.'));
      }
    });
  }

  private patchCalendar(id: string, changes: Partial<UserCalendarDto>) {
    this.data.calendars.update(list => list.map(calendar => calendar.id === id ? { ...calendar, ...changes } : calendar));
  }

  startAdding() {
    const used = new Set(this.data.calendars().map(calendar => calendar.color.toUpperCase()));
    const color = CALENDAR_COLORS.find(candidate => !used.has(candidate.toUpperCase())) ?? CALENDAR_COLORS[0];
    this.draft.set({ id: null, name: '', color });
  }

  startEditing(event: Event, calendar: UserCalendarDto) {
    event.stopPropagation();
    this.draft.set({ id: calendar.id, name: calendar.name, color: calendar.color });
  }

  setDraftName(event: Event) {
    const name = (event.target as HTMLInputElement).value;
    this.draft.update(draft => draft ? { ...draft, name } : draft);
  }

  setDraftColor(color: string) {
    this.draft.update(draft => draft ? { ...draft, color } : draft);
  }

  cancelDraft() {
    this.draft.set(null);
  }

  saveDraft(event?: Event) {
    event?.preventDefault();
    const draft = this.draft();
    const name = draft?.name.trim();
    if (!draft || this.savingCalendar()) return;
    if (!name) {
      this.error.set('Give the calendar a name.');
      return;
    }

    this.savingCalendar.set(true);
    this.error.set(null);
    const request = draft.id
      ? this.calendarApi.updateCalendar(draft.id, { name, color: draft.color })
      : this.calendarApi.createCalendar({ name, color: draft.color });

    request.subscribe({
      next: () => {
        this.savingCalendar.set(false);
        this.draft.set(null);
        this.data.reload();
      },
      error: err => {
        this.savingCalendar.set(false);
        this.error.set(apiErrorMessage(err, 'The calendar was not saved.'));
      }
    });
  }

  deleteCalendar() {
    const draft = this.draft();
    const calendar = this.data.calendars().find(candidate => candidate.id === draft?.id);
    if (!calendar || calendar.isDefault || this.savingCalendar()) return;

    const events = calendar.eventCount
      ? ` Its ${calendar.eventCount} ${calendar.eventCount === 1 ? 'event moves' : 'events move'} to your default calendar.`
      : '';
    if (!confirm(`Delete the calendar "${calendar.name}"?${events}`)) return;

    this.savingCalendar.set(true);
    this.error.set(null);
    this.calendarApi.deleteCalendar(calendar.id).subscribe({
      next: () => {
        this.savingCalendar.set(false);
        this.draft.set(null);
        this.data.reload();
      },
      error: err => {
        this.savingCalendar.set(false);
        this.error.set(apiErrorMessage(err, 'The calendar was not deleted.'));
      }
    });
  }

  isDraftDefault(): boolean {
    const id = this.draft()?.id;
    return !!this.data.calendars().find(calendar => calendar.id === id)?.isDefault;
  }

  // ── Projects (tasks) ───────────────────────────────────────────────────────

  toggleProject(id: string) {
    this.calendarState.toggleCalendar(id);
  }

  isProjectVisible(id: string): boolean {
    return this.calendarState.isCalendarVisible(id);
  }

  setAllProjects(visible: boolean) {
    this.calendarState.setAllCalendars(this.projects().map(project => project.id), visible);
  }

  // ── Upcoming ───────────────────────────────────────────────────────────────

  openUpcoming(row: UpcomingRow) {
    if (row.item.kind === 'Task') this.router.navigate(['/tasks', row.item.id]);
    else this.openEvent(row.item.id);
  }

  // ── Reminders ──────────────────────────────────────────────────────────────

  private loadReminders() {
    this.reminderApi.getUpcoming().subscribe({
      next: list => this.reminders.set(
        list.filter(reminder => reminder.remindAt)
          .sort((a, b) => new Date(a.remindAt!).getTime() - new Date(b.remindAt!).getTime())
          .slice(0, 4)),
      // Not there on older API builds: the section simply stays away.
      error: () => this.reminders.set([])
    });
  }

  toggleSnooze(reminder: ReminderDto) {
    this.snoozeOpenFor.update(open => open === reminder.id ? null : reminder.id);
  }

  snooze(reminder: ReminderDto, minutes: number) {
    this.snoozeOpenFor.set(null);
    this.error.set(null);
    this.reminderApi.snooze(reminder.id, minutes).subscribe({
      next: () => this.loadReminders(),
      error: err => this.error.set(apiErrorMessage(err, 'That reminder was not snoozed.'))
    });
  }

  removeReminder(reminder: ReminderDto) {
    this.error.set(null);
    this.reminderApi.delete(reminder.id).subscribe({
      next: () => this.reminders.update(list => list.filter(other => other.id !== reminder.id)),
      error: err => this.error.set(apiErrorMessage(err, 'That reminder was not removed.'))
    });
  }

  openReminder(reminder: ReminderDto) {
    if (reminder.itemKind === 'Task') this.router.navigate(['/tasks', reminder.itemId]);
    else this.openEvent(reminder.itemId);
  }

  ringsAt(reminder: ReminderDto): string {
    if (!reminder.remindAt) return '';
    const date = new Date(reminder.remindAt);
    return `${this.formatDay(reminder.remindAt)} · ${formatTimeInZone(date, this.timeZone(), this.data.use24HourClock())}`;
  }

  // ── Formatting, all in the calendar's zone ─────────────────────────────────

  formatDay(dateStr: string): string {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';

    const zone = this.timeZone();
    const key = dayKeyInZone(date, zone);
    if (key === dayKeyInZone(new Date(), zone)) return 'Today';
    if (key === dayKeyInZone(new Date(Date.now() + 86_400_000), zone)) return 'Tomorrow';

    return new Intl.DateTimeFormat(undefined, {
      timeZone: zone, weekday: 'short', day: 'numeric', month: 'short'
    }).format(date);
  }

  trackByDay = (_: number, day: MiniDay) => day.date.getTime();
  trackById = (_: number, row: { id: string }) => row.id;
  trackByUpcoming = (_: number, row: UpcomingRow) => `${row.item.kind}:${row.item.id}:${row.item.start}`;
}
