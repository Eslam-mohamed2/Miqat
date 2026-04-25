import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { UiService } from '../../core/services/ui.service';
import { GroupService } from '../../core/services/group.service';
import { TaskService } from '../../core/services/task.service';
import { trigger, transition, style, animate } from '@angular/animations';

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

  project = signal<any>(null);
  tasks = signal<any[]>([]);
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

  private getMockFallback(id: string) {
    return {
      id: id,
      name: 'Untitled Project',
      code: `T-${id.substring(0, 3).toUpperCase()}`,
      status: 'Active',
      startDate: null,
      endDate: null,
      assignees: [
        { name: 'User 1', avatar: 'https://i.pravatar.cc/150?u=1' },
      ],
      priority: 'Medium',
      type: 'Task',
      tags: ['UI/UX DESIGN'],
      description: 'No description provided.',
      keyRequirements: [] as string[],
      subtasks: [] as { title: string; completed: boolean }[],
      completedCount: 0,
      totalCount: 0
    };
  }

  loadDetails(id: string) {
    this.isLoading.set(true);
    this.isEditing.set(false);
    
    const fallback = this.getMockFallback(id);
    
    this.groupService.getGroupById(id).subscribe({
      next: (data) => {
        const merged = { ...fallback, ...data };
        this.project.set(merged);
        this.editData = { 
          ...merged,
          startDate: this.toDateInputFormat(merged.startDate),
          endDate: this.toDateInputFormat(merged.endDate)
        };
        this.isLoading.set(false);
      },
      error: () => {
        // Mock data for demonstration as backend might not have high-fidelity mocks ready
        fallback.name = 'WEBSITE REDESIGN';
        fallback.status = 'In Progress';
        fallback.priority = 'High';
        fallback.description = 'Develop a comprehensive, high-fidelity clickable prototype for the landing page and main dashboard views.';
        fallback.keyRequirements = [
          'Incorporate the new brand color palette (Teal & Yellow accents)',
          'Include hover states and micro-interactions for all primary buttons'
        ];
        fallback.subtasks = [
          { title: 'Review competitor landing pages', completed: true },
          { title: 'Draft low-fidelity wireframes', completed: false }
        ];
        fallback.completedCount = 1;
        fallback.totalCount = 2;
        
        this.project.set(fallback);
        this.editData = { 
           ...fallback,
           startDate: this.toDateInputFormat(fallback.startDate),
           endDate: this.toDateInputFormat(fallback.endDate)
        };
        this.isLoading.set(false);
      }
    });
  }

  toggleEdit() {
    if (this.isEditing()) {
      this.isEditing.set(false);
      this.editData = { 
        ...this.project(),
        startDate: this.toDateInputFormat(this.project().startDate),
        endDate: this.toDateInputFormat(this.project().endDate)
      };
    } else {
      this.isEditing.set(true);
    }
  }

  saveChanges() {
    this.isSaving.set(true);
    this.groupService.updateGroup(this.project().id, this.editData).subscribe({
      next: (res) => {
        const merged = { ...this.project(), ...this.editData, ...res };
        this.project.set(merged);
        this.editData = { ...merged };
        this.isEditing.set(false);
        this.isSaving.set(false);
      },
      error: () => {
        // Fallback simulate save locally
        const merged = { ...this.project(), ...this.editData };
        this.project.set(merged);
        this.editData = { ...merged };
        this.isEditing.set(false);
        this.isSaving.set(false);
      }
    });
  }

  close() {
    this.isEditing.set(false);
    this.uiService.closeProjectDetails();
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Not set';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private toDateInputFormat(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  }
}
