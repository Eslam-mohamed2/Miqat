import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { TaskService, TaskDto } from '../../../core/services/task.service';

@Component({
  selector: 'app-task-window',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './task-window.html',
  styleUrl: './task-window.scss'
})
export class TaskWindowComponent {
  private fb = inject(FormBuilder);
  private taskService = inject(TaskService);
  private dialogRef = inject(MatDialogRef<TaskWindowComponent>);

  taskForm: FormGroup;
  isLoading = false;
  errorMessage = '';

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

  onCancel() {
    this.dialogRef.close();
  }
}
