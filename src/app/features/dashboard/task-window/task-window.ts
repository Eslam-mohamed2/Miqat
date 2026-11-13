import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { AuthService } from '../../../core/services/auth.service';
import { FriendService } from '../../../core/services/friend.service';
import { GroupService } from '../../../core/services/group.service';
import { TaskService } from '../../../core/services/task.service';
import { UserService } from '../../../core/services/user.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { isArabic, latinDigits, t } from '../../../core/i18n/i18n';
import { TPipe } from '../../../core/i18n/t.pipe';
import {
  estimateMinutes, formatEstimate, parseEstimate, visibleTags, withEstimate
} from '../../../core/utils/task-estimate';
import { dateInputInZone, instantFromInputs, timeInputInZone, timeZoneLabel } from '../../../core/utils/time-zone';
import { GroupDto, TaskDto } from '../../../models/api.models';
import { CommentThread } from '../../../shared/comment-thread/comment-thread';
import { PRIORITIES, STATUSES, priorityLabel } from '../../tasks/task-view';

/** What the dialog can be opened with: a task to edit, or the project a new task starts in. */
export interface TaskWindowData {
  task?: TaskDto;
  groupId?: string;
}

/**
 * The "New task" / "Task details" dialog: every field of a task in one form.
 * It closes with the created task, or with `true` after an edit was saved.
 */
@Component({
  selector: 'app-task-window',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, CommentThread, TPipe],
  templateUrl: './task-window.html',
  styleUrl: './task-window.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskWindowComponent implements OnInit {
  private fb = inject(FormBuilder);
  private taskService = inject(TaskService);
  private groupService = inject(GroupService);
  private friendService = inject(FriendService);
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private dialogRef = inject(MatDialogRef<TaskWindowComponent>);
  public data = inject<TaskWindowData | null>(MAT_DIALOG_DATA, { optional: true });

  taskForm: FormGroup;

  // Signals, not plain fields: the app runs zoneless, so an array assigned inside
  // a subscribe would not reach the view.
  groups = signal<GroupDto[]>([]);
  /** Assignable people (friends), as {id, name}. */
  users = signal<{ id: string; name: string }[]>([]);
  isLoading = signal(false);
  errorMessage = signal('');
  isEditMode = false;
  taskId?: string;

  /** Dates and times in the form are on the clock of the profile's time zone. */
  private readonly zone = this.userService.timeZone();
  readonly zoneLabel = timeZoneLabel(this.zone);

  // The values are the API's (the TaskStatus enum and the priority names); the labels are what is shown.
  readonly statuses = STATUSES;
  readonly priorities = PRIORITIES.map(value => ({ value, label: priorityLabel(value) }));
  readonly repeats = [
    { value: 'None', label: t('Does not repeat@@task') },
    { value: 'Daily', label: t('Every day') },
    { value: 'Weekly', label: t('Every week') },
    { value: 'Monthly', label: t('Every month') },
    { value: 'Yearly', label: t('Every year') }
  ];
  /** "30m, 1h 15m": how an estimate is written, in the digits and unit letters of the interface. */
  readonly estimateExample = t('{a}m, {b}h {c}m', { a: 30, b: 1, c: 15 });

  constructor() {
    this.taskForm = this.fb.group({
      title: ['', Validators.required],
      description: [''],
      status: ['Pending'],
      priority: ['Medium'],
      startDay: [''],
      startTime: [''],
      dueDay: [''],
      dueTime: [''],
      estimate: [''],
      recurrence: ['None'],
      recurrenceEndDay: [''],
      tags: [''],
      groupId: [''],
      assignedToUserId: ['']
    });
  }

  ngOnInit() {
    this.loadFormOptions();

    const task = this.data?.task;
    if (task) {
      this.isEditMode = true;
      this.taskId = task.id;

      this.taskForm.patchValue({
        title: task.title ?? '',
        description: task.description ?? '',
        status: task.status || 'Pending',
        priority: task.priority || 'Medium',
        startDay: this.dayOf(task.startDate),
        startTime: this.timeOf(task.startDate),
        dueDay: this.dayOf(task.dueDate),
        // The last minute of the day is how "no particular time" is stored.
        dueTime: this.timeOf(task.dueDate).replace('23:59', ''),
        estimate: formatEstimate(estimateMinutes(task)),
        recurrence: task.recurrence || 'None',
        recurrenceEndDay: this.dayOf(task.recurrenceEndDate),
        // Shown with the comma of the interface language; either comma is read back when saving.
        tags: visibleTags(task.tags).join(isArabic() ? '، ' : ', '),
        groupId: task.groupId ?? '',
        assignedToUserId: task.assignedToUserId ?? ''
      });
    } else if (this.data?.groupId) {
      this.taskForm.patchValue({ groupId: this.data.groupId });
    }
  }

  private instant(value: string | null | undefined): Date | null {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }

  /** `yyyy-mm-dd` for a date field; empty when there is no date. */
  private dayOf(value: string | null | undefined): string {
    const date = this.instant(value);
    return date ? dateInputInZone(date, this.zone) : '';
  }

  /** `HH:mm` for a time field; empty when there is no date. */
  private timeOf(value: string | null | undefined): string {
    const date = this.instant(value);
    return date ? timeInputInZone(date, this.zone) : '';
  }

  loadFormOptions() {
    this.groupService.getGroups().subscribe({
      next: groups => this.groups.set(groups ?? []),
      error: () => this.groups.set([])
    });

    // Friends, not every user: GET /api/User is [Authorize(Roles = "Admin")] and
    // 403s for everyone else, which left this dropdown empty with only
    // "Unassigned" selectable.
    this.friendService.getFriendUsers(this.authService.getCurrentUserId()).subscribe({
      next: people => this.users.set(this.withCurrentAssignee(people ?? [])),
      error: () => this.users.set(this.withCurrentAssignee([]))
    });
  }

  /**
   * The task's assignee may be a project teammate who is not a friend. Without a
   * row of their own the select would show "Unassigned" and saving would unassign them.
   */
  private withCurrentAssignee(people: { id: string; name: string }[]): { id: string; name: string }[] {
    const task = this.data?.task;
    if (!task?.assignedToUserId || people.some(person => person.id === task.assignedToUserId)) return people;
    return [{ id: task.assignedToUserId, name: task.assignedToUserName || t('Current assignee') }, ...people];
  }

  get titleInvalid(): boolean {
    const title = this.taskForm.get('title');
    return !!title && title.invalid && title.touched;
  }

  onSubmit() {
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }

    const value = this.taskForm.value;

    const estimateText = (value.estimate ?? '').trim();
    // Read with either kind of digits and unit letters ("٣٠د" as well as "30m").
    const minutes = estimateText ? parseEstimate(latinDigits(estimateText)) : null;
    if (estimateText && !minutes) {
      this.errorMessage.set(t('Write the estimate like {a}m, {b}h or {b}h {a}m.', { a: 30, b: 1 }));
      return;
    }

    // A day with no time means "sometime that day": a block starts at 09:00, a deadline ends the day.
    const start = value.startDay ? instantFromInputs(value.startDay, value.startTime || '09:00', this.zone) : null;
    const due = value.dueDay ? instantFromInputs(value.dueDay, value.dueTime || '23:59', this.zone) : null;
    if (start && due && start.getTime() > due.getTime()) {
      this.errorMessage.set(t('The time block starts after the deadline. Move one of them.'));
      return;
    }
    const repeatEnd = value.recurrence !== 'None' && value.recurrenceEndDay
      ? instantFromInputs(value.recurrenceEndDay, '23:59', this.zone)
      : null;

    this.isLoading.set(true);
    this.errorMessage.set('');

    // The API replaces the whole task on an edit, so the values this form does
    // not show travel along from the task as it was opened.
    const dto = {
      ...(this.data?.task ?? {}),
      title: value.title.trim(),
      description: value.description ?? '',
      status: value.status,
      priority: value.priority,
      startDate: start ? start.toISOString() : null,
      dueDate: due ? due.toISOString() : null,
      // Labels are separated by commas; the Arabic comma counts as one.
      tags: withEstimate((value.tags ?? '').replace(/،/g, ','), minutes),
      recurrence: value.recurrence || 'None',
      recurrenceEndDate: repeatEnd ? repeatEnd.toISOString() : null,
      groupId: value.groupId || undefined,
      assignedToUserId: value.assignedToUserId || undefined
    } as unknown as TaskDto;

    if (this.isEditMode && this.taskId) {
      this.taskService.updateTask(this.taskId, dto).subscribe({
        next: (result) => {
          this.isLoading.set(false);
          this.dialogRef.close(result || true);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(apiErrorMessage(err, t('Failed to update task')));
        }
      });
    } else {
      this.taskService.createTask(dto).subscribe({
        next: (result) => {
          this.isLoading.set(false);
          this.dialogRef.close(result);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(apiErrorMessage(err, t('Failed to create task')));
        }
      });
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}
