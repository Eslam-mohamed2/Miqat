import { Component, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TaskService, TaskDto } from '../../../core/services/task.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-upcoming-agenda',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './upcoming-agenda.html',
  styleUrl: './upcoming-agenda.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UpcomingAgenda implements OnInit {
  private taskService = inject(TaskService);
  dueSoon$!: Observable<TaskDto[]>;

  ngOnInit(): void {
    this.dueSoon$ = this.taskService.getDueSoonTasks();
  }
  
  getPriorityColor(priority: string | undefined): string {
    if (priority === 'High') return '#ef4444';
    if (priority === 'Medium') return '#f4a835';
    if (priority === 'Low') return '#2ec4a0';
    return '#9ca3af';
  }
}
