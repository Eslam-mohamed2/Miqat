import { Component, ChangeDetectionStrategy, HostListener, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';
import { UiService } from '../../core/services/ui.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TaskWindowComponent } from '../../features/dashboard/task-window/task-window';
import { NotificationService } from '../../core/services/notification.service';
import { MentionService } from '../../core/services/mention.service';
import { FriendService } from '../../core/services/friend.service';
import { ProjectsPanel } from '../../shared/projects-panel/projects-panel';
import { CreateProjectDialog } from '../../shared/create-project-dialog/create-project-dialog';
import { Observable, timer } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-topnav',
  standalone: true,
  imports: [
    MatIconModule,
    CommonModule,
    MatDialogModule,
    ProjectsPanel,
    RouterModule
  ],
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
  quickAddMenuOpen = signal(false);

  unreadCount$: Observable<number> = timer(0, 60000).pipe(
    switchMap(() => this.notificationService.getUnread()),
    map((res: any) => Array.isArray(res) ? res.length : 0)
  );

  unreadMentionsCount$: Observable<number> = timer(0, 60000).pipe(
    switchMap(() => this.mentionService.getUnreadCount())
  );

  pendingFriendsCount$: Observable<number> = timer(0, 60000).pipe(
    switchMap(() => this.friendService.getPendingRequests()),
    map((res: any) => Array.isArray(res) ? res.length : 0)
  );

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
        console.log('Task/Event created successfully from Quick Add:', result);
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
        console.log('Project created successfully from Quick Add:', result);
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
