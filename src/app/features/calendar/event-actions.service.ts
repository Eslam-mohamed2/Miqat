import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { CalendarDataService } from '../../core/services/calendar-data.service';
import { CalendarStateService } from '../../core/services/calendar-state.service';
import { EventDto } from '../../models/api.models';
import { CalendarBoard } from './calendar-board.service';
import { EventEditor, EventEditorData, OccurrenceTarget } from './components/event-editor/event-editor';

/** Opens the event editor from anywhere on the calendar, always in the calendar's zone. */
@Injectable({ providedIn: 'root' })
export class EventActions {
  private dialog = inject(MatDialog);
  private data = inject(CalendarDataService);
  private state = inject(CalendarStateService);
  private board = inject(CalendarBoard);

  /** A new event on a day (the focused one when none is given), at a time ("HH:mm") when one was picked. */
  newEvent(cell?: Date, time?: string) {
    this.open({ zone: this.board.zone(), date: cell ?? this.state.selectedDate(), time })
      .subscribe(saved => { if (saved) this.data.reload(); });
  }

  /** Changes an event, or with `occurrence` one date of a repeating one. Answers true when it was saved. */
  edit(event: EventDto, occurrence?: OccurrenceTarget): Observable<boolean> {
    return this.open({ zone: this.board.zone(), event, occurrence });
  }

  private open(data: EventEditorData): Observable<boolean> {
    return this.dialog
      .open(EventEditor, { panelClass: 'custom-dialog-container', autoFocus: false, data })
      .afterClosed()
      .pipe(map(saved => !!saved));
  }
}
