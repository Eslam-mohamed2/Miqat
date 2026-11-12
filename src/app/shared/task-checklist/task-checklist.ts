import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input,
  output, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import { TaskService } from '../../core/services/task.service';
import { SubtaskDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';

/** Matches the API's column size for a checklist line. */
const TITLE_MAX_LENGTH = 200;

/** What the checklist tells its page after every change, so counts elsewhere stay right. */
export interface ChecklistProgress {
  total: number;
  done: number;
}

/**
 * The checklist of a task: the smaller steps it is made of, ticked off one by one.
 *
 * Ticking, renaming, moving and removing show at once and are put back if the
 * API refuses. It hides itself on API builds that have no checklists.
 */
@Component({
  selector: 'app-task-checklist',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './task-checklist.html',
  styleUrl: './task-checklist.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.unavailable]': '!available()' }
})
export class TaskChecklist {
  private tasks = inject(TaskService);
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  private injector = inject(Injector);

  readonly taskId = input.required<string>();
  /** Fires after every change that was saved. */
  readonly changed = output<ChecklistProgress>();

  readonly titleMaxLength = TITLE_MAX_LENGTH;

  readonly list = signal<SubtaskDto[]>([]);
  readonly loading = signal(true);
  readonly available = signal(true);
  /** True while a change is on its way to the API; one at a time keeps the order certain. */
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  /** Text of the "add a line" box. */
  readonly draft = signal('');
  /** The line being renamed, and the text typed so far. */
  readonly editingId = signal<string | null>(null);
  readonly editText = signal('');

  readonly doneCount = computed(() => this.list().filter(line => line.isDone).length);
  readonly percent = computed(() => {
    const total = this.list().length;
    return total ? Math.round((this.doneCount() / total) * 100) : 0;
  });

  constructor() {
    // Reloads when the page moves to another task.
    effect(() => this.load(this.taskId()));
  }

  private load(taskId: string) {
    this.loading.set(true);
    this.error.set(null);
    this.editingId.set(null);

    this.tasks.getSubtasks(taskId).subscribe({
      next: list => {
        this.list.set(this.inOrder(list));
        this.available.set(true);
        this.loading.set(false);
      },
      error: err => {
        // 404 here means the API has no checklists at all (an older build).
        this.available.set(err?.status !== 404);
        this.list.set([]);
        this.loading.set(false);
        if (err?.status !== 404) this.error.set(apiErrorMessage(err, 'The checklist could not be loaded.'));
      }
    });
  }

  // ── Changes ────────────────────────────────────────────────────────────────

  add() {
    const title = this.draft().trim();
    if (!title || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);

    this.tasks.addSubtask(this.taskId(), title).subscribe({
      next: line => {
        this.list.update(list => this.inOrder([...list, line]));
        this.draft.set('');
        this.finish();
      },
      error: err => this.fail(err, 'That line was not added.')
    });
  }

  toggle(line: SubtaskDto) {
    if (this.busy()) return;
    const before = this.list();
    const isDone = !line.isDone;

    this.list.update(list => list.map(l => (l.id === line.id ? { ...l, isDone } : l)));
    this.save(line.id, { isDone }, before, 'That tick was not saved.');
  }

  startRename(line: SubtaskDto) {
    if (this.busy()) return;
    this.editingId.set(line.id);
    this.editText.set(line.title);

    // The box only exists after the next render, so it is focused then.
    afterNextRender(() => {
      const box = this.host.nativeElement.querySelector<HTMLInputElement>('.line-input');
      box?.focus();
      box?.select();
    }, { injector: this.injector });
  }

  cancelRename() {
    this.editingId.set(null);
  }

  /** Enter or leaving the box saves; an empty box or the same text changes nothing. */
  commitRename(line: SubtaskDto) {
    if (this.editingId() !== line.id) return;
    const title = this.editText().trim();
    this.editingId.set(null);
    if (!title || title === line.title) return;

    const before = this.list();
    this.list.update(list => list.map(l => (l.id === line.id ? { ...l, title } : l)));
    this.save(line.id, { title }, before, 'That name was not saved.');
  }

  /** `step` is -1 for up, 1 for down. */
  move(line: SubtaskDto, step: -1 | 1) {
    if (this.busy()) return;
    const before = this.list();
    const from = before.findIndex(l => l.id === line.id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= before.length) return;

    const next = [...before];
    next.splice(from, 1);
    next.splice(to, 0, line);
    this.list.set(next.map((l, position) => ({ ...l, position })));
    this.save(line.id, { position: to }, before, 'That move was not saved.');
  }

  remove(line: SubtaskDto) {
    if (this.busy()) return;
    const before = this.list();

    this.list.update(list => list.filter(l => l.id !== line.id).map((l, position) => ({ ...l, position })));
    this.busy.set(true);
    this.error.set(null);

    this.tasks.deleteSubtask(line.id).subscribe({
      next: () => this.finish(),
      error: err => {
        this.list.set(before);
        this.fail(err, 'That line was not removed.');
      }
    });
  }

  private save(id: string, changes: { title?: string; isDone?: boolean; position?: number },
               before: SubtaskDto[], fallback: string) {
    this.busy.set(true);
    this.error.set(null);

    this.tasks.updateSubtask(id, changes).subscribe({
      next: saved => {
        // Keep the order already on screen; take the rest from the server's copy.
        if (saved?.id) {
          this.list.update(list => list.map(l => (l.id === saved.id ? { ...saved, position: l.position } : l)));
        }
        this.finish();
      },
      error: err => {
        this.list.set(before);
        this.fail(err, fallback);
      }
    });
  }

  private finish() {
    this.busy.set(false);
    this.changed.emit({ total: this.list().length, done: this.doneCount() });
  }

  private fail(err: unknown, fallback: string) {
    this.busy.set(false);
    this.error.set(apiErrorMessage(err, fallback));
  }

  private inOrder(list: SubtaskDto[]): SubtaskDto[] {
    return [...list].sort((a, b) => a.position - b.position);
  }

  /** Reads the text of an input event without the template needing a cast. */
  textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  trackById = (_: number, line: SubtaskDto) => line.id;
}
