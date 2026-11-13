import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { TaskDto } from '../../models/api.models';
import { NumPipe, TPipe } from '../../core/i18n/t.pipe';

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
  imports: [TPipe, NumPipe],
  template: `
    @if (total(); as count) {
      <span class="task-mark checklist" [title]="'{done} of {total} subtasks done' | t: { done: done(), total: count }">{{ done() + '/' + count | num }}</span>
    }
    @if (blocked()) {
      <span class="task-mark blocked" [title]="'Waiting on a task that is not finished' | t">{{ 'Blocked' | t }}</span>
    }
  `,
  styleUrl: './task-marks.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.empty]': '!total() && !blocked()' }
})
export class TaskMarks {
  readonly task = input.required<TaskDto>();

  readonly total = computed(() => this.task().subtaskCount ?? 0);
  readonly done = computed(() => Math.min(this.task().completedSubtaskCount ?? 0, this.total()));
  /** A finished task waits for nothing. */
  readonly blocked = computed(() =>
    !!this.task().isBlocked && this.task().status !== 'Completed' && this.task().status !== 'Cancelled');
}
