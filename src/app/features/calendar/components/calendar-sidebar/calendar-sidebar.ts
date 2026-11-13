import {
  ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnInit, computed, inject, signal
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';

import { CalendarService } from '../../../../core/services/calendar.service';
import { CalendarDataService } from '../../../../core/services/calendar-data.service';
import { CalendarStateService, PERSONAL_CALENDAR_ID } from '../../../../core/services/calendar-state.service';
import { EventService } from '../../../../core/services/event.service';
import { LocalPrefsService } from '../../../../core/services/local-prefs.service';
import { RealtimeService } from '../../../../core/services/realtime.service';
import { ReminderService } from '../../../../core/services/reminder.service';
import { ToastService } from '../../../../core/services/toast.service';
import { apiErrorMessage } from '../../../../core/http/api-error';
import { t, tCount } from '../../../../core/i18n/i18n';
import { NumPipe, TCountPipe, TPipe } from '../../../../core/i18n/t.pipe';
import { AttendeeStatus, EventDto, ReminderDto, UserCalendarDto } from '../../../../models/api.models';
import { occasionSummary } from '../../../../core/utils/occasions';
import { isValidTimeZone, timeZoneLabel } from '../../../../core/utils/time-zone';
import { BoardDay, CalendarBoard, PlanTask } from '../../calendar-board.service';
import { DEFAULT_TASK_COLOR } from '../../calendar-chips';
import { isolate, listOf, loadLevel, monthAndYear, monthName, shortDate, weekdayName } from '../../calendar-layout';
import { EventActions } from '../../event-actions.service';
import { openGoogleImport } from '../google-import/google-import';
import { CALENDAR_COLORS } from './calendar-colors';

interface MiniDay {
  day: BoardDay;
  /** 0 to 3: the mark under the date. */
  load: number;
  /** In the week (or the day) the main view is on. */
  inView: boolean;
  /** "Eid al-Fitr": the day's public holidays and occasions, or ''. */
  occasions: string;
}

/** A project (or "Personal") whose tasks can be switched on and off. */
interface ProjectFilter {
  id: string;
  name: string;
  color: string;
}

/** The calendar being added or changed in the small form. */
interface CalendarDraft {
  /** null while adding. */
  id: string | null;
  name: string;
  color: string;
}

interface Layer {
  id: 'prayer' | 'hijri' | 'occasions' | 'zone';
  label: string;
  hint: string;
  on: boolean;
  /** Why the switch cannot be used, when it cannot. */
  disabled: string;
}

/** How many tasks "To plan" lists before "Show all". */
const PLAN_LIMIT = 6;

/** The API's limit for an .ics file, checked here first. */
const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

const SNOOZES = [
  { minutes: 10, label: t('{n} minutes@@ring again in', { n: 10 }) },
  { minutes: 60, label: t('1 hour@@ring again in') },
  { minutes: 1440, label: t('Tomorrow') }
];

/**
 * The calendar's left column (design/miqat-2.0: Main): the month at a glance with
 * how full each day is, the tasks that wait for a time block, the calendars and
 * projects that can be switched off, and the layers. Invitations and the next
 * reminders join it when there are any.
 */
@Component({
  selector: 'app-calendar-sidebar',
  standalone: true,
  imports: [RouterLink, TPipe, TCountPipe, NumPipe],
  templateUrl: './calendar-sidebar.html',
  styleUrl: './calendar-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalendarSidebar implements OnInit {
  private calendarApi = inject(CalendarService);
  private eventApi = inject(EventService);
  private reminderApi = inject(ReminderService);
  private realtime = inject(RealtimeService);
  private prefs = inject(LocalPrefsService);
  private toasts = inject(ToastService);
  private actions = inject(EventActions);
  private dialog = inject(MatDialog);
  private destroyRef = inject(DestroyRef);
  readonly state = inject(CalendarStateService);
  readonly data = inject(CalendarDataService);
  readonly board = inject(CalendarBoard);

  readonly calendarColors = CALENDAR_COLORS;
  readonly snoozes = SNOOZES;

  /** The calendar form, when it is open. */
  readonly draft = signal<CalendarDraft | null>(null);
  readonly savingCalendar = signal(false);
  /** Id of the invitation being answered, so its buttons can wait. */
  readonly answering = signal<string | null>(null);
  readonly reminders = signal<ReminderDto[]>([]);
  /** Id of the reminder whose snooze choices are open. */
  readonly snoozeOpenFor = signal<string | null>(null);
  readonly menuOpen = signal(false);
  readonly importing = signal(false);
  readonly showAllPlan = signal(false);
  readonly error = signal<string | null>(null);

  readonly monthName = computed(() => monthName(this.state.currentMonth()));
  readonly monthLabel = computed(() => monthAndYear(this.state.currentMonth()));

  readonly dayInitials = computed(() => {
    const start = this.data.weekStart();
    return Array.from({ length: 7 }, (_, index) => weekdayName((start + index) % 7, 'narrow'));
  });

  /** The month on screen, each day with its load mark. */
  readonly miniDays = computed<MiniDay[]>(() => {
    const view = this.state.view();
    const week = new Set(this.board.week().map(day => day.key));
    return this.board.monthWeeks().flat().map(day => ({
      day,
      load: day.inMonth ? loadLevel(day.count) : 0,
      inView: view === 'week' ? week.has(day.key) : day.isSelected,
      occasions: listOf(day.occasions.map(mark => mark.occasion.name))
    }));
  });

  // ── To plan ────────────────────────────────────────────────────────────────

  readonly planRows = computed<PlanTask[]>(() => {
    const all = this.board.toPlan();
    return this.showAllPlan() ? all : all.slice(0, PLAN_LIMIT);
  });

  readonly planHidden = computed(() => Math.max(0, this.board.toPlan().length - PLAN_LIMIT));

  // ── Projects (tasks) ───────────────────────────────────────────────────────

  /** One row per project, plus "Personal" when there are tasks that belong to no project. */
  readonly projects = computed<ProjectFilter[]>(() => {
    const rows: ProjectFilter[] = this.data.groups().map(group => ({
      id: group.id,
      name: group.name,
      color: group.color || DEFAULT_TASK_COLOR
    }));

    const hasPersonal = this.data.tasks().some(task => !task.groupId)
      || this.data.items().some(item => item.kind === 'Task' && !item.groupId);
    if (hasPersonal) rows.push({ id: PERSONAL_CALENDAR_ID, name: t('Personal'), color: DEFAULT_TASK_COLOR });
    return rows;
  });

  // ── Layers ─────────────────────────────────────────────────────────────────

  readonly layers = computed<Layer[]>(() => {
    const secondZone = this.prefs.secondZoneId();
    const secondValid = isValidTimeZone(secondZone);
    return [
      {
        id: 'prayer', label: t('Prayer times'), hint: this.board.prayerHint(),
        on: this.board.prayerOn(),
        disabled: this.board.place()
          ? ''
          : t('Prayer times need a city, and none is known for the time zone in your profile.')
      },
      {
        id: 'hijri', label: t('Hijri dates'), hint: t('Shown under each day'),
        on: this.prefs.hijriDates(), disabled: ''
      },
      {
        id: 'occasions', label: t('Holidays and occasions'), hint: this.board.occasionsHint(),
        on: this.prefs.occasions(), disabled: ''
      },
      {
        id: 'zone', label: t('Second time zone'),
        hint: !secondValid ? t('Pick one in Settings')
          : secondZone === this.board.zone() ? t('Same as the calendar’s zone') : timeZoneLabel(secondZone),
        on: this.prefs.secondZone() && secondValid,
        disabled: secondValid ? '' : t('No second time zone is chosen yet. Pick one in Settings.')
      }
    ];
  });

  ngOnInit() {
    this.loadReminders();
    // A reminder that just rang, or an event that changed, moves this list.
    this.realtime.notification$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadReminders());
  }

  // ── Mini month ─────────────────────────────────────────────────────────────

  /** "Thursday, 12 November 2026, Eid al-Fitr, 3 items" */
  dayLabel(cell: MiniDay): string {
    return listOf([
      cell.day.label, cell.occasions, cell.day.count ? tCount(cell.day.count, '{n} item', '{n} items') : ''
    ]);
  }

  /** Jump the main view to a day. */
  selectDay(day: BoardDay) {
    this.state.selectDate(day.date);
  }

  /**
   * The next holidays and occasions, listed under their layer: "Coptic Christmas · Thu 7 Jan".
   * The year is said when it is not this one.
   */
  readonly comingUp = computed(() => {
    const thisYear = this.board.todayKey().slice(0, 4);
    return this.board.nextOccasions().map(occasion => {
      const [year, month, day] = occasion.date.split('-').map(Number);
      return {
        id: occasion.id,
        name: occasion.name,
        date: occasion.date,
        holiday: occasion.kind === 'holiday',
        when: shortDate(new Date(year, month - 1, day), undefined, String(year) !== thisYear),
        title: occasionSummary(occasion)
      };
    });
  });

  /** Open the calendar on an occasion's first day (`yyyy-mm-dd`). */
  showOccasion(date: string) {
    const [year, month, day] = date.split('-').map(Number);
    this.state.selectDate(new Date(year, month - 1, day));
  }

  /** A task dropped on a date gets a block that day. */
  overDay(event: DragEvent) {
    if (this.board.dragging()) event.preventDefault();
  }

  dropOnDay(event: DragEvent, day: BoardDay) {
    const task = this.board.dragging();
    if (!task) return;
    event.preventDefault();
    this.board.dragging.set(null);
    this.board.planTaskOnDay(task, day.date);
  }

  // ── To plan ────────────────────────────────────────────────────────────────

  startDrag(event: DragEvent, row: PlanTask) {
    event.dataTransfer?.setData('text/plain', row.task.title);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.board.dragging.set(row.task);
  }

  endDrag() {
    this.board.dragging.set(null);
  }

  /** Opens the task in the detail panel, where it can be given a time without dragging. */
  openPlan(row: PlanTask) {
    this.state.select({ kind: 'Task', id: row.task.id });
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
        this.error.set(apiErrorMessage(err, t('Your answer was not saved.')));
      }
    });
  }

  openEvent(eventId: string) {
    this.state.select({ kind: 'Event', id: eventId });
  }

  /** "from Mariam Adel" */
  invitationFrom(event: EventDto): string {
    return t('from {name}', { name: event.ownerName ? isolate(event.ownerName) : t('someone') });
  }

  invitationWhen(event: EventDto): string {
    const start = new Date(event.startsAt);
    if (Number.isNaN(start.getTime())) return '';
    // An all-day event keeps the date it was given, in whatever zone it was made.
    if (event.isAllDay) return `${this.board.shortAllDay(start, new Date(event.endsAt))} · ${t('All day')}`;
    return `${this.board.shortDay(start)} · ${this.board.time(start)}`;
  }

  // ── My calendars ───────────────────────────────────────────────────────────

  /** Shows or hides a calendar. The row changes at once; the server is told behind it. */
  toggleCalendar(calendar: UserCalendarDto) {
    const isVisible = !calendar.isVisible;
    this.patchCalendar(calendar.id, { isVisible });
    this.error.set(null);

    this.calendarApi.updateCalendar(calendar.id, { isVisible }).subscribe({
      // A calendar that comes back on has to be fetched: hidden ones are left out of the feed.
      next: () => this.data.reloadItems(),
      error: err => {
        this.patchCalendar(calendar.id, { isVisible: !isVisible });
        this.error.set(apiErrorMessage(err, t('That calendar could not be changed.')));
      }
    });
  }

  private patchCalendar(id: string, changes: Partial<UserCalendarDto>) {
    this.data.calendars.update(list => list.map(calendar => calendar.id === id ? { ...calendar, ...changes } : calendar));
  }

  startAdding() {
    this.menuOpen.set(false);
    const used = new Set(this.data.calendars().map(calendar => calendar.color.toUpperCase()));
    const color = CALENDAR_COLORS.find(candidate => !used.has(candidate.toUpperCase())) ?? CALENDAR_COLORS[0];
    this.draft.set({ id: null, name: '', color });
  }

  startEditing(calendar: UserCalendarDto) {
    this.draft.set({ id: calendar.id, name: calendar.name, color: calendar.color });
  }

  setDraftName(event: Event) {
    const name = (event.target as HTMLInputElement).value;
    this.draft.update(draft => draft ? { ...draft, name } : draft);
  }

  setDraftColor(color: string) {
    this.draft.update(draft => draft ? { ...draft, color } : draft);
  }

  isDraftColor(color: string): boolean {
    return this.draft()?.color.toUpperCase() === color.toUpperCase();
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
      this.error.set(t('Give the calendar a name.'));
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
        this.error.set(apiErrorMessage(err, t('The calendar was not saved.')));
      }
    });
  }

  deleteCalendar() {
    const draft = this.draft();
    const calendar = this.data.calendars().find(candidate => candidate.id === draft?.id);
    if (!calendar || calendar.isDefault || this.savingCalendar()) return;

    const question = calendar.eventCount
      ? tCount(calendar.eventCount,
        'Delete the calendar "{name}"? Its {n} event moves to your default calendar.',
        'Delete the calendar "{name}"? Its {n} events move to your default calendar.', { name: isolate(calendar.name) })
      : t('Delete the calendar "{name}"?', { name: isolate(calendar.name) });
    if (!confirm(question)) return;

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
        this.error.set(apiErrorMessage(err, t('The calendar was not deleted.')));
      }
    });
  }

  isDraftDefault(): boolean {
    const id = this.draft()?.id;
    return !!this.data.calendars().find(calendar => calendar.id === id)?.isDefault;
  }

  // ── Projects (tasks) ───────────────────────────────────────────────────────

  toggleProject(id: string) {
    this.state.toggleCalendar(id);
  }

  isProjectVisible(id: string): boolean {
    return this.state.isCalendarVisible(id);
  }

  // ── Layers ─────────────────────────────────────────────────────────────────

  toggleLayer(layer: Layer) {
    if (layer.disabled) return;
    const pref = layer.id === 'prayer' ? this.prefs.prayerTimes
      : layer.id === 'hijri' ? this.prefs.hijriDates
      : layer.id === 'occasions' ? this.prefs.occasions
      : this.prefs.secondZone;
    pref.set(!pref());
  }

  // ── New event, .ics files, settings ────────────────────────────────────────

  toggleMenu(event: Event) {
    event.stopPropagation();
    this.menuOpen.update(open => !open);
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  closeMenu() {
    if (this.menuOpen()) this.menuOpen.set(false);
  }

  newEvent() {
    this.menuOpen.set(false);
    this.actions.newEvent();
  }

  exportIcs() {
    this.menuOpen.set(false);
    this.calendarApi.exportIcs().subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'miqat.ics';
        link.click();
        URL.revokeObjectURL(url);
        this.toasts.show(t('Your events were saved as miqat.ics.'));
      },
      error: err => this.fail(apiErrorMessage(err, t('The calendar could not be exported.')))
    });
  }

  importIcs(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.menuOpen.set(false);
    if (!file || this.importing()) return;

    if (file.size > IMPORT_MAX_BYTES) {
      this.fail(t('That file is too large ({n} MB at most).', { n: IMPORT_MAX_BYTES / (1024 * 1024) }));
      return;
    }

    this.importing.set(true);
    this.calendarApi.importIcs(file).subscribe({
      next: result => {
        this.importing.set(false);
        const parts = [t('{n} added', { n: result.imported })];
        if (result.updated) parts.push(t('{n} updated', { n: result.updated }));
        if (result.skipped) parts.push(t('{n} could not be read', { n: result.skipped }));
        this.toasts.show(t('Import finished: {summary}.', { summary: listOf(parts) }));
        this.data.reload();
      },
      error: err => {
        this.importing.set(false);
        this.fail(apiErrorMessage(err, t('That file could not be imported.')));
      }
    });
  }

  /** The chooser tells its own story and reloads the calendar when events came in. */
  importFromGoogle() {
    this.menuOpen.set(false);
    openGoogleImport(this.dialog);
  }

  private fail(text: string) {
    this.toasts.show(text, { tone: 'var(--mq-late)' });
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
      error: err => this.error.set(apiErrorMessage(err, t('That reminder was not snoozed.')))
    });
  }

  removeReminder(reminder: ReminderDto) {
    this.error.set(null);
    this.reminderApi.delete(reminder.id).subscribe({
      next: () => this.reminders.update(list => list.filter(other => other.id !== reminder.id)),
      error: err => this.error.set(apiErrorMessage(err, t('That reminder was not removed.')))
    });
  }

  openReminder(reminder: ReminderDto) {
    this.state.select({ kind: reminder.itemKind, id: reminder.itemId });
  }

  ringsAt(reminder: ReminderDto): string {
    if (!reminder.remindAt) return '';
    const date = new Date(reminder.remindAt);
    return `${this.board.shortDay(date)} · ${this.board.time(date)}`;
  }
}
