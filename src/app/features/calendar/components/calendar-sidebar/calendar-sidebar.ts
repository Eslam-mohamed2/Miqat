import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { TaskService } from '../../../../core/services/task.service';
import { GroupService } from '../../../../core/services/group.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-calendar-sidebar',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatCheckboxModule],
  templateUrl: './calendar-sidebar.html',
  styleUrl: './calendar-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalendarSidebar implements OnInit {
  private taskService = inject(TaskService);
  private groupService = inject(GroupService);

  miniCalendarWeeks = signal<number[][]>([]);
  calendars = signal<any[]>([]);
  upcomingEvents = signal<any[]>([]);
  currentMonth = 'October 2023';

  ngOnInit() {
    this.generateMiniCalendar();
    this.refreshData();
  }

  generateMiniCalendar() {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    start.setDate(start.getDate() - start.getDay());
    
    const weeks: number[][] = [];
    const temp = new Date(start);
    for (let i = 0; i < 5; i++) {
      const week: number[] = [];
      for (let j = 0; j < 7; j++) {
        week.push(temp.getDate());
        temp.setDate(temp.getDate() + 1);
      }
      weeks.push(week);
    }
    this.miniCalendarWeeks.set(weeks);
  }

  refreshData() {
    forkJoin({
      tasks: this.taskService.getTasks(),
      groups: this.groupService.getGroups()
    }).subscribe({
      next: (res) => {
        // Map groups to calendars
        this.calendars.set(res.groups.map((g: any) => ({
          name: g.name,
          checked: true,
          color: g.color || '#2ec4a0'
        })));

        // Map latest tasks to upcoming events
        const today = new Date();
        this.upcomingEvents.set(res.tasks
          .filter((t: any) => t.dueDate && new Date(t.dueDate) >= today)
          .slice(0, 3)
          .map((t: any) => ({
            time: this.formatTimeRange(t.dueDate),
            title: t.title,
            subtitle: t.status,
            icon: 'assignment',
            color: res.groups.find((g: any) => g.id === t.groupId)?.color || '#9ca3af'
          })));
      }
    });
  }

  formatTimeRange(dateStr: string): string {
    const d = new Date(dateStr);
    const end = new Date(d);
    end.setHours(d.getHours() + 1);
    return `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
}
