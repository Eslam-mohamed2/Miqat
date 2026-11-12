import { Component, ChangeDetectionStrategy, OnDestroy, OnInit, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Sidebar } from '../sidebar/sidebar';
import { Topnav } from '../topnav/topnav';
import { RealtimeService } from '../../core/services/realtime.service';
import { NoticeService } from '../../core/services/notice.service';
import { ChatService } from '../../core/services/chat.service';
import { ChatDock } from '../../shared/chat/chat-dock';
import { CallService } from '../../core/services/call.service';
import { CallOverlay } from '../../shared/chat/call-overlay';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [NgIf, RouterOutlet, MatIconModule, Sidebar, Topnav, ChatDock, CallOverlay],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppShell implements OnInit, OnDestroy {
  private realtime = inject(RealtimeService);
  /** Notes that follow the user across a navigation (see NoticeService). */
  readonly notices = inject(NoticeService);
  /** Chat with friends: the bubbles in the corner (see ChatDock). */
  readonly chat = inject(ChatService);
  private calls = inject(CallService);

  ngOnInit() {
    // The shell only exists behind authGuard, so this is the earliest point a
    // live connection is both possible and wanted — and leaving the shell
    // (logout routes away from it) tears the connection down with it.
    this.realtime.connect();
    this.chat.start();
    this.calls.start();
  }

  ngOnDestroy() {
    this.calls.stop();
    this.chat.stop();
    this.realtime.disconnect();
    this.notices.clear();
  }
}
