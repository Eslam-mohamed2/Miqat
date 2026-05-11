import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ThemeService } from '../../core/services/theme.service';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule, ReactiveFormsModule],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPage {
  public themeService = inject(ThemeService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);

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

  profileForm!: FormGroup;
  passwordForm!: FormGroup;

  user = signal<any>({
    firstName: '',
    lastName: '',
    email: '',
    bio: '',
    avatarUrl: ''
  });

  compactMode = signal(false);
  isLoading = signal(true);
  isSaving = signal(false);
  isUploading = signal(false);

  toastMessage = signal('');
  toastError = signal(false);
  showToastState = signal(false);

  // Notification Preferences Mock
  emailNotifications = signal(true);
  pushNotifications = signal(true);
  weeklySummary = signal(false);

  constructor() {
    this.profileForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: [{value: '', disabled: true}],
      bio: ['', [Validators.maxLength(275)]]
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    });

    this.loadProfile();
  }

  loadProfile() {
    this.isLoading.set(true);
    this.userService.getMe().subscribe({
      next: (data) => {
        let firstName = '';
        let lastName = '';
        if (data.fullName) {
          const parts = data.fullName.split(' ');
          firstName = parts[0];
          lastName = parts.slice(1).join(' ');
        }
        this.user.set({
          ...data,
          firstName,
          lastName,
          email: data.email,
          bio: '', // The user Dto doesn't have a bio field currently, so keeping it blank
          avatarUrl: data.profilePictureUrl
        });

        this.profileForm.patchValue({
          firstName,
          lastName,
          email: data.email,
          bio: ''
        });
        
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.showToast('Failed to load profile', true);
      }
    });
  }

  setTab(tab: string) {
    this.activeTab.set(tab);
  }

  toggleCompactMode() {
    this.compactMode.update(v => !v);
  }

  saveProfile() {
    if (this.profileForm.invalid) return;
    this.isSaving.set(true);
    
    const val = this.profileForm.getRawValue();
    const fullName = `${val.firstName} ${val.lastName}`.trim();
    
    const requestBody = {
       fullName: fullName,
       phoneNumber: this.user().phoneNumber ? this.user().phoneNumber : null,
       country: this.user().country ? this.user().country : null,
       timeZone: this.user().timeZone ? this.user().timeZone : null,
       gender: this.user().gender ? this.user().gender : null,
       dateOfBirth: this.user().dateOfBirth ? this.user().dateOfBirth : null
    };

    this.userService.updateMe(requestBody as any).subscribe({
       next: () => {
         this.isSaving.set(false);
         this.showToast('Profile updated successfully');
         this.loadProfile();
       },
       error: (err) => {
         this.isSaving.set(false);
         this.showToast('Failed to update profile: ' + (err.error?.message || err.message), true);
       }
    });
  }

  changePassword() {
    if (this.passwordForm.invalid) return;
    
    if (this.passwordForm.value.newPassword !== this.passwordForm.value.confirmPassword) {
      this.showToast('New passwords do not match', true);
      return;
    }

    this.isSaving.set(true);
    this.authService.changePassword(this.passwordForm.value).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.showToast('Password changed successfully');
        this.passwordForm.reset();
      },
      error: (err) => {
        this.isSaving.set(false);
        this.showToast(err.error?.message || 'Failed to change password', true);
      }
    });
  }

  uploadImage(event: any) {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        this.showToast('File size must be less than 5MB', true);
        return;
      }
      
      // Show preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.user.update(u => ({ ...u, avatarUrl: e.target.result }));
      };
      reader.readAsDataURL(file);

      this.isUploading.set(true);
      this.userService.uploadProfileImage(file).subscribe({
        next: () => {
          this.isUploading.set(false);
          this.showToast('Profile picture updated');
          this.loadProfile();
        },
        error: () => {
          this.isUploading.set(false);
          this.showToast('Failed to upload image', true);
        }
      });
    }
  }

  removeImage() {
    this.user.update(u => ({ ...u, avatarUrl: '' }));
    // Ideally call an endpoint to remove image if it exists
    this.showToast('Profile picture removed (mock)');
  }

  showToast(message: string, isError = false) {
    this.toastMessage.set(message);
    this.toastError.set(isError);
    this.showToastState.set(true);
    setTimeout(() => {
      this.showToastState.set(false);
    }, 3000);
  }

  showPassword1 = false;
  showPassword2 = false;
  showPassword3 = false;
}
