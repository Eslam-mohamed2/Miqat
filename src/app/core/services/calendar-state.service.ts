import { Injectable, signal } from '@angular/core';

import { CalendarItemDto, CalendarItemKind } from '../../models/api.models';

/** 'agenda' is the list the page calls "Schedule". */
export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

/** The event or task whose details are on show. */
export interface CalendarSelection {
  kind: CalendarItemKind;
  id: string;
  /** The date that was picked: one date of a repeating event, or a task's time block. */
  item?: CalendarItemDto;
}

/**
 * Filter id for tasks that belong to no project. They get their own row under
 * "Tasks" ("Personal"), so they can be switched off like a project's.
 */
export const PERSONAL_CALENDAR_ID = '__personal__';

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const firstOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

/**
 * State shared by the calendar page's parts (the views, the left column, the detail
 * panel) and by anything that sends the user there, such as a day on another screen.
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

  /**
   * Lives here so a link from elsewhere can open the calendar straight on a day.
   * The week is the app's home until the calendar settings or a link say otherwise.
   */
  view = signal<CalendarView>('week');

  /** What the detail panel shows; null when nothing was picked. */
  selection = signal<CalendarSelection | null>(null);

  select(selection: CalendarSelection) {
    this.selection.set(selection);
  }

  clearSelection() {
    this.selection.set(null);
  }

  /**
   * True once the view was picked by the user or by a link. Until then the
   * calendar may switch to the default view from the user's calendar settings;
   * after that it must not, or a setting would undo a click.
   */
  viewChosen = false;

  /**
   * The zone the calendar shows times in, picked from the tag above its hour column.
   * null means "the zone in my profile".
   */
  displayZone = signal<string | null>(null);

  /**
   * Projects the user has switched off under "Tasks" in the left column.
   *
   * This lives on the service rather than inside the column because the column
   * and the views are sibling components with no other link.
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
