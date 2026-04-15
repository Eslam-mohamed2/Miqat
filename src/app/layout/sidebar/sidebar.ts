import { Component, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { GroupService } from '../../core/services/group.service';
import { UserService } from '../../core/services/user.service';
import { UiService } from '../../core/services/ui.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Sidebar implements OnInit {
  private groupService = inject(GroupService);
  private userService = inject(UserService);
  public uiService = inject(UiService);

  groups$!: Observable<any[]>;
  user$!: Observable<any>;

  navItemsApp = [
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'Task List/Kanban', route: '/kanban', icon: 'view_kanban' },
    { label: 'Calendar', route: '/calendar', icon: 'calendar_today' },
    { label: 'Whiteboard', route: '/whiteboard', icon: 'edit' },
    { label: 'Node Flow', route: '/node-flow', icon: 'account_tree' },
  ];

  navItemsOther = [
    { label: 'Settings', route: '/settings', icon: 'settings' },
    { label: 'Help Center', route: '/help', icon: 'help_outline' },
  ];

  ngOnInit() {
    this.groups$ = this.groupService.getGroups();
    this.user$ = this.userService.getMe();
  }
}
