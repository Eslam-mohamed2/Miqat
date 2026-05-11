import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { FriendService } from '../../core/services/friend.service';
import { MatIconModule } from '@angular/material/icon';
import { UserDto } from '../../models/api.models';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss'
})
export class ProfilePage implements OnInit {
  private route = inject(ActivatedRoute);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private friendService = inject(FriendService);
  private fb = inject(FormBuilder);
  
  isMe = signal(false);
  user = signal<UserDto | null>(null);
  loading = signal(true);
  
  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  
  friendshipStatus = signal<string>('None');
  friendshipId = signal<string | null>(null);
  
  isUploading = signal(false);

  toastMessage = signal<string | null>(null);
  toastType = signal<'success' | 'error'>('success');

  ngOnInit() {
    this.profileForm = this.fb.group({
      fullName: ['', Validators.required],
      phoneNumber: [''],
      country: [''],
      timeZone: [''],
      gender: [''],
      dateOfBirth: ['']
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    });

    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id === 'me' || id === this.authService.getCurrentUserId()) {
        this.isMe.set(true);
        this.loadMyProfile();
      } else {
        this.isMe.set(false);
        this.loadUserProfile(id);
      }
    });
  }

  showToast(message: string, type: 'success' | 'error' = 'success') {
    this.toastMessage.set(message);
    this.toastType.set(type);
    setTimeout(() => this.toastMessage.set(null), 3000);
  }

  loadMyProfile() {
    this.loading.set(true);
    this.userService.getMe().subscribe({
      next: (data) => {
        this.user.set(data);
        this.profileForm.patchValue(data);
        if (data.dateOfBirth) {
           this.profileForm.get('dateOfBirth')?.setValue(data.dateOfBirth.split('T')[0]);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  loadUserProfile(id: string) {
    this.loading.set(true);
    this.userService.getUserById(id).subscribe({
      next: (data) => {
        this.user.set(data);
        this.loadFriendshipStatus(id);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('User not found', 'error');
      }
    });
  }

  loadFriendshipStatus(id: string) {
    this.friendService.getFriendshipStatus(id).subscribe({
       next: (statusData) => {
          this.friendshipStatus.set(statusData.status);
          this.friendshipId.set(statusData.id);
       },
       error: () => {
          this.friendshipStatus.set('None');
       }
    });
  }

  saveProfile() {
    if (this.profileForm.invalid) return;
    this.userService.updateMe(this.profileForm.value).subscribe({
      next: () => this.showToast('Profile updated successfully!'),
      error: (err) => this.showToast('Failed to update profile', 'error')
    });
  }

  changePassword() {
    if (this.passwordForm.invalid) return;
    if (this.passwordForm.value.newPassword !== this.passwordForm.value.confirmPassword) {
      this.showToast('Passwords do not match', 'error');
      return;
    }
    this.authService.changePassword(this.passwordForm.value).subscribe({
      next: () => {
        this.showToast('Password changed successfully!');
        this.passwordForm.reset();
      },
      error: (err) => this.showToast('Failed to change password', 'error')
    });
  }

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { this.showToast('File too large. Max 5MB', 'error'); return; }
      this.isUploading.set(true);
      this.userService.uploadProfileImage(file).subscribe({
        next: () => {
          this.isUploading.set(false);
          this.showToast('Profile image updated!');
          this.loadMyProfile();
        },
        error: () => {
          this.isUploading.set(false);
          this.showToast('Upload failed', 'error');
        }
      });
    }
  }

  sendRequest() {
    const id = this.user()?.id;
    if(id) this.friendService.sendRequest(id).subscribe(() => {
        this.showToast('Friend request sent!');
        this.loadFriendshipStatus(id);
    });
  }

  acceptRequest() {
    const fId = this.friendshipId();
    const id = this.user()?.id;
    if(fId && id) this.friendService.acceptRequest(fId).subscribe(() => {
        this.showToast('Friend request accepted!');
        this.loadFriendshipStatus(id);
    });
  }

  unfriend() {
    const fId = this.friendshipId();
    const id = this.user()?.id;
    if(fId && id) {
       this.friendService.unfriend(fId).subscribe(() => {
          this.showToast('User removed from friends');
          this.loadFriendshipStatus(id);
       });
    }
  }
}
