import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CalendarStateService {
  currentMonth = signal<Date>(new Date());

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

  isCalendarVisible(groupId: string | null | undefined): boolean {
    // Tasks with no project cannot be switched off — there is no row for them.
    if (!groupId) return true;
    return !this.hiddenCalendarIds().has(groupId);
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

  nextMonth() {
    const current = this.currentMonth();
    this.currentMonth.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  prevMonth() {
    const current = this.currentMonth();
    this.currentMonth.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  setToday() {
    this.currentMonth.set(new Date());
  }
}
