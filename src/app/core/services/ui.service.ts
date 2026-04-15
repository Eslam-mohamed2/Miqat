import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class UiService {
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

  openProjectDetails(id: string) {
    this.closeAll();
    this.selectedProjectId.set(id);
    this.projectDetailsOpen.set(true);
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
