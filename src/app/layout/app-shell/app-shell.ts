import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from '../sidebar/sidebar';
import { Topnav } from '../topnav/topnav';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [RouterOutlet, Sidebar, Topnav],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppShell {}
