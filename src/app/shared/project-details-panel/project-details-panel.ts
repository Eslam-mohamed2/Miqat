import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { UiService } from '../../core/services/ui.service';
import { GroupService } from '../../core/services/group.service';
import { TaskService } from '../../core/services/task.service';
import { UserService } from '../../core/services/user.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-project-details-panel',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
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

  project = signal<any>(null);
  members = signal<any[]>([]);
  allUsers = signal<any[]>([]);
  isLoading = signal(false);

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
    this.groupService.getGroupMembers(id).subscribe({
      next: (data) => {
        // Handle paged response data.items or direct array
        this.members.set(data.items || data || []);
      },
      error: (err) => {
        console.error('Failed to load group members', err);
      }
    });
  }

  addMember(userId: string) {
    if (!userId || !this.project()) return;
    
    const projectId = this.project().id;
    this.groupService.addMember(projectId, userId).subscribe({
      next: () => {
        // Refresh members
        this.groupService.getGroupMembers(projectId).subscribe(data => {
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
}
