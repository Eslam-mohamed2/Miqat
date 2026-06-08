import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { UiService } from '../../core/services/ui.service';
import { GroupService } from '../../core/services/group.service';
import { TaskService } from '../../core/services/task.service';
import { UserService } from '../../core/services/user.service';
import { TaskWindowComponent } from '../../features/dashboard/task-window/task-window';
import { TaskDto } from '../../models/api.models';
import { trigger, transition, style, animate } from '@angular/animations';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-project-details-panel',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule, MatDialogModule],
  templateUrl: './project-details-panel.html',
  styleUrl: './project-details-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(100%)' }),
        animate('300ms ease-out', style({ transform: 'translateX(0)' }))
      ]),
      transition(':leave', [
        animate('250ms ease-in', style({ transform: 'translateX(100%)' }))
      ])
    ]),
    trigger('fade', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0 }))
      ])
    ])
  ]
})
export class ProjectDetailsPanel {
  public uiService = inject(UiService);
  private groupService = inject(GroupService);
  private taskService = inject(TaskService);
  private userService = inject(UserService);
  private dialog = inject(MatDialog);

  project = signal<any>(null);
  members = signal<any[]>([]);
  allUsers = signal<any[]>([]);
  tasks = signal<TaskDto[]>([]);
  isLoading = signal(false);
  tasksLoading = signal(false);

  isEditing = signal(false);
  isSaving = signal(false);
  editData: any = {};

  constructor() {
    effect(() => {
      const id = this.uiService.selectedProjectId();
      if (id && this.uiService.projectDetailsOpen()) {
        this.loadDetails(id);
      }
    });
  }

  loadDetails(id: string) {
    this.isLoading.set(true);
    this.isEditing.set(false);
    this.members.set([]);
    this.tasks.set([]);
    
    // Load all users
    this.userService.getAllUsers().subscribe({
      next: (users) => this.allUsers.set(users),
      error: () => console.error('Failed to load users')
    });
    
    // Load Group properties
    this.groupService.getGroupById(id).subscribe({
      next: (data) => {
        this.project.set(data);
        this.editData = { 
          name: data.name,
          description: data.description,
          color: data.color || '#2ec4a0'
        };
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load group details', err);
        this.isLoading.set(false);
      }
    });

    // Load Group members
    this.groupService.getMembers(id).subscribe({
      next: (data: any) => {
        // Handle paged response data.items or direct array
        this.members.set(data.items || data || []);
      },
      error: (err: any) => {
        console.error('Failed to load group members', err);
      }
    });

    this.loadProjectTasks(id);
  }

  loadProjectTasks(projectId: string) {
    this.tasksLoading.set(true);
    this.taskService.getTasksByGroup(projectId)
      .pipe(finalize(() => this.tasksLoading.set(false)))
      .subscribe({
        next: tasks => this.tasks.set(tasks ?? []),
        error: err => {
          console.error('Failed to load project tasks', err);
          this.tasks.set([]);
        }
      });
  }

  openTaskDialog() {
    if (!this.project()) return;

    const dialogRef = this.dialog.open(TaskWindowComponent, {
      width: '600px',
      maxWidth: '95vw',
      disableClose: true,
      panelClass: 'custom-dialog-container',
      autoFocus: false,
      data: { groupId: this.project().id }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && this.project()) {
        this.loadProjectTasks(this.project().id);
        this.project.update((current: any) => current ? {
          ...current,
          taskCount: (current.taskCount || 0) + 1
        } : current);
      }
    });
  }

  addMember(userId: string) {
    if (!userId || !this.project()) return;
    
    const projectId = this.project().id;
    this.groupService.addMember(projectId, userId).subscribe({
      next: () => {
        // Refresh members
        this.groupService.getMembers(projectId).subscribe((data: any) => {
          this.members.set(data.items || data || []);
        });
      },
      error: (err) => console.error('Failed to add member', err)
    });
  }

  toggleEdit() {
    if (this.isEditing()) {
      this.isEditing.set(false);
      const current = this.project();
      this.editData = { 
        name: current.name,
        description: current.description,
        color: current.color || '#2ec4a0'
      };
    } else {
      this.isEditing.set(true);
    }
  }

  saveChanges() {
    if (!this.project()) return;
    
    this.isSaving.set(true);
    this.groupService.updateGroup(this.project().id, this.editData)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
      next: (res) => {
        const merged = { ...this.project(), ...this.editData };
        this.project.set(merged);
        this.isEditing.set(false);
      },
      error: (err) => {
        console.error('Failed to update group', err);
      }
    });
  }

  close() {
    this.isEditing.set(false);
    this.uiService.closeProjectDetails();
  }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return 'Not set';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  completedTasksCount(): number {
    return this.tasks().filter(task => this.isTaskCompleted(task)).length;
  }

  completionPercent(): number {
    const total = this.tasks().length;
    return total ? Math.round((this.completedTasksCount() / total) * 100) : 0;
  }

  memberStats() {
    const assigned = new Map<string, { name: string; total: number; completed: number }>();

    for (const task of this.tasks()) {
      const id = task.assignedToUserId || 'unassigned';
      const name = task.assignedToUserName || 'Unassigned';
      const current = assigned.get(id) || { name, total: 0, completed: 0 };
      current.total += 1;
      if (this.isTaskCompleted(task)) current.completed += 1;
      assigned.set(id, current);
    }

    return Array.from(assigned.values()).map(stat => ({
      ...stat,
      percent: stat.total ? Math.round((stat.completed / stat.total) * 100) : 0
    }));
  }

  isTaskCompleted(task: TaskDto): boolean {
    return (task.status || '').toLowerCase() === 'completed';
  }
}
