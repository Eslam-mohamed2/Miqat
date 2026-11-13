import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input,
  output, signal
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { TaskService } from '../../core/services/task.service';
import { UserService } from '../../core/services/user.service';
import { TaskDependenciesDto, TaskDto, TaskLinkDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';
import { zonedParts } from '../../core/utils/time-zone';
import { isArabic, locale, t, tCount } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';

/** Rows the picker shows at once; typing narrows the list. */
const PICKER_LIMIT = 8;

const NO_LINKS: TaskDependenciesDto = { blockedBy: [], blocks: [], isBlocked: false };

/**
 * The API's status values as the task screens name them. The key stays as the API
 * sends it; the label is looked up in the interface language when it is shown.
 */
const STATUS_LABELS: Record<string, () => string> = {
  Pending: () => t('To do'),
  In_progress: () => t('In progress'),
  On_hold: () => t('On hold'),
  Completed: () => t('Done@@status'),
  Cancelled: () => t('Cancelled')
};

/**
 * How a task is tied to others: what has to be finished before it ("Blocked by")
 * and what waits for it ("Blocking").
 *
 * It hides itself on API builds that have no dependencies.
 */
@Component({
  selector: 'app-task-dependencies',
  standalone: true,
  imports: [RouterLink, TPipe],
  templateUrl: './task-dependencies.html',
  styleUrl: './task-dependencies.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.unavailable]': '!available()' }
})
export class TaskDependencies {
  private tasks = inject(TaskService);
  private users = inject(UserService);
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  private injector = inject(Injector);

  readonly taskId = input.required<string>();
  /** Fires after every saved change: is the task blocked now? */
  readonly changed = output<boolean>();

  readonly links = signal<TaskDependenciesDto>(NO_LINKS);
  readonly loading = signal(true);
  readonly available = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly pickerOpen = signal(false);
  readonly query = signal('');
  /** The user's tasks, fetched the first time the picker opens. */
  private readonly allTasks = signal<TaskDto[] | null>(null);
  readonly pickerLoading = signal(false);

  /** Tasks that can still be chosen: not this one, and not already tied to it either way. */
  readonly candidates = computed<TaskDto[]>(() => {
    const links = this.links();
    const taken = new Set<string>([
      this.taskId(),
      ...links.blockedBy.map(link => link.id),
      ...links.blocks.map(link => link.id)
    ]);
    const words = this.query().trim().toLowerCase();

    return (this.allTasks() ?? [])
      .filter(task => !taken.has(task.id))
      .filter(task => !words || (task.title ?? '').toLowerCase().includes(words))
      .slice(0, PICKER_LIMIT);
  });

  constructor() {
    effect(() => this.load(this.taskId()));
  }

  private load(taskId: string) {
    this.loading.set(true);
    this.error.set(null);
    this.closePicker();

    this.tasks.getDependencies(taskId).subscribe({
      next: links => {
        this.links.set(this.safe(links));
        this.available.set(true);
        this.loading.set(false);
      },
      error: err => {
        // 404 here means the API has no dependencies at all (an older build).
        this.available.set(err?.status !== 404);
        this.links.set(NO_LINKS);
        this.loading.set(false);
        if (err?.status !== 404) this.error.set(apiErrorMessage(err, t('Dependencies could not be loaded.')));
      }
    });
  }

  // ── Picker ─────────────────────────────────────────────────────────────────

  openPicker() {
    this.pickerOpen.set(true);
    this.query.set('');
    this.error.set(null);

    // The search box only exists after the next render, so it is focused then.
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLInputElement>('.picker-input')?.focus();
    }, { injector: this.injector });

    if (this.allTasks() !== null || this.pickerLoading()) return;

    this.pickerLoading.set(true);
    this.tasks.getTasks().subscribe({
      next: list => {
        this.allTasks.set(list ?? []);
        this.pickerLoading.set(false);
      },
      error: err => {
        this.pickerLoading.set(false);
        this.pickerOpen.set(false);
        this.error.set(apiErrorMessage(err, t('Your tasks could not be loaded.')));
      }
    });
  }

  closePicker() {
    this.pickerOpen.set(false);
    this.query.set('');
  }

  // ── Changes ────────────────────────────────────────────────────────────────

  /** Says this task has to wait until `task` is finished. */
  add(task: TaskDto) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);

    this.tasks.addDependency(this.taskId(), task.id).subscribe({
      next: links => {
        this.busy.set(false);
        this.closePicker();
        this.apply(links);
      },
      // The API explains itself here ("These two tasks would be waiting for each other.").
      error: err => this.fail(err, t('That link was not added.'))
    });
  }

  /** Removes a "waiting on" link of this task. */
  removeBlockedBy(link: TaskLinkDto) {
    this.remove(this.taskId(), link.id);
  }

  /** Removes the link the other way round: `link` no longer waits for this task. */
  removeBlocks(link: TaskLinkDto) {
    this.remove(link.id, this.taskId());
  }

  private remove(taskId: string, dependsOnTaskId: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);

    this.tasks.removeDependency(taskId, dependsOnTaskId).subscribe({
      next: () => {
        // Asked again rather than worked out here: whether the task is still
        // blocked depends on the links that remain.
        this.tasks.getDependencies(this.taskId()).subscribe({
          next: links => {
            this.busy.set(false);
            this.apply(links);
          },
          error: err => this.fail(err, t('Dependencies could not be reloaded.'))
        });
      },
      error: err => this.fail(err, t('That link was not removed.'))
    });
  }

  private apply(links: TaskDependenciesDto | null | undefined) {
    const next = this.safe(links);
    this.links.set(next);
    this.changed.emit(next.isBlocked);
  }

  private fail(err: unknown, fallback: string) {
    this.busy.set(false);
    this.error.set(apiErrorMessage(err, fallback));
  }

  private safe(links: TaskDependenciesDto | null | undefined): TaskDependenciesDto {
    return {
      blockedBy: links?.blockedBy ?? [],
      blocks: links?.blocks ?? [],
      isBlocked: links?.isBlocked ?? false
    };
  }

  // ── Display ────────────────────────────────────────────────────────────────

  /** "In progress · due 14 Nov", in the profile's time zone. */
  details(link: { status?: string | null; dueDate?: string | null }): string {
    const status = STATUS_LABELS[link.status ?? '']?.() ?? (link.status ?? '').replace(/_/g, ' ');
    const date = link.dueDate ? new Date(link.dueDate) : null;
    // English keeps the day before the month ("14 Nov"), as this row always showed it.
    const due = date && !Number.isNaN(date.getTime())
      ? t('due {date}', {
          date: new Intl.DateTimeFormat(isArabic() ? locale() : 'en-GB', {
            day: 'numeric', month: 'short', timeZone: this.users.timeZone()
          }).format(date)
        })
      : '';
    return [status, due].filter(Boolean).join(' · ');
  }

  /** The label at the end of a row: "Done", "2d late", or the status and due day. */
  state(link: TaskLinkDto): { text: string; late: boolean } {
    if (link.isDone) return { text: t('Done@@status'), late: false };

    const due = link.dueDate ? new Date(link.dueDate) : null;
    if (due && !Number.isNaN(due.getTime()) && due.getTime() < Date.now()) {
      // Whole calendar days in the profile's time zone, as the task list counts them.
      const zone = this.users.timeZone();
      const day = (date: Date) => {
        const parts = zonedParts(date, zone);
        return Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000;
      };
      const days = Math.round(day(new Date()) - day(due));
      return { text: days ? tCount(days, '{n}d late', '{n}d late') : t('Late'), late: true };
    }
    return { text: this.details(link), late: false };
  }

  textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
