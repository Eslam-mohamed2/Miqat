import {
  ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnInit, computed, effect, inject, signal, untracked
} from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { merge } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { CalendarDataService } from '../../../core/services/calendar-data.service';
import { ChatService } from '../../../core/services/chat.service';
import {
  CalendarSelection, CalendarStateService, CalendarView
} from '../../../core/services/calendar-state.service';
import { QuickAddService } from '../../../core/services/quick-add.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { t } from '../../../core/i18n/i18n';
import { TPipe } from '../../../core/i18n/t.pipe';
import { CalendarViewName } from '../../../models/api.models';
import { todayInZone } from '../../../core/utils/time-zone';
import { UserMenu } from '../../../layout/user-menu/user-menu';
import { CalendarBoard } from '../calendar-board.service';
import { monthAndYear, weekNumberOfRow } from '../calendar-layout';
import { CalendarSidebar } from '../components/calendar-sidebar/calendar-sidebar';
import { EventDetails } from '../components/event-details/event-details';
import { EventWindow, EventWindowData } from '../components/event-window/event-window';
import { MobileDay } from '../components/mobile-day/mobile-day';
import { MonthView } from '../components/month-view/month-view';
import { ScheduleView } from '../components/schedule-view/schedule-view';
import { WeekGrid } from '../components/week-grid/week-grid';

const VIEW_BY_NAME: Record<CalendarViewName, CalendarView> = {
  Month: 'month', Week: 'week', Day: 'day', Agenda: 'agenda'
};

/** The view as the address has it (`?view=`): the list is called "schedule" there. */
const VIEW_BY_PARAM: Record<string, CalendarView> = { day: 'day', week: 'week', month: 'month', schedule: 'agenda' };
const PARAM_BY_VIEW: Record<CalendarView, string> = { day: 'day', week: 'week', month: 'month', agenda: 'schedule' };

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'day', label: t('Day') },
  { value: 'week', label: t('Week') },
  { value: 'month', label: t('Month') },
  { value: 'agenda', label: t('Schedule@@view') }
];

/** Widths the layout changes at (the rail takes 60px of each). */
const PANEL_MIN = '(min-width: 1160px)';   // the detail panel fits beside the grid
const MONTH_SIDE_MIN = '(min-width: 1024px)'; // the month's aside fits beside the grid
const COLUMN_MIN = '(min-width: 900px)';   // the left column fits beside the grid
const PHONE_MAX = '(max-width: 767.98px)';

/**
 * The calendar, the app's home (design/miqat-2.0: Main, V2-Month, V2-MobileDay).
 * The page draws its own header and lays out the columns under it: the left
 * column, the view (day, week, month or schedule) and the detail panel. Where a
 * column does not fit, the left one opens as a sheet and the details as a window.
 */
@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [
    RouterLink, A11yModule, TPipe, UserMenu, CalendarSidebar, WeekGrid, MonthView, ScheduleView, MobileDay, EventDetails
  ],
  templateUrl: './calendar-page.html',
  styleUrl: './calendar-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalendarPage implements OnInit {
  private realtime = inject(RealtimeService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private quickAdd = inject(QuickAddService);
  private destroyRef = inject(DestroyRef);
  readonly state = inject(CalendarStateService);
  readonly data = inject(CalendarDataService);
  readonly board = inject(CalendarBoard);
  /** The chat button floats over the page's bottom corner when chat is on. */
  readonly chat = inject(ChatService);

  readonly views = VIEWS;
  readonly view = this.state.view;

  private readonly panelFits = this.watch(PANEL_MIN);
  private readonly monthSideFits = this.watch(MONTH_SIDE_MIN);
  private readonly columnFits = this.watch(COLUMN_MIN);
  readonly phone = this.watch(PHONE_MAX);

  /** The phone's own day screen instead of the grid. */
  readonly phoneDay = computed(() => this.phone() && this.view() === 'day');
  /** The month has no left column in the design; narrow screens have no room for one. */
  readonly showColumn = computed(() => this.columnFits() && this.view() !== 'month');
  readonly showPanel = computed(() => this.panelFits() && this.view() !== 'month');
  /** True while details are shown in the page: the panel, or the month's aside. */
  readonly detailsInline = computed(() => this.view() === 'month' ? this.monthSideFits() : this.panelFits());

  /** The left column as a sheet, where it has no room on the page. */
  readonly sheetOpen = signal(false);

  // ── Header ─────────────────────────────────────────────────────────────────

  /** "November 2026" */
  readonly title = computed(() =>
    monthAndYear(this.state.currentMonth()));

  /** "Week 46 · Jumada I – II 1448" */
  readonly subtitle = computed(() => {
    const view = this.view();
    const hijri = this.board.hijriOn();

    if (view === 'month' || view === 'agenda') {
      const month = this.state.currentMonth();
      const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
      if (hijri) return this.board.hijriRange(month, last);
      const weeks = this.board.monthWeeks();
      return t('Weeks {from} – {to}', {
        from: weekNumberOfRow(weeks[0][0].date), to: weekNumberOfRow(weeks[weeks.length - 1][0].date)
      });
    }

    const week = this.board.week();
    const number = t('Week {n}', { n: weekNumberOfRow(week[0].date) });
    if (!hijri) return number;
    return view === 'day'
      ? `${number} · ${this.board.hijriFull(this.state.selectedDate())}`
      : `${number} · ${this.board.hijriRange(week[0].date, week[6].date)}`;
  });

  /** What the arrows move by, said for their labels. */
  readonly stepLabels = computed(() => {
    const unit = this.view() === 'agenda' ? 'month' : this.view();
    if (unit === 'day') return { previous: t('Previous day'), next: t('Next day') };
    if (unit === 'week') return { previous: t('Previous week'), next: t('Next week') };
    return { previous: t('Previous month'), next: t('Next month') };
  });

  /** The `view` this page last wrote to the address by itself. */
  private writtenView: string | null = null;

  private detailsDialog: MatDialogRef<EventWindow> | null = null;
  private detailsShown: CalendarSelection | null = null;

  constructor() {
    // Loads the weeks on screen, with a day to spare on both sides because the
    // grid's days are in the calendar's zone, not UTC.
    effect(() => {
      const start = this.board.monthStart();
      const from = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
      const to = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 43);
      untracked(() => this.data.showRange(from, to));
    });

    // Opens on today as the calendar's zone has it. The device can be on another
    // date: late evening in New York is already tomorrow in Cairo.
    effect(() => {
      const today = todayInZone(this.board.zone());
      untracked(() => this.state.followToday(today));
    });

    // The view from the calendar settings, unless one was already picked. A
    // phone opens on its day screen.
    effect(() => {
      const preferred = this.data.settings()?.defaultView;
      const phone = this.phone();
      untracked(() => {
        if (phone) this.state.applyDefaultView('day');
        else if (preferred) this.state.applyDefaultView(VIEW_BY_NAME[preferred] ?? 'week');
      });
    });

    // The address says which view is on, so the phone's tab bar can tell.
    effect(() => {
      const param = PARAM_BY_VIEW[this.view()];
      untracked(() => {
        if (this.route.snapshot.queryParamMap.get('view') === param) return;
        this.writtenView = param;
        this.router.navigate([], {
          relativeTo: this.route, queryParams: { view: param }, queryParamsHandling: 'merge', replaceUrl: true
        });
      });
    });

    // The auto-picked "next up" only makes sense while the panel is on screen.
    effect(() => this.board.panelVisible.set(this.showPanel()));

    // Where the panel has no room, a picked item opens in a window instead.
    effect(() => {
      const selection = this.state.selection();
      untracked(() => {
        if (selection && !this.detailsInline()) this.openDetails(selection);
        else this.closeDetails();
      });
    });
    effect(() => {
      const inline = this.detailsInline();
      untracked(() => {
        if (inline) this.closeDetails();
        // A pick made on the wide layout would otherwise stay on, unseen.
        else if (!this.detailsDialog) this.state.clearSelection();
      });
    });

    // The now line and every "starts in" move on twice a minute.
    const clock = setInterval(() => this.board.now.set(new Date()), 30_000);
    this.destroyRef.onDestroy(() => {
      clearInterval(clock);
      this.closeDetails();
      // A pick does not outlive the page: coming back must not reopen it.
      this.state.clearSelection();
      this.board.panelVisible.set(false);
      this.board.dragging.set(null);
    });
  }

  ngOnInit() {
    this.board.now.set(new Date());
    this.data.reload();

    // Someone changed a task or an event, here or in another tab. A burst of
    // changes (an import, for example) reloads once.
    merge(this.realtime.taskChanged$, this.realtime.eventChanged$)
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.data.reload());

    // Links from the tab bar, a notification or search:
    // ?view=day|week|month|schedule, ?date=yyyy-mm-dd, ?event=<id>.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        // A view in a link is a choice. The one this page wrote itself is not:
        // the calendar settings may still replace it.
        const param = params.get('view') ?? '';
        const view = VIEW_BY_PARAM[param];
        if (view && param !== this.writtenView) this.state.chooseView(view);

        const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(params.get('date') ?? '');
        if (date) this.state.selectDate(new Date(+date[1], +date[2] - 1, +date[3]));

        const eventId = params.get('event');
        if (eventId) {
          this.state.select({ kind: 'Event', id: eventId });
          // Dropped from the address so a reload does not open it again.
          this.router.navigate([], {
            relativeTo: this.route, queryParams: { event: null, date: null }, queryParamsHandling: 'merge', replaceUrl: true
          });
        }
      });
  }

  /** A media query as a signal. */
  private watch(query: string) {
    const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null;
    const matches = signal(media?.matches ?? false);
    if (media) {
      const update = () => matches.set(media.matches);
      media.addEventListener('change', update);
      this.destroyRef.onDestroy(() => media.removeEventListener('change', update));
    }
    return matches.asReadonly();
  }

  // ── Header actions ─────────────────────────────────────────────────────────

  step(direction: 1 | -1) {
    this.state.step(direction);
  }

  setToday() {
    this.state.setToday(todayInZone(this.board.zone()));
  }

  setView(view: CalendarView) {
    this.state.chooseView(view);
  }

  /** "Create or search": the command palette (also Ctrl K). */
  openPalette() {
    this.quickAdd.openPalette();
  }

  openSheet() {
    this.sheetOpen.set(true);
  }

  closeSheet() {
    this.sheetOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.sheetOpen()) this.closeSheet();
  }

  // ── Details ────────────────────────────────────────────────────────────────

  clearSelection() {
    this.state.clearSelection();
  }

  private openDetails(selection: CalendarSelection) {
    if (this.detailsDialog && this.detailsShown === selection) return;
    this.closeDetails();
    // A pick made from the sheet: the sheet steps aside for the window.
    this.sheetOpen.set(false);

    const data: EventWindowData = { selection };
    const dialog = this.dialog.open(EventWindow, { panelClass: 'custom-dialog-container', autoFocus: false, data });
    this.detailsDialog = dialog;
    this.detailsShown = selection;

    dialog.afterClosed().subscribe(() => {
      if (this.detailsDialog !== dialog) return;
      this.detailsDialog = null;
      this.detailsShown = null;
      if (this.state.selection() === selection) this.state.clearSelection();
    });
  }

  private closeDetails() {
    const dialog = this.detailsDialog;
    this.detailsDialog = null;
    this.detailsShown = null;
    dialog?.close();
  }
}
