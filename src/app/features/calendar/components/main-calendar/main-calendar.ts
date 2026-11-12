import {
  ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnInit, computed, effect, inject, signal, untracked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { merge } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { UserService } from '../../../../core/services/user.service';
import { CalendarService } from '../../../../core/services/calendar.service';
import { CalendarDataService } from '../../../../core/services/calendar-data.service';
import { RealtimeService } from '../../../../core/services/realtime.service';
import {
  CalendarStateService, CalendarView, PERSONAL_CALENDAR_ID
} from '../../../../core/services/calendar-state.service';
import { CalendarItemDto, CalendarViewName } from '../../../../models/api.models';
import { apiErrorMessage } from '../../../../core/http/api-error';
import {
  browserTimeZone, dayKeyInZone, dayKeyOfCell, timeZoneLabel, todayInZone
} from '../../../../core/utils/time-zone';
import { CalendarChip, chipsByDay } from '../../calendar-chips';
import { EventEditor, EventEditorData } from '../event-editor/event-editor';
import { EventWindow, EventWindowData } from '../event-window/event-window';

export interface CalendarDay {
  date: number;
  fullDate: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  chips: CalendarChip[];
}

interface ZoneOption {
  /** null = follow the profile. */
  value: string | null;
  label: string;
  hint: string;
}

/** Items shown per day in the month grid before "+N more". */
const MONTH_CHIP_LIMIT = 3;

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** The .ics import limit of the API, checked here first. */
const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

const VIEW_BY_NAME: Record<CalendarViewName, CalendarView> = {
  Month: 'month', Week: 'week', Day: 'day', Agenda: 'agenda'
};

@Component({
  selector: 'app-main-calendar',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatDialogModule],
  templateUrl: './main-calendar.html',
  styleUrl: './main-calendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MainCalendar implements OnInit {
  private userService = inject(UserService);
  private calendarApi = inject(CalendarService);
  private realtime = inject(RealtimeService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private destroyRef = inject(DestroyRef);
  public calendarState = inject(CalendarStateService);
  public data = inject(CalendarDataService);

  readonly monthChipLimit = MONTH_CHIP_LIMIT;

  /** The task whose small card is open. Events open in their own window instead. */
  selectedTask = signal<CalendarChip | null>(null);
  zoneMenuOpen = signal(false);
  moreMenuOpen = signal(false);
  importing = signal(false);
  /** A short message under the header: the result of an import, or why something failed. */
  notice = signal<{ text: string; isError: boolean } | null>(null);

  readonly view = this.calendarState.view;

  /**
   * The one zone the whole calendar uses: the one picked from the chip, otherwise
   * the profile's. Events are created in it too, so "09:00" in the event window is
   * the same 09:00 the grid shows.
   */
  readonly zone = computed(() => this.calendarState.displayZone() ?? this.userService.timeZone());
  readonly timeZoneLabel = computed(() => timeZoneLabel(this.zone()));

  /** Choices for the zone chip: the profile's zone, this device's, and UTC. */
  readonly zoneOptions = computed<ZoneOption[]>(() => {
    const profile = this.userService.timeZone();
    const device = browserTimeZone();
    const options: ZoneOption[] = [
      { value: null, label: timeZoneLabel(profile), hint: 'From your profile' }
    ];
    if (device !== profile) {
      options.push({ value: device, label: timeZoneLabel(device), hint: 'This device' });
    }
    if (profile !== 'UTC' && device !== 'UTC') {
      options.push({ value: 'UTC', label: 'UTC', hint: 'Coordinated Universal Time' });
    }
    return options;
  });

  /** Column headings, starting on the day the user's week starts on. */
  readonly daysOfWeek = computed(() => {
    const start = this.data.weekStart();
    return DAY_LABELS.map((_, index) => DAY_LABELS[(start + index) % 7]);
  });

  /** The first cell of the six-week grid: the start of the week that holds the 1st. */
  private readonly gridStart = computed(() => {
    const month = this.calendarState.currentMonth();
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const back = (first.getDay() - this.data.weekStart() + 7) % 7;
    return new Date(first.getFullYear(), first.getMonth(), 1 - back);
  });

  /**
   * The feed without what the side panel has switched off: tasks by project, events
   * by calendar. Events in someone else's calendar (invitations) always show.
   */
  private readonly visibleItems = computed<CalendarItemDto[]>(() => {
    const hiddenProjects = this.calendarState.hiddenCalendarIds();
    const hiddenCalendars = new Set(
      this.data.calendars().filter(calendar => !calendar.isVisible).map(calendar => calendar.id));

    return this.data.items().filter(item => item.kind === 'Task'
      ? !hiddenProjects.has(item.groupId || PERSONAL_CALENDAR_ID)
      : !hiddenCalendars.has(item.calendarId ?? ''));
  });

  /** Six weeks, each day carrying what falls on it in the calendar's zone. */
  readonly weeks = computed<CalendarDay[][]>(() => {
    const month = this.calendarState.currentMonth();
    const selectedKey = dayKeyOfCell(this.calendarState.selectedDate());
    const zone = this.zone();
    const todayKey = dayKeyInZone(new Date(), zone);
    const byDay = chipsByDay(this.visibleItems(), {
      zone, hour24: this.data.use24HourClock(), groups: this.data.groups()
    });

    const cursor = new Date(this.gridStart());
    const weeks: CalendarDay[][] = [];
    for (let week = 0; week < 6; week++) {
      const days: CalendarDay[] = [];
      for (let day = 0; day < 7; day++) {
        const fullDate = new Date(cursor);
        const key = dayKeyOfCell(fullDate);
        days.push({
          date: fullDate.getDate(),
          fullDate,
          isCurrentMonth: fullDate.getMonth() === month.getMonth(),
          isToday: key === todayKey,
          isSelected: key === selectedKey,
          chips: byDay.get(key) ?? []
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(days);
    }
    return weeks;
  });

  /** What the grid renders. Week and Day follow the focused day. */
  readonly visibleWeeks = computed<CalendarDay[][]>(() => {
    const all = this.weeks();
    const view = this.view();
    if (view === 'month' || view === 'agenda') return all;

    const week = all.find(row => row.some(day => day.isSelected)) ?? all[0];
    if (view === 'week') return [week];

    return [[week.find(day => day.isSelected) ?? week[0]]];
  });

  /** Agenda view: the days of the month on screen that have something on them. */
  readonly agendaDays = computed<CalendarDay[]>(() =>
    this.weeks().flat().filter(day => day.isCurrentMonth && day.chips.length));

  /** "November 2026", "Nov 8 – 14, 2026" or "Wednesday, November 11, 2026". */
  readonly title = computed(() => {
    const view = this.view();
    const selected = this.calendarState.selectedDate();

    if (view === 'day') {
      return selected.toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      });
    }
    if (view === 'week') {
      const back = (selected.getDay() - this.data.weekStart() + 7) % 7;
      const start = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() - back);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      const month = (date: Date) => date.toLocaleDateString(undefined, { month: 'short' });
      const to = start.getMonth() === end.getMonth() ? `${end.getDate()}` : `${month(end)} ${end.getDate()}`;
      return `${month(start)} ${start.getDate()} – ${to}, ${end.getFullYear()}`;
    }
    return this.calendarState.currentMonth().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  });

  /** What the arrows move by, for their labels. */
  readonly stepUnit = computed(() => this.view() === 'agenda' ? 'month' : this.view());

  constructor() {
    // Loads the weeks on screen, with a day to spare on both sides because the
    // grid's days are in the calendar's zone, not UTC.
    effect(() => {
      const start = this.gridStart();
      const from = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
      const to = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 43);
      untracked(() => this.data.showRange(from, to));
    });

    // Opens on today as the calendar's zone has it. The device can be on another
    // date: late evening in New York is already tomorrow in Cairo.
    effect(() => {
      const today = todayInZone(this.zone());
      untracked(() => this.calendarState.followToday(today));
    });

    // The view from the calendar settings, unless one was already picked.
    effect(() => {
      const preferred = this.data.settings()?.defaultView;
      if (preferred) untracked(() => this.calendarState.applyDefaultView(VIEW_BY_NAME[preferred] ?? 'month'));
    });
  }

  ngOnInit() {
    this.data.reloadLists();
    this.data.reloadItems();

    // Someone changed a task or an event, here or in another tab. A burst of
    // changes (an import, for example) reloads once.
    merge(this.realtime.taskChanged$, this.realtime.eventChanged$)
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.data.reload());

    // Links from a notification or from search: ?date=yyyy-mm-dd&event=<id>.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.get('date') ?? '');
        if (date) this.calendarState.selectDate(new Date(+date[1], +date[2] - 1, +date[3]));

        const eventId = params.get('event');
        if (eventId) {
          this.openEventWindow({ eventId });
          // Dropped from the address so a reload does not open the window again.
          this.router.navigate([], { queryParams: { event: null, date: null }, queryParamsHandling: 'merge', replaceUrl: true });
        }
      });
  }

  step(direction: 1 | -1) {
    this.calendarState.step(direction);
  }

  setToday() {
    this.calendarState.setToday(todayInZone(this.zone()));
  }

  setView(view: CalendarView) {
    this.calendarState.chooseView(view);
  }

  selectDay(day: CalendarDay) {
    this.calendarState.selectDate(day.fullDate);
  }

  /** The day number, and "+N more", open that day on its own. */
  openDay(event: Event, day: CalendarDay) {
    event.stopPropagation();
    this.calendarState.showDay(day.fullDate, 'day');
  }

  /** Month cells show the first few items; the other views show them all. */
  chipsFor(day: CalendarDay): CalendarChip[] {
    return this.view() === 'month' ? day.chips.slice(0, MONTH_CHIP_LIMIT) : day.chips;
  }

  hiddenCount(day: CalendarDay): number {
    return this.view() === 'month' ? Math.max(0, day.chips.length - MONTH_CHIP_LIMIT) : 0;
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  /** A new event on the focused day, or on the day whose "+" was pressed. */
  newEvent(event?: Event, day?: CalendarDay) {
    event?.stopPropagation();
    if (day) this.calendarState.selectDate(day.fullDate);

    const data: EventEditorData = { date: day?.fullDate ?? this.calendarState.selectedDate(), zone: this.zone() };
    this.dialog
      .open(EventEditor, { panelClass: 'custom-dialog-container', autoFocus: false, data })
      .afterClosed()
      .subscribe(saved => { if (saved) this.data.reload(); });
  }

  openChip(event: Event, chip: CalendarChip) {
    event.stopPropagation();
    if (chip.kind === 'Task') {
      this.selectedTask.set(chip);
      return;
    }
    this.openEventWindow({ eventId: chip.id, item: chip.item });
  }

  private openEventWindow(target: { eventId: string; item?: CalendarItemDto }) {
    const data: EventWindowData = { ...target, zone: this.zone() };
    this.dialog
      .open(EventWindow, { panelClass: 'custom-dialog-container', autoFocus: false, data })
      .afterClosed()
      .subscribe(changed => { if (changed) this.data.reload(); });
  }

  // ── Task card ──────────────────────────────────────────────────────────────

  closeTaskCard() {
    this.selectedTask.set(null);
  }

  openTaskPage(chip: CalendarChip) {
    this.selectedTask.set(null);
    this.router.navigate(['/tasks', chip.id]);
  }

  statusLabel(status?: string | null): string {
    return (status ?? '').replace(/_/g, ' ');
  }

  // ── Time zone chip and the "more" menu ─────────────────────────────────────

  toggleZoneMenu(event: Event) {
    event.stopPropagation();
    this.moreMenuOpen.set(false);
    this.zoneMenuOpen.update(open => !open);
  }

  chooseZone(option: ZoneOption) {
    this.calendarState.displayZone.set(option.value);
    this.zoneMenuOpen.set(false);
  }

  isZoneActive(option: ZoneOption): boolean {
    return this.calendarState.displayZone() === option.value;
  }

  toggleMoreMenu(event: Event) {
    event.stopPropagation();
    this.zoneMenuOpen.set(false);
    this.moreMenuOpen.update(open => !open);
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  closeMenus() {
    if (this.zoneMenuOpen()) this.zoneMenuOpen.set(false);
    if (this.moreMenuOpen()) this.moreMenuOpen.set(false);
  }

  // ── .ics files ─────────────────────────────────────────────────────────────

  exportIcs() {
    this.moreMenuOpen.set(false);
    this.calendarApi.exportIcs().subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'miqat.ics';
        link.click();
        URL.revokeObjectURL(url);
        this.say('Your events were saved as miqat.ics.');
      },
      error: err => this.say(apiErrorMessage(err, 'The calendar could not be exported.'), true)
    });
  }

  importIcs(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.moreMenuOpen.set(false);
    if (!file || this.importing()) return;

    if (file.size > IMPORT_MAX_BYTES) {
      this.say('That file is too large (2 MB at most).', true);
      return;
    }

    this.importing.set(true);
    this.calendarApi.importIcs(file).subscribe({
      next: result => {
        this.importing.set(false);
        const parts = [`${result.imported} added`];
        if (result.updated) parts.push(`${result.updated} updated`);
        if (result.skipped) parts.push(`${result.skipped} could not be read`);
        this.say(`Import finished: ${parts.join(', ')}.`);
        this.data.reload();
      },
      error: err => {
        this.importing.set(false);
        this.say(apiErrorMessage(err, 'That file could not be imported.'), true);
      }
    });
  }

  private noticeTimer?: ReturnType<typeof setTimeout>;

  private say(text: string, isError = false) {
    this.notice.set({ text, isError });
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(null), 6000);
  }

  trackByDay = (_: number, day: CalendarDay) => day.fullDate.getTime();
  trackByChip = (_: number, chip: CalendarChip) => chip.key;
}
