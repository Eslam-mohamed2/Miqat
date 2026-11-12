import {
  ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnInit, computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { trigger, transition, style, animate, stagger, query } from '@angular/animations';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { QuickActionCard } from '../quick-action-card/quick-action-card';
import { ProductivityChart } from '../productivity-chart/productivity-chart';
import { MiniCalendar } from '../mini-calendar/mini-calendar';
import { UpcomingAgenda } from '../upcoming-agenda/upcoming-agenda';
import { RecentWorkspaces } from '../recent-workspaces/recent-workspaces';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { TaskWindowComponent } from '../task-window/task-window';
import { EventEditor, EventEditorData } from '../../calendar/components/event-editor/event-editor';
import { CalendarDataService } from '../../../core/services/calendar-data.service';
import { TaskService } from '../../../core/services/task.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { TaskDto, UserDto, UserSummaryDto } from '../../../models/api.models';
import { UserService } from '../../../core/services/user.service';
import { CalendarStateService } from '../../../core/services/calendar-state.service';
import { todayInZone } from '../../../core/utils/time-zone';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

type RangeKey = '7d' | '30d' | 'all';

interface RangeOption {
  key: RangeKey;
  label: string;
  /** null = no limit. */
  days: number | null;
}

const RANGES: RangeOption[] = [
  { key: '7d', label: 'Last 7 Days', days: 7 },
  { key: '30d', label: 'Last 30 Days', days: 30 },
  { key: 'all', label: 'All Time', days: null }
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** One number in the "at a glance" row under the greeting. */
interface GlanceTile {
  key: 'today' | 'overdue' | 'week' | 'done';
  label: string;
  value: number;
  icon: string;
  /** Said to screen readers and shown as the tooltip: where a click goes. */
  hint: string;
  /** `warn` turns the number red while it is above zero. */
  tone: 'plain' | 'warn' | 'good';
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    QuickActionCard,
    ProductivityChart,
    MiniCalendar,
    UpcomingAgenda,
    RecentWorkspaces,
    MatDialogModule
  ],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(16px)' }),
        animate('320ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('staggerCards', [
      transition(':enter', [
        query('app-quick-action-card', [
          style({ opacity: 0, transform: 'translateY(12px)' }),
          stagger('80ms', [
            animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
          ])
        ], { optional: true })
      ])
    ])
  ]
})
export class DashboardPage implements OnInit {
  private dialog = inject(MatDialog);
  private calendarData = inject(CalendarDataService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private realtime = inject(RealtimeService);
  public taskService = inject(TaskService);
  public userService = inject(UserService);
  private calendarState = inject(CalendarStateService);

  // Colours come from tokens, not literals: these were hardcoded dark hexes
  // (#1e2240, #2d2010, #1b3a35), so the icon tiles stayed navy and brown on the
  // light theme instead of following it.
  quickActionCards = [
    {
      id: 'event',
      title: 'New Event',
      description: 'Put something on your calendar',
      icon: 'event',
      iconBg: 'var(--icon-bg-event)',
      iconColor: 'var(--icon-fg-event)',
      route: '/calendar/new'
    },
    {
      id: 'board',
      title: 'Whiteboard',
      description: 'Sketch and plan visually',
      icon: 'dashboard_customize',
      iconBg: 'var(--icon-bg-board)',
      iconColor: 'var(--icon-fg-board)',
      route: '/whiteboard'
    },
    {
      id: 'flow',
      title: 'Node Flow',
      description: 'Map your tasks as a flow',
      icon: 'account_tree',
      iconBg: 'var(--icon-bg-flow)',
      iconColor: 'var(--icon-fg-flow)',
      route: '/node-flow',
      hasDecoration: true
    }
  ];

  /** Every task the user can see; the chart and the export read a slice of it. */
  readonly tasks = signal<TaskDto[]>([]);
  /** Bumped after anything that changes tasks, so the child cards reload too. */
  readonly refreshTick = signal(0);

  /**
   * Counts the server works out in the user's own time zone ("due today" depends
   * on where the user is). null until loaded, and when it could not be: the row
   * is then left out and the page looks the way it did before.
   */
  readonly summary = signal<UserSummaryDto | null>(null);

  readonly glance = computed<GlanceTile[]>(() => {
    const counts = this.summary()?.tasks;
    if (!counts) return [];
    return [
      { key: 'today',   label: 'Due today',      value: counts.dueToday,          icon: 'today',      tone: 'plain', hint: 'Open today on the calendar' },
      { key: 'overdue', label: 'Overdue',        value: counts.overdue,           icon: 'schedule',   tone: 'warn',  hint: 'Open your tasks' },
      { key: 'week',    label: 'Due this week',  value: counts.dueThisWeek,       icon: 'date_range', tone: 'plain', hint: 'Open this week on the calendar' },
      { key: 'done',    label: 'Done this week', value: counts.completedThisWeek, icon: 'task_alt',   tone: 'good',  hint: 'Open your tasks' }
    ];
  });

  readonly ranges = RANGES;
  readonly range = signal<RangeKey>('7d');
  readonly rangeMenuOpen = signal(false);
  readonly rangeOption = computed(() => RANGES.find(option => option.key === this.range()) ?? RANGES[0]);

  /**
   * The tasks the header's range applies to: created inside the window, or due
   * inside it (looking the same distance ahead). "Last 7 Days" and "Export" were
   * plain buttons with no handler; this is what they act on.
   */
  readonly tasksInRange = computed(() => {
    const days = this.rangeOption().days;
    const all = this.tasks();
    if (days === null) return all;

    const now = Date.now();
    const from = now - days * DAY_MS;
    const to = now + days * DAY_MS;
    const inside = (value: string | null | undefined, max: number) => {
      if (!value) return false;
      const time = new Date(value).getTime();
      return !Number.isNaN(time) && time >= from && time <= max;
    };
    return all.filter(task => inside(task.createdAt, now) || inside(task.dueDate, to));
  });

  /** "12 tasks · Last 7 Days" under the chart title. */
  readonly rangeCaption = computed(() => {
    const count = this.tasksInRange().length;
    return `${count} ${count === 1 ? 'task' : 'tasks'} · ${this.rangeOption().label}`;
  });

  /** Morning, afternoon or evening, by the clock of the device the user is looking at. */
  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  });

  readonly firstName = computed(() => this.nameOf(this.userService.currentUser()));

  ngOnInit() {
    this.loadTasks();
    // The sidebar usually has this already; ask only when nobody has.
    if (!this.userService.currentUser()) {
      this.userService.getMe().pipe(catchError(() => of(null))).subscribe();
    }

    // A task changed somewhere else (another member, another tab).
    this.realtime.taskChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refresh());
  }

  private loadTasks() {
    this.taskService.getTasks()
      .pipe(catchError(() => of([] as TaskDto[])))
      .subscribe(tasks => this.tasks.set(tasks ?? []));

    // Kept on failure: yesterday's numbers on screen are better than the row
    // vanishing because one refresh did not get through.
    this.userService.getSummary()
      .pipe(catchError(() => of(null)))
      .subscribe(summary => { if (summary?.tasks) this.summary.set(summary); });
  }

  /**
   * "Due today" and "Due this week" open the calendar on today, as a day or a
   * week. The other two open the task list, which has no filter to hand over to.
   */
  openGlance(tile: GlanceTile) {
    if (tile.key === 'today' || tile.key === 'week') {
      this.calendarState.showDay(todayInZone(this.userService.timeZone()), tile.key === 'today' ? 'day' : 'week');
      this.router.navigate(['/calendar']);
      return;
    }
    this.router.navigate(['/tasks']);
  }

  /** Reloads the chart data and tells the calendar and agenda cards to do the same. */
  refresh() {
    this.loadTasks();
    this.refreshTick.update(tick => tick + 1);
  }

  /** UserDto carries `fullName`; there is no `firstName` field to read. */
  private nameOf(user: UserDto | null): string {
    const first = user?.fullName?.trim().split(/\s+/)[0];
    return first || 'there';
  }

  // ── Range menu ─────────────────────────────────────────────────────────────

  toggleRangeMenu(event: Event) {
    event.stopPropagation();
    this.rangeMenuOpen.update(open => !open);
  }

  chooseRange(option: RangeOption) {
    this.range.set(option.key);
    this.rangeMenuOpen.set(false);
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  closeRangeMenu() {
    if (this.rangeMenuOpen()) this.rangeMenuOpen.set(false);
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  /** Downloads the tasks in the selected range as a CSV file. */
  exportCsv() {
    const tasks = this.tasksInRange();
    if (!tasks.length) return;

    const header = ['Title', 'Status', 'Priority', 'Due date', 'Project', 'Assigned to', 'Owner', 'Created'];
    const rows = tasks.map(task => [
      task.title,
      (task.status ?? '').replace(/_/g, ' '),
      task.priority ?? '',
      this.csvDate(task.dueDate),
      task.groupName ?? '',
      task.assignedToUserName ?? '',
      task.ownerName ?? '',
      this.csvDate(task.createdAt)
    ]);

    const csv = [header, ...rows]
      .map(row => row.map(cell => this.csvCell(cell)).join(','))
      .join('\r\n');

    // The BOM makes Excel read the file as UTF-8 (names and titles in Arabic, etc.).
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `miqat-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private csvDate(value: string | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  }

  private csvCell(value: unknown): string {
    let text = String(value ?? '');
    // A cell starting with = + - @ would be run as a formula by spreadsheet apps.
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  // ── Quick actions ──────────────────────────────────────────────────────────

  /**
   * "New Event" opens the event window, or the new-task window on a server that
   * has no events; the other two cards are pages.
   */
  onQuickAction(card: { id: string; route?: string }) {
    if (card.id === 'event') {
      if (this.calendarData.eventsAvailable()) this.openEventDialog();
      else this.openTaskDialog();
      return;
    }

    if (card.route) this.router.navigate([card.route]);
  }

  /** A new event for today, in the time zone of the profile. */
  private openEventDialog() {
    const zone = this.userService.timeZone();
    const data: EventEditorData = { zone, date: todayInZone(zone) };
    this.dialog
      .open(EventEditor, { panelClass: 'custom-dialog-container', autoFocus: false, data })
      .afterClosed()
      .subscribe(saved => {
        if (!saved) return;
        this.calendarData.reload();
        this.refresh();
      });
  }

  /** Also used by the "+" on the Coming Up card. */
  openTaskDialog() {
    this.dialog
      .open(TaskWindowComponent, {
        width: '600px',
        maxWidth: '95vw',
        disableClose: true,
        panelClass: 'custom-dialog-container',
        autoFocus: false
      })
      .afterClosed()
      .subscribe(result => {
        // A new task changes the agenda, the calendar and the chart.
        if (result) this.refresh();
      });
  }
}
