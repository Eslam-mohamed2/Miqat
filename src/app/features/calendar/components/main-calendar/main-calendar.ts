import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserService } from '../../../../core/services/user.service';
import { MatIconModule } from '@angular/material/icon';
import { TaskService } from '../../../../core/services/task.service';
import { TaskDto } from '../../../../models/api.models';
import { GroupService } from '../../../../core/services/group.service';
import { CalendarStateService } from '../../../../core/services/calendar-state.service';
import { forkJoin } from 'rxjs';

export interface CalendarEvent {
  id: string;
  /** Empty for personal tasks, which have no project row to switch off. */
  groupId: string;
  time: string;
  title: string;
  description?: string;
  status?: string;
  color: string;
  textLight?: boolean;
}

export interface CalendarDay {
  date: number;
  fullDate: Date;
  isCurrentMonth: boolean;
  isToday?: boolean;
  events: CalendarEvent[];
}

@Component({
  selector: 'app-main-calendar',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './main-calendar.html',
  styleUrl: './main-calendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MainCalendar implements OnInit {
  private userService = inject(UserService);

  /**
   * The signed-in user's own zone with its current UTC offset — this chip was
   * hardcoded to "PST (GMT-8)" regardless of who was looking at it. Reading the
   * shared signal means it also updates when the zone is changed in Settings.
   */
  readonly timeZoneLabel = computed(() => {
    const zone = this.userService.timeZone();
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, timeZoneName: 'shortOffset'
      }).formatToParts(new Date());
      const offset = parts.find(part => part.type === 'timeZoneName')?.value ?? '';
      // "Africa/Cairo" -> "Cairo (GMT+3)"
      const city = zone.split('/').pop()?.replace(/_/g, ' ') ?? zone;
      return offset ? `${city} (${offset})` : city;
    } catch {
      return zone;
    }
  });

  private taskService = inject(TaskService);
  private groupService = inject(GroupService);
  public calendarState = inject(CalendarStateService);

  daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  weeks = signal<CalendarDay[][]>([]);
  selectedEvent = signal<CalendarEvent | null>(null);
  currentView = signal<'month' | 'week' | 'day'>('month');

  // Compute what to render based on the current View selection
  filteredWeeks = computed(() => {
    const view = this.currentView();
    // Reading the hidden set here is what makes the sidebar's checkboxes do
    // something: this computed already feeds the template, so dropping the
    // events of a switched-off project re-renders the grid immediately.
    const hidden = this.calendarState.hiddenCalendarIds();
    const all = this.weeks().map(week => week.map(day => ({
      ...day,
      events: hidden.size
        ? day.events.filter(e => !e.groupId || !hidden.has(e.groupId))
        : day.events
    })));
    if (view === 'month') return all;

    // For Week or Day, find the row containing 'today', or just use the first row if none found
    const weekWithToday = all.find(w => w.some(d => d.isToday)) || all[0];
    
    // For Day view, we still return the week so the template can iterate it, but we'll mask non-selected days in HTML, or we can just filter the days.
    if (view === 'day') {
      const todayCell = weekWithToday.find(d => d.isToday) || weekWithToday[0];
      return [[todayCell]]; // 1 row, 1 cell 
    }

    return [weekWithToday]; // 1 row, 7 cells
  });

  // Explicit Getters for Signal values - helps ngtsc template type checking
  get currentViewValue() { return this.currentView(); }
  get selectedEventValue() { return this.selectedEvent(); }
  get filteredWeeksValue() { return this.filteredWeeks(); }
  get currentMonthValue() { return this.calendarState.currentMonth(); }

  constructor() {
    effect(() => {
      // Whenever currentMonth changes, refresh the calendar
      const month = this.calendarState.currentMonth();
      this.refreshCalendar();
    });
  }

  ngOnInit() {
  }

  refreshCalendar() {
    forkJoin({
      tasks: this.taskService.getTasks(),
      groups: this.groupService.getGroups()
    }).subscribe({
      next: (res) => {
        this.generateCalendar(res.tasks, res.groups);
      },
      error: () => {
        this.generateCalendar([], []); // Fallback to empty
      }
    });
  }

  generateCalendar(tasks: TaskDto[], groups: any[]) {
    const today = new Date();
    const currentM = this.calendarState.currentMonth();
    const startOfMonth = new Date(currentM.getFullYear(), currentM.getMonth(), 1);
    const endOfMonth = new Date(currentM.getFullYear(), currentM.getMonth() + 1, 0);

    // Get the first day of the grid (might be in the previous month)
    const startDate = new Date(startOfMonth);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const generatedWeeks: CalendarDay[][] = [];
    const tempDate = new Date(startDate);

    // Generate 6 weeks to ensure we cover the whole month view
    for (let i = 0; i < 6; i++) {
        const week: CalendarDay[] = [];
        for (let j = 0; j < 7; j++) {
            const tasksForDay = tasks.filter(t => {
                if (!t.dueDate) return false;
                const d = new Date(t.dueDate);
                return d.getFullYear() === tempDate.getFullYear() &&
                       d.getMonth() === tempDate.getMonth() &&
                       d.getDate() === tempDate.getDate();
            });
            
            week.push({
                date: tempDate.getDate(),
                fullDate: new Date(tempDate),
                isCurrentMonth: tempDate.getMonth() === currentM.getMonth(),
                isToday: tempDate.toDateString() === today.toDateString(),
                events: tasksForDay.map(t => {
                    const group = groups.find(g => g.id === t.groupId);
                    return {
                        id: t.id || '',
                        groupId: t.groupId || '',
                        time: this.formatTime(t.dueDate!),
                        title: t.title,
                        description: t.description,
                        status: t.status,
                        color: group?.color || '#2ec4a0',
                        textLight: true
                    };
                })
            });
            tempDate.setDate(tempDate.getDate() + 1);
        }
        generatedWeeks.push(week);
    }
    this.weeks.set(generatedWeeks);
  }

  formatTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  prevMonth() {
    this.calendarState.prevMonth();
  }

  nextMonth() {
    this.calendarState.nextMonth();
  }

  setToday() {
    this.calendarState.setToday();
  }

  openTaskDetails(event: CalendarEvent) {
    this.selectedEvent.set(event);
  }

  closeTaskDetails() {
    this.selectedEvent.set(null);
  }

  setView(view: 'month' | 'week' | 'day') {
    this.currentView.set(view);
  }
}
