import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { TaskService, TaskDto } from '../core/services/task.service';

export interface CalendarEvent {
  title: string;
  time: string;
  color: string;
}

@Component({
  selector: 'app-main',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './main.html',
  styleUrl: './main.scss'
})
export class Main implements OnInit {
  currentDate = new Date();
  weeks: (Date | null)[][] = [];
  selectedDate: Date | null = null;
  selectedDay: number | null = null;
  
  events: Record<string, CalendarEvent[]> = {};

  constructor(private authService: AuthService, private router: Router, private taskService: TaskService) {
    this.generateCalendar();
  }

  ngOnInit(): void {
    const today = new Date();
    this.selectDate(today);

    this.loadBackendTasks();
  }

  loadBackendTasks(): void {
    this.taskService.getTasks().subscribe({
      next: (tasks) => {
        this.events = {};
        tasks.forEach(t => {
          if (t.dueDate) {
            const d = new Date(t.dueDate);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const key = `${year}-${month}-${day}`;

            if (!this.events[key]) this.events[key] = [];

            let eventColor = '#3B82F6';
            if (t.priority === 'High') eventColor = '#EF4444';
            if (t.priority === 'Low') eventColor = '#10B981';
            if (t.status === 'Completed') eventColor = '#9CA3AF'; // Gray if done

            const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            this.events[key].push({
              title: t.title,
              time: timeStr,
              color: eventColor
            });
          }
        });
      },
      error: (err) => console.error('Failed to fetch backend tasks', err)
    });
  }

  logout() {
    this.authService.logout().subscribe(() => {
      this.router.navigate(['/authentication']);
    });
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
        if (tmp.getMonth() === month) {
          week.push(new Date(tmp));
        } else {
          week.push(null);
        }
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
    const year = this.selectedDate.getFullYear();
    const month = String(this.selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(this.selectedDate.getDate()).padStart(2, '0');
    const key = `${year}-${month}-${d}`;
    return this.events[key] || [];
  }

  isToday(day: Date | null): boolean {
    if (!day) return false;
    const now = new Date();
    return (
      day.getDate() === now.getDate() &&
      day.getMonth() === now.getMonth() &&
      day.getFullYear() === now.getFullYear()
    );
  }
}
