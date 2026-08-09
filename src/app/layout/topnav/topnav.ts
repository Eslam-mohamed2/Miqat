import { Component, ChangeDetectionStrategy, HostListener, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';
import { UiService } from '../../core/services/ui.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TaskWindowComponent } from '../../features/dashboard/task-window/task-window';
import { NotificationService } from '../../core/services/notification.service';
import { MentionService } from '../../core/services/mention.service';
import { FriendService } from '../../core/services/friend.service';
import { ProjectsPanel } from '../../shared/projects-panel/projects-panel';
import { GlobalSearch } from '../../shared/global-search/global-search';
import { CreateProjectDialog } from '../../shared/create-project-dialog/create-project-dialog';
import { Observable, merge, of, timer } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';

const POLL_INTERVAL_MS = 60_000;

@Component({
  selector: 'app-topnav',
  standalone: true,
  imports: [
    MatIconModule,
    CommonModule,
    MatDialogModule,
    ProjectsPanel,
    RouterModule, GlobalSearch],
  templateUrl: './topnav.html',
  styleUrl: './topnav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Topnav {
  public themeService = inject(ThemeService);
  public uiService = inject(UiService);
  private dialog = inject(MatDialog);
  private notificationService = inject(NotificationService);
  private mentionService = inject(MentionService);
  private friendService = inject(FriendService);
  private realtime = inject(RealtimeService);
  quickAddMenuOpen = signal(false);

  /**
   * Badge counts, polled every minute.
   *
   * Each poll swallows its own errors. Without that, a single failed request
   * completes the outer timer for good — the badge freezes until a full page
   * reload, and the `async` pipe rethrows the error into the template.
   * `shareReplay` keeps multiple template bindings on one HTTP call.
   */
  unreadCount$: Observable<number> = this.pollCount(() =>
    this.notificationService.getUnread().pipe(map(list => list.length))
  );

  unreadMentionsCount$: Observable<number> = this.pollCount(() =>
    this.mentionService.getUnreadCount()
  );

  pendingFriendsCount$: Observable<number> = this.pollCount(() =>
    this.friendService.getPendingRequests().pipe(map(list => list.length))
  );

  private pollCount(source: () => Observable<number>): Observable<number> {
    // The minute-timer is the fallback; a realtime push refreshes the badge the
    // moment a notification lands, so the count is live rather than up to a
    // minute stale. startWith(null) keeps the initial immediate fetch.
    return merge(timer(0, POLL_INTERVAL_MS), this.realtime.notification$).pipe(
      switchMap(() => source().pipe(catchError(() => of(0)))),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  onQuickAdd(): void {
    if (this.isSmallScreen()) {
      this.quickAddMenuOpen.update(open => !open);
      return;
    }

    this.openTaskDialog();
  }

  openTaskDialog(): void {
    this.closeQuickAddMenu();

    const dialogRef = this.dialog.open(TaskWindowComponent, {
      width: '600px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container',
      autoFocus: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
      }
    });
  }

  openProjectDialog(): void {
    this.closeQuickAddMenu();

    const dialogRef = this.dialog.open(CreateProjectDialog, {
      width: '560px',
      maxWidth: '95vw',
      panelClass: 'custom-dialog-container',
      disableClose: true,
      autoFocus: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.uiService.toggleProjects(true);
      }
    });
  }

  closeQuickAddMenu(): void {
    this.quickAddMenuOpen.set(false);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (!this.isSmallScreen()) {
      this.closeQuickAddMenu();
    }
  }

  private isSmallScreen(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches;
  }
}
