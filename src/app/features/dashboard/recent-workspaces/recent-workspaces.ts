import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-recent-workspaces',
  standalone: true,
  templateUrl: './recent-workspaces.html',
  styleUrl: './recent-workspaces.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecentWorkspaces {}
