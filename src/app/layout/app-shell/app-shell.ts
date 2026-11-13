import { Component, ChangeDetectionStrategy, OnDestroy, OnInit, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { Sidebar } from '../sidebar/sidebar';
import { RealtimeService } from '../../core/services/realtime.service';
import { NoticeService } from '../../core/services/notice.service';
import { ChatService } from '../../core/services/chat.service';
import { ChatDock } from '../../shared/chat/chat-dock';
import { CallService } from '../../core/services/call.service';
import { CallOverlay } from '../../shared/chat/call-overlay';
import { GlobalSearch } from '../../shared/global-search/global-search';
import { ProjectsPanel } from '../../shared/projects-panel/projects-panel';
import { UiService } from '../../core/services/ui.service';
import { ToastService } from '../../core/services/toast.service';
import { InboxCountService } from '../../core/services/inbox-count.service';
import { CalendarDataService } from '../../core/services/calendar-data.service';
import { TPipe } from '../../core/i18n/t.pipe';

/**
 * The frame around every signed-in page: the navigation rail (a tab bar on phones)
 * and the page beside it. Pages draw their own header, so there is no shared top bar.
 * The pieces that float above any page are mounted here once: the command palette,
 * the projects drawer, notices, toasts, chat and calls.
 */
@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [RouterOutlet, Sidebar, GlobalSearch, ProjectsPanel, ChatDock, CallOverlay, TPipe],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppShell implements OnInit, OnDestroy {
  private realtime = inject(RealtimeService);
  private inbox = inject(InboxCountService);
  private calendarData = inject(CalendarDataService);
  /** Notes that follow the user across a navigation (see NoticeService). */
  readonly notices = inject(NoticeService);
  /** Chat with friends: the bubbles in the corner (see ChatDock). */
  readonly chat = inject(ChatService);
  readonly ui = inject(UiService);
  readonly toasts = inject(ToastService);
  private calls = inject(CallService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  /**
   * A focused screen is drawn without the rail (design/miqat-2.0: Find a time and
   * Plan my day). Its route says so with `data: { focused: true }`.
   */
  readonly focused = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      startWith(null),
      map(() => {
        let route = this.route.snapshot;
        while (route.firstChild) route = route.firstChild;
        return route.data['focused'] === true;
      })
    ),
    { initialValue: false }
  );

  ngOnInit() {
    // The shell only exists behind authGuard, so this is the earliest point a
    // live connection is both possible and wanted — and leaving the shell
    // (logout routes away from it) tears the connection down with it.
    this.realtime.connect();
    this.chat.start();
    this.calls.start();
    this.inbox.start();
    // So "new event" choices know whether this server has events.
    this.calendarData.probe();
  }

  ngOnDestroy() {
    this.inbox.stop();
    this.calls.stop();
    this.chat.stop();
    this.realtime.disconnect();
    this.notices.clear();
  }
}
