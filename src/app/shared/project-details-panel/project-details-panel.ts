import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { UiService } from '../../core/services/ui.service';
import { GroupService } from '../../core/services/group.service';
import { TaskService } from '../../core/services/task.service';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-project-details-panel',
  standalone: true,
  imports: [CommonModule, MatIconModule],
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
    // Fetch group details
    this.groupService.getGroupById(id).subscribe({
      next: (data) => {
        this.project.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        // Mock data for demonstration as backend might not have high-fidelity mocks ready
        this.project.set({
          id: id,
          name: 'WEBSITE REDESIGN',
          code: 'T-145',
          status: 'In Progress',
          startDate: 'Oct 24',
          endDate: 'Oct 28',
          assignees: [
            { name: 'User 1', avatar: 'https://i.pravatar.cc/150?u=1' },
            { name: 'User 2', avatar: 'https://i.pravatar.cc/150?u=2' }
          ],
          priority: 'High',
          type: 'Task',
          tags: ['UI/UX DESIGN', 'FIGMA'],
          description: 'Develop a comprehensive, high-fidelity clickable prototype for the landing page and main dashboard views. This prototype will be used for the upcoming stakeholder review on Friday.',
          keyRequirements: [
            'Incorporate the new brand color palette (Teal & Yellow accents)',
            'Include hover states and micro-interactions for all primary buttons',
            'Ensure the responsive mobile view is fully linked',
            'Use the updated logo assets provided in the shared drive'
          ],
          subtasks: [
            { title: 'Review competitor landing pages', completed: true },
            { title: 'Draft low-fidelity wireframes', completed: true },
            { title: 'Design high-fidelity mockups', completed: false },
            { title: 'Connect prototype screens', completed: false }
          ],
          completedCount: 2,
          totalCount: 4
        });
        this.isLoading.set(false);
      }
    });
  }

  close() {
    this.uiService.closeProjectDetails();
  }
}
