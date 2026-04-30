import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CalendarStateService {
  currentMonth = signal<Date>(new Date());

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
