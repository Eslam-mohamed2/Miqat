import { Injectable, signal } from '@angular/core';

export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

/**
 * Filter id for tasks that belong to no project. They get their own row in
 * "My Calendars"; without one they could never be switched off, so "Hide all"
 * left them on the grid and the checkboxes looked broken.
 */
export const PERSONAL_CALENDAR_ID = '__personal__';

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const firstOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

/**
 * State shared by the calendar page's two halves (the grid and the sidebar) and by
 * anything that sends the user there, such as a day on the dashboard's mini calendar.
 */
@Injectable({
  providedIn: 'root'
})
export class CalendarStateService {
  /** The month on show (always the 1st of it). */
  currentMonth = signal<Date>(firstOfMonth(new Date()));

  /**
   * The day the calendar is focused on. Week and Day views show the week / day that
   * contains it, and both month grids highlight it. Without it those views could only
   * ever show the row with today in it, whatever month was on screen.
   */
  selectedDate = signal<Date>(startOfDay(new Date()));

  /** Lives here so a link from elsewhere can open the calendar straight on a day. */
  view = signal<CalendarView>('month');

  /**
   * True once the view was picked by the user or by a link. Until then the
   * calendar may switch to the default view from the user's calendar settings;
   * after that it must not, or a setting would undo a click.
   */
  viewChosen = false;

  /**
   * The zone the calendar shows times in, picked from the chip in its header.
   * null means "the zone in my profile".
   */
  displayZone = signal<string | null>(null);

  /**
   * Projects the user has switched off in the sidebar's "My Calendars" list.
   *
   * This lives on the service rather than inside the sidebar because the
   * sidebar and the grid are sibling components with no other link — the
   * checkboxes previously toggled a signal only the sidebar could see, so
   * unticking a project changed the tick and nothing else.
   *
   * Stored as the *hidden* set so a newly created project is visible by
   * default without anyone having to register it here.
   */
  hiddenCalendarIds = signal<ReadonlySet<string>>(new Set());

  /** Pass a project id, or nothing / PERSONAL_CALENDAR_ID for tasks without a project. */
  isCalendarVisible(groupId: string | null | undefined): boolean {
    return !this.hiddenCalendarIds().has(groupId || PERSONAL_CALENDAR_ID);
  }

  toggleCalendar(groupId: string) {
    this.hiddenCalendarIds.update(hidden => {
      const next = new Set(hidden);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  }

  setAllCalendars(groupIds: string[], visible: boolean) {
    this.hiddenCalendarIds.set(visible ? new Set() : new Set(groupIds));
  }

  /**
   * True once a day was picked by the user or by a link. Until then the calendar
   * may move the focus to "today" in its own zone, which can be a different date
   * from today on the device.
   */
  private dateChosen = false;

  /** Today as the calendar's zone has it; ignored once a day was picked on purpose. */
  followToday(today: Date) {
    if (this.dateChosen) return;
    const day = startOfDay(today);
    this.selectedDate.set(day);
    this.currentMonth.set(firstOfMonth(day));
  }

  /** Focus a day, and bring its month on screen. */
  selectDate(date: Date) {
    this.dateChosen = true;
    const day = startOfDay(date);
    this.selectedDate.set(day);
    this.currentMonth.set(firstOfMonth(day));
  }

  /** Open a day in the given view (used by links from outside the calendar). */
  showDay(date: Date, view: CalendarView = 'day') {
    this.selectDate(date);
    this.chooseView(view);
  }

  /** A view picked on purpose, by the user or by a link. */
  chooseView(view: CalendarView) {
    this.viewChosen = true;
    this.view.set(view);
  }

  /** The view from the calendar settings; ignored once a view was picked on purpose. */
  applyDefaultView(view: CalendarView) {
    if (!this.viewChosen) this.view.set(view);
  }

  nextMonth() {
    this.shiftMonth(1);
  }

  prevMonth() {
    this.shiftMonth(-1);
  }

  /**
   * Arrows in the main header: they move by whatever is on screen — a month, a week
   * or a day. They used to change the month only, so in Week and Day view the grid
   * never moved.
   */
  step(direction: 1 | -1) {
    const view = this.view();
    // The agenda lists the month on screen, so it moves by a month too.
    if (view === 'month' || view === 'agenda') {
      this.shiftMonth(direction);
      return;
    }
    const current = this.selectedDate();
    const days = view === 'week' ? 7 : 1;
    this.selectDate(new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction * days));
  }

  setToday(today: Date = new Date()) {
    this.selectDate(today);
  }

  /** Moves the month and keeps the focused day inside it (the 31st becomes the 30th). */
  private shiftMonth(months: number) {
    this.dateChosen = true;
    const current = this.selectedDate();
    const shown = this.currentMonth();
    const target = new Date(shown.getFullYear(), shown.getMonth() + months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    this.selectedDate.set(new Date(target.getFullYear(), target.getMonth(), Math.min(current.getDate(), lastDay)));
    this.currentMonth.set(target);
  }
}
