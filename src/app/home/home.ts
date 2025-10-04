import { Component, OnInit } from '@angular/core';
import { interval } from 'rxjs';
import { CommonModule } from '@angular/common';
import { CalendarEvent } from '../calendar-event';
import { Router, RouterModule } from '@angular/router';
import { AuthLogic } from '../authentication/auth-logic.service';
@Component({
  selector: 'app-home',
  imports: [CommonModule,RouterModule],
  templateUrl: './home.html',
  standalone: true,
  styleUrl: './home.scss'
})

export class Home implements OnInit {
  currentDate = new Date();
  weeks: (Date | null)[][] = [];
  selectedDate: Date | null = null;

  constructor(public authLogic: AuthLogic) {
     this.generateCalendar();
  }


  numOfClocks = 25;
  days: number[] = [];


  selectedDay: number | null = null;
  events: Record<string, CalendarEvent[]> = {
    '2024-01-15': [
      { title: 'Team Meeting', time: '10:00 - 11:30', color: '#3B82F6' },
      { title: 'Project Review', time: '14:00 - 15:00', color: '#10B981' }
    ]
  };


  ngOnInit() {
    this.days = Array.from({ length: 31 }, (_, i) => i + 1);
  }

  get monthYear(): string {
    return this.currentDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
  }
  generateCalendar() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    const firstOfMonth = new Date(year, month, 1);
    const startDayIndex = firstOfMonth.getDay();
    const startDate = new Date(year, month, 1 - startDayIndex);
    const weeks: (Date | null)[][] = [];
    const tmp = new Date(startDate);
    for (let w = 0; w < 6; w++) {
      const week: (Date | null)[] = [];
      for (let d = 0; d < 7; d++) {
        week.push(new Date(tmp));
        tmp.setDate(tmp.getDate() + 1);
      }
      weeks.push(week);
    }
    this.weeks = weeks;
  }

  prevMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.generateCalendar();
  }

  nextMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.generateCalendar();
  }
  selectDate(day: Date | null) {
    if (!day) return;
    this.selectedDate = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    this.selectedDay = this.selectedDate.getDate();
  }
  getEventsForSelected(): CalendarEvent[] {
    if (!this.selectedDate) return [];
    const key = this.selectedDate.toISOString().split('T')[0];
    return this.events[key] || [];
  }

  isToday(day: number | Date | null): boolean {
    if (day === null) return false;
    const now = new Date();
    if (typeof day === 'number') {
      return now.getDate() === day &&
             now.getMonth() === this.currentDate.getMonth() &&
             now.getFullYear() === this.currentDate.getFullYear();
    }
    if (day instanceof Date) {
      return (
        day.getDate() === now.getDate() &&
        day.getMonth() === now.getMonth() &&
        day.getFullYear() === now.getFullYear()
      );
    }
    return false;
  }
  isSelected(day: number | Date | null): boolean {
    if (day === null) return false;
    if (typeof day === 'number') {
      return this.selectedDay === day;
    }

    if (day instanceof Date) {
      if (!this.selectedDate) return false;
      return day.toDateString() === this.selectedDate.toDateString();
    }
    return false;
  }
  selectDay(day: number) {
    this.selectedDay = day;
    this.selectedDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), day);
  }

  // // Navagation to Auth Page
  //  goToLogin() {
  //   this.router.navigate(['/auth'], { queryParams: { form: 'login' } });
  // }

  // goToRegister() {
  //   this.router.navigate(['/auth'], { queryParams: { form: 'register' } });
  // }

}

