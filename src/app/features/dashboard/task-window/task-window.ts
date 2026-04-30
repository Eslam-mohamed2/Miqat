import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TaskService, TaskDto } from '../../../core/services/task.service';

@Component({
  selector: 'app-task-window',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './task-window.html',
  styleUrl: './task-window.scss'
})
export class TaskWindowComponent implements OnInit {
  private fb = inject(FormBuilder);
  private taskService = inject(TaskService);
  private dialogRef = inject(MatDialogRef<TaskWindowComponent>);
  public data = inject(MAT_DIALOG_DATA, { optional: true });

  taskForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  isEditMode = false;
  taskId?: string;

  constructor() {
    this.taskForm = this.fb.group({
      title: ['', Validators.required],
      description: [''],
      status: ['Pending'],
      priority: ['Medium'],
      dueDate: [''],
      tags: ['']
    });
  }

  ngOnInit() {
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
    }
  }

  onSubmit() {
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }
    
    this.isLoading = true;
    this.errorMessage = '';
    
    const dto: TaskDto = this.taskForm.value;
    
    if (dto.dueDate) {
      dto.dueDate = new Date(dto.dueDate).toISOString();
    }

    if (this.isEditMode && this.taskId) {
      this.taskService.updateTask(this.taskId, dto).subscribe({
        next: (result) => {
          this.isLoading = false;
          this.dialogRef.close(result || true);
        },
        error: (err) => {
          this.isLoading = false;
          this.errorMessage = err.error?.message || 'Failed to update task';
          console.error(err);
        }
      });
    } else {
      this.taskService.createTask(dto).subscribe({
        next: (result) => {
          this.isLoading = false;
          this.dialogRef.close(result);
        },
        error: (err) => {
          this.isLoading = false;
          this.errorMessage = err.error?.message || 'Failed to create task';
          console.error(err);
        }
      });
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}
