import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { trigger, transition, style, animate, stagger, query } from '@angular/animations';
import { QuickActionCard } from '../quick-action-card/quick-action-card';
import { ProductivityChart } from '../productivity-chart/productivity-chart';
import { MiniCalendar } from '../mini-calendar/mini-calendar';
import { UpcomingAgenda } from '../upcoming-agenda/upcoming-agenda';
import { RecentWorkspaces } from '../recent-workspaces/recent-workspaces';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { TaskWindowComponent } from '../task-window/task-window';
import { TaskService } from '../../../core/services/task.service';
import { TaskDto } from '../../../models/api.models';
import { UserService } from '../../../core/services/user.service';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { UserDto } from '../../../models/api.models';

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
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // Colours come from tokens, not literals: these were hardcoded dark hexes
  // (#1e2240, #2d2010, #1b3a35), so the icon tiles stayed navy and brown on the
  // light theme instead of following it.
  quickActionCards = [
    {
      id: 'event',
      title: 'New Event',
      description: 'Schedule a meeting or task',
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

  public taskService = inject(TaskService);
  public userService = inject(UserService);
  tasks$!: Observable<TaskDto[]>;
  user$!: Observable<UserDto | null>;

  ngOnInit() {
    // Both are consumed with `| async`, which rethrows into the template on
    // error — degrade to empty instead of blanking the dashboard.
    this.tasks$ = this.taskService.getTasks().pipe(catchError(() => of([])));
    this.user$ = this.userService.getMe().pipe(catchError(() => of(null)));
  }
  /** UserDto carries `fullName`; there is no `firstName` field to read. */
  firstName(user: UserDto | null): string {
    const first = user?.fullName?.trim().split(/\s+/)[0];
    return first || 'there';
  }

  /**
   * "New Event" opens the quick-add dialog; the other two are pages, and used to
   * fall into an empty `else` — clicking them did nothing at all.
   */
  onQuickAction(card: { id: string; route?: string }) {
    if (card.id === 'event') {
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
          // A new task changes the agenda and the chart, so refetch on save.
          // The explicit markForCheck is required: the app is zoneless and this
          // component is OnPush, so swapping the observable behind an `| async`
          // is otherwise never noticed.
          if (result) {
            this.tasks$ = this.taskService.getTasks().pipe(catchError(() => of([])));
            this.cdr.markForCheck();
          }
        });
      return;
    }

    if (card.route) this.router.navigate([card.route]);
  }
}
