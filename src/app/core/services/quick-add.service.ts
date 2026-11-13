import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { TaskWindowComponent } from '../../features/dashboard/task-window/task-window';
import { EventEditor, EventEditorData } from '../../features/calendar/components/event-editor/event-editor';
import { CreateProjectDialog } from '../../shared/create-project-dialog/create-project-dialog';
import { CalendarDataService } from './calendar-data.service';
import { UiService } from './ui.service';
import { UserService } from './user.service';
import { todayInZone } from '../utils/time-zone';

/**
 * Opens the "new task", "new event" and "new project" dialogs.
 *
 * One place for it, because every page header, the phone tab bar and the command
 * palette all start the same three things.
 */
@Injectable({ providedIn: 'root' })
export class QuickAddService {
  private dialog = inject(MatDialog);
  private ui = inject(UiService);
  private users = inject(UserService);
  private calendarData = inject(CalendarDataService);

  /** The command palette ("Create or search", Ctrl K). */
  openPalette(): void {
    this.ui.openSearch();
  }

  newTask(): void {
    this.dialog.open(TaskWindowComponent, {
      width: '600px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container',
      autoFocus: false
    });
  }

  /** A new event on the given day, or today in the profile's time zone. */
  newEvent(date?: Date): void {
    const zone = this.users.timeZone();
    const data: EventEditorData = { zone, date: date ?? todayInZone(zone) };

    this.dialog
      .open(EventEditor, { panelClass: 'custom-dialog-container', autoFocus: false, data })
      .afterClosed()
      .subscribe(saved => { if (saved) this.calendarData.reload(); });
  }

  newProject(): void {
    this.dialog
      .open(CreateProjectDialog, {
        width: '560px',
        maxWidth: '95vw',
        panelClass: 'custom-dialog-container',
        disableClose: true,
        autoFocus: false
      })
      .afterClosed()
      .subscribe(created => { if (created) this.ui.toggleProjects(true); });
  }
}
