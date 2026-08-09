import { Component, ChangeDetectionStrategy, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from '../sidebar/sidebar';
import { Topnav } from '../topnav/topnav';
import { RealtimeService } from '../../core/services/realtime.service';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [RouterOutlet, Sidebar, Topnav],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppShell implements OnInit, OnDestroy {
  private realtime = inject(RealtimeService);

  ngOnInit() {
    // The shell only exists behind authGuard, so this is the earliest point a
    // live connection is both possible and wanted — and leaving the shell
    // (logout routes away from it) tears the connection down with it.
    this.realtime.connect();
  }

  ngOnDestroy() {
    this.realtime.disconnect();
  }
}
