import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Sidebar {
  navItemsApp = [
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard', active: true },
    { label: 'Calendar', route: '/calendar', icon: 'calendar_today', active: false },
    { label: 'Whiteboard', route: '/whiteboard', icon: 'edit', active: false },
    { label: 'Node Flow', route: '/node-flow', icon: 'account_tree', active: false },
  ];

  navItemsOther = [
    { label: 'Settings', route: '/settings', icon: 'settings', active: false },
    { label: 'Help Center', route: '/help', icon: 'help_outline', active: false },
  ];
}
