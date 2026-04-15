import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../core/services/theme.service';
import { UiService } from '../../core/services/ui.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TaskWindowComponent } from '../../features/dashboard/task-window/task-window';
import { NotificationService } from '../../core/services/notification.service';
import { NotificationPanel } from '../../shared/notification-panel/notification-panel';
import { ProjectsPanel } from '../../shared/projects-panel/projects-panel';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-topnav',
  standalone: true,
  imports: [
    MatIconModule,
    CommonModule,
    MatDialogModule,
    NotificationPanel,
    ProjectsPanel
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

  unreadCount$: Observable<number> = this.notificationService.getUnread().pipe(
    map((res: any) => Array.isArray(res) ? res.length : 0)
  );

  onQuickAdd(): void {
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
}
