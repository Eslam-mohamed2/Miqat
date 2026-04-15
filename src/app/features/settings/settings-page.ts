import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPage {
  public themeService = inject(ThemeService);

  activeTab = signal('Profile');
  
  tabs = [
    { name: 'Profile', icon: 'person' },
    { name: 'Workspace', icon: 'business' },
    { name: 'Team', icon: 'groups' },
    { name: 'Notifications', icon: 'notifications' },
    { name: 'Integrations', icon: 'extension' },
    { name: 'Billing', icon: 'payments' },
    { name: 'Security', icon: 'security' }
  ];

  user = signal({
    firstName: 'Sarah',
    lastName: 'Jenkins',
    email: 'sarah.jenkins@miqat.app',
    bio: 'Senior Product Manager focused on building intuitive tools for creative teams.',
    avatarUrl: 'https://i.pravatar.cc/150?u=sarah'
  });

  compactMode = signal(false);

  setTab(tab: string) {
    this.activeTab.set(tab);
  }

  updateUserInfo(field: string, value: string) {
    this.user.update(u => ({ ...u, [field]: value }));
  }

  toggleCompactMode() {
    this.compactMode.update(v => !v);
  }

  saveProfile() {
    console.log('Saving profile...', this.user());
    // Simulate API call
  }
}
