import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class UiService {
  private router = inject(Router);

  notificationPanelOpen = signal(false);
  projectsPanelOpen = signal(false);
  projectDetailsOpen = signal(false);
  selectedProjectId = signal<string | null>(null);

  toggleNotifications() {
    this.projectsPanelOpen.set(false);
    this.notificationPanelOpen.update(v => !v);
  }

  toggleProjects(state?: boolean) {
    this.notificationPanelOpen.set(false);
    if (state !== undefined) {
      this.projectsPanelOpen.set(state);
    } else {
      this.projectsPanelOpen.update(v => !v);
    }
  }

  /**
   * Opens a project as a full workspace page rather than the old slide-over
   * panel. A project holds a task table, a team roster and progress — that does
   * not fit in a 580px drawer.
   *
   * Every existing caller (sidebar, projects panel, notification and mention
   * rows) still calls this, so the navigation stays in one place.
   */
  openProjectDetails(id: string) {
    this.closeAll();
    this.selectedProjectId.set(id);
    this.router.navigate(['/projects', id]);
  }

  closeProjectDetails() {
    this.projectDetailsOpen.set(false);
    this.selectedProjectId.set(null);
  }

  closeAll() {
    this.notificationPanelOpen.set(false);
    this.projectsPanelOpen.set(false);
    this.projectDetailsOpen.set(false);
  }
}
