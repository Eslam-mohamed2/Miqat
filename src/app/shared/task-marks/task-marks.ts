import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import { TaskDto } from '../../models/api.models';

/**
 * The small marks a task carries in a list or on a board card: how far its
 * checklist is ("2/5") and whether it is waiting on another task ("Blocked").
 *
 * One component so the Tasks page and the project page cannot show them
 * differently. It takes no room when the task has neither.
 */
@Component({
  selector: 'app-task-marks',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <span class="task-mark checklist" *ngIf="total() as count" [class.complete]="done() === count"
          [title]="done() + ' of ' + count + ' checklist lines done'">
      <mat-icon>checklist</mat-icon>{{ done() }}/{{ count }}
    </span>
    <span class="task-mark blocked" *ngIf="task().isBlocked" title="Waiting on a task that is not finished">
      <mat-icon>block</mat-icon>Blocked
    </span>
  `,
  styleUrl: './task-marks.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.empty]': '!total() && !task().isBlocked' }
})
export class TaskMarks {
  readonly task = input.required<TaskDto>();

  readonly total = computed(() => this.task().subtaskCount ?? 0);
  readonly done = computed(() => Math.min(this.task().completedSubtaskCount ?? 0, this.total()));
}
