import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { trigger, transition, style, animate, stagger, query } from '@angular/animations';
import { QuickActionCard } from '../quick-action-card/quick-action-card';
import { ProductivityChart } from '../productivity-chart/productivity-chart';
import { MiniCalendar } from '../mini-calendar/mini-calendar';
import { UpcomingAgenda } from '../upcoming-agenda/upcoming-agenda';
import { RecentWorkspaces } from '../recent-workspaces/recent-workspaces';

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
    RecentWorkspaces
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
  quickActionCards = [
    {
      id: 'event',
      title: 'New Event',
      description: 'Schedule a meeting or task',
      icon: 'event',
      iconBg: '#1b3a35',
      iconColor: '#2ec4a0',
      route: '/calendar/new'
    },
    {
      id: 'board',
      title: 'New Board',
      description: 'Start a blank whiteboard',
      icon: 'dashboard_customize',
      iconBg: '#1e2240',
      iconColor: '#7c8ef5',
      route: '/whiteboard/new'
    },
    {
      id: 'flow',
      title: 'New Flow',
      description: 'Create a node diagram',
      icon: 'account_tree',
      iconBg: '#2d2010',
      iconColor: '#f4a835',
      route: '/node-flow/new',
      hasDecoration: true
    }
  ];

  ngOnInit() {}

  onQuickAction(card: any) {
    console.log('Action clicked:', card);
  }
}
