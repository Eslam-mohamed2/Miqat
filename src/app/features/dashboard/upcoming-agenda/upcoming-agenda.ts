import { Component, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TaskService } from '../../../core/services/task.service';
import { TaskDto } from '../../../models/api.models';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

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
    // Consumed with `| async`; without this an API error rethrows in the template.
    this.dueSoon$ = this.taskService.getDueSoonTasks(7).pipe(catchError(() => of([])));
  }
  
  getPriorityColor(priority: string | undefined): string {
    if (priority === 'High') return '#ef4444';
    if (priority === 'Medium') return '#f4a835';
    if (priority === 'Low') return '#2ec4a0';
    return '#9ca3af';
  }
}
