import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { CalendarSelection } from '../../../../core/services/calendar-state.service';
import { EventDetails } from '../event-details/event-details';

export interface EventWindowData {
  /** The event or task to show. */
  selection: CalendarSelection;
}

/**
 * The detail panel as a window of its own, for screens too narrow to keep the
 * panel beside the calendar. The content is the panel's, unchanged.
 */
@Component({
  selector: 'app-event-window',
  standalone: true,
  imports: [EventDetails],
  template: `
    <div class="window" role="document">
      <app-event-details [selection]="data.selection" (closed)="close()" />
    </div>
  `,
  styleUrl: './event-window.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventWindow {
  private dialogRef = inject(MatDialogRef<EventWindow>);
  readonly data = inject<EventWindowData>(MAT_DIALOG_DATA);

  close() {
    this.dialogRef.close();
  }
}
