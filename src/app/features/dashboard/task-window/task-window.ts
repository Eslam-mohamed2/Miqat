import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TaskService } from '../../../core/services/task.service';
import { GroupService } from '../../../core/services/group.service';
import { FriendService } from '../../../core/services/friend.service';
import { AuthService } from '../../../core/services/auth.service';
import { GroupDto, TaskDto } from '../../../models/api.models';
import { apiErrorMessage } from '../../../core/http/api-error';
import { CommentThread } from '../../../shared/comment-thread/comment-thread';

@Component({
  selector: 'app-task-window',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, CommentThread],
  templateUrl: './task-window.html',
  styleUrl: './task-window.scss'
})
export class TaskWindowComponent implements OnInit {
  private fb = inject(FormBuilder);
  private taskService = inject(TaskService);
  private groupService = inject(GroupService);
  private friendService = inject(FriendService);
  private authService = inject(AuthService);
  private dialogRef = inject(MatDialogRef<TaskWindowComponent>);
  public data = inject(MAT_DIALOG_DATA, { optional: true });

  taskForm: FormGroup;

  // Signals, not plain fields. The app runs zoneless
  // (provideZonelessChangeDetection), so assigning an array inside a subscribe
  // does not notify change detection — the view was still holding the old []
  // when it re-checked, which is the NG0100
  // "Expression has changed after it was checked. Previous value: '[]'" error
  // reported against the *ngFor over groups.
  groups = signal<GroupDto[]>([]);
  /** Assignable people (friends), as {id, name}. */
  users = signal<{ id: string; name: string }[]>([]);
  isLoading = signal(false);
  errorMessage = signal('');
  isEditMode = false;
  taskId?: string;


  constructor() {
    this.taskForm = this.fb.group({
      title: ['', Validators.required],
      description: [''],
      status: ['Pending'],
      priority: ['Medium'],
      dueDate: [''],
      tags: [''],
      groupId: [''],
      assignedToUserId: ['']
    });
  }

  ngOnInit() {
    this.loadFormOptions();

    if (this.data && this.data.task) {
      this.isEditMode = true;
      this.taskId = this.data.task.id;
      
      let formattedDate = '';
      if (this.data.task.dueDate) {
        const d = new Date(this.data.task.dueDate);
        const offset = d.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(d.getTime() - offset)).toISOString().slice(0,16);
        formattedDate = localISOTime;
      }

      this.taskForm.patchValue({
        ...this.data.task,
        dueDate: formattedDate
      });
    } else if (this.data?.groupId) {
      this.taskForm.patchValue({ groupId: this.data.groupId });
    }

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
      next: people => this.users.set(people ?? []),
      error: () => this.users.set([])
    });
  }

  onSubmit() {
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }
    
    this.isLoading.set(true);
    this.errorMessage.set('');
    
    const dto = {
      ...this.taskForm.value,
      groupId: this.taskForm.value.groupId || undefined,
      assignedToUserId: this.taskForm.value.assignedToUserId || undefined
    } as TaskDto;
    
    if (dto.dueDate) {
      dto.dueDate = new Date(dto.dueDate).toISOString();
    }

    if (this.isEditMode && this.taskId) {
      this.taskService.updateTask(this.taskId, dto).subscribe({
        next: (result) => {
          this.isLoading.set(false);
          this.dialogRef.close(result || true);
        },
        error: (err) => {
          this.isLoading.set(false);
          this.errorMessage.set(apiErrorMessage(err, 'Failed to update task'));
          console.error(err);
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
          this.errorMessage.set(apiErrorMessage(err, 'Failed to create task'));
          console.error(err);
        }
      });
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}
