import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { FriendService } from '../../core/services/friend.service';
import { GroupService } from '../../core/services/group.service';
import { TaskService } from '../../core/services/task.service';
import { MatIconModule } from '@angular/material/icon';
import { GroupDto, MemberDto, TaskDto, UpdateProfileDto, UserDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';
import {
  passwordErrorMessage, passwordValidators, passwordsMatchValidator
} from '../../core/validators/password.validators';

/** A project both people are on, with the tasks of theirs the viewer can see. */
interface SharedProject {
  group: GroupDto;
  taskCount: number;
}

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatIconModule],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss'
})
export class ProfilePage implements OnInit {
  private route = inject(ActivatedRoute);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private friendService = inject(FriendService);
  private groupService = inject(GroupService);
  private taskService = inject(TaskService);
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

  // ── Shared-context panels (other people's profiles only) ──────────────────
  sharedProjects = signal<SharedProject[]>([]);
  sharedTasks = signal<TaskDto[]>([]);
  /** Everyone else on the projects the two of us share. */
  mutualTeammates = signal<MemberDto[]>([]);
  contextLoading = signal(false);

  /** Which panel the profile body is showing. */
  tab = signal<'about' | 'projects' | 'tasks'>('about');

  readonly isFriend = computed(() => this.friendshipStatus() === 'Friends');

  /** A stable cover gradient per person, so a profile always looks the same. */
  readonly coverStyle = computed(() => {
    const seed = this.user()?.id ?? '';
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    return `linear-gradient(120deg,
      hsl(${hue} 46% 22%) 0%,
      hsl(${(hue + 38) % 360} 44% 17%) 55%,
      hsl(${(hue + 74) % 360} 40% 14%) 100%)`;
  });

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
      newPassword: ['', passwordValidators],
      confirmPassword: ['', Validators.required]
    }, { validators: passwordsMatchValidator('newPassword', 'confirmPassword') });

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
    this.sharedProjects.set([]);
    this.sharedTasks.set([]);
    this.mutualTeammates.set([]);
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
    this.tab.set('about');
    this.userService.getUserById(id).subscribe({
      next: (data) => {
        this.user.set(data);
        this.loadFriendshipStatus(id);
        this.loadSharedContext(id);
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

  /**
   * What the two of us actually have in common.
   *
   * There is no endpoint for another person's friends or projects — and there
   * should not be. Everything here is derived from what the *viewer* can already
   * see: their own projects, their member lists, and their own tasks. So a
   * project only shows up if the viewer is on it too, which is exactly right.
   */
  private loadSharedContext(otherId: string) {
    this.contextLoading.set(true);
    this.sharedProjects.set([]);
    this.sharedTasks.set([]);
    this.mutualTeammates.set([]);

    this.groupService.getGroups().pipe(catchError(() => of([] as GroupDto[]))).subscribe(groups => {
      const mine = (groups ?? []).slice(0, 20);
      if (!mine.length) { this.contextLoading.set(false); return; }

      forkJoin(
        mine.map(group =>
          this.groupService.getMembers(group.id, 0, 50).pipe(
            catchError(() => of([] as MemberDto[])),
            map(members => ({ group, members: members ?? [] }))
          )
        )
      ).subscribe(results => {
        const shared = results.filter(r => r.members.some(m => m.userId === otherId));

        const myId = this.authService.getCurrentUserId();
        const teammates = new Map<string, MemberDto>();
        for (const { members } of shared) {
          for (const member of members) {
            if (member.userId !== otherId && member.userId !== myId) {
              teammates.set(member.userId, member);
            }
          }
        }
        this.mutualTeammates.set([...teammates.values()]);

        // Task counts come from the viewer's own task list, so the numbers never
        // claim more than the viewer is allowed to know about.
        this.taskService.getTasks().pipe(catchError(() => of([] as TaskDto[]))).subscribe(tasks => {
          const all = tasks ?? [];
          this.sharedTasks.set(
            all.filter(t => t.userId === otherId || t.assignedToUserId === otherId).slice(0, 12)
          );
          this.sharedProjects.set(
            shared.map(({ group }) => ({
              group,
              taskCount: all.filter(t => t.groupId === group.id).length
            }))
          );
          this.contextLoading.set(false);
        });
      });
    });
  }

  saveProfile() {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const val = this.profileForm.value;
    const requestBody: UpdateProfileDto = {
      fullName: (val.fullName ?? '').trim(),
      phoneNumber: val.phoneNumber || null,
      country: val.country || null,
      timeZone: val.timeZone || null,
      gender: val.gender || null,
      dateOfBirth: val.dateOfBirth || null
    };

    this.userService.updateMe(requestBody).subscribe({
      next: () => this.showToast('Profile updated successfully!'),
      error: (err) => this.showToast(apiErrorMessage(err, 'Failed to update profile.'), 'error')
    });
  }

  changePassword() {
    if (this.passwordForm.hasError('mismatch')) {
      this.showToast('Passwords do not match', 'error');
      return;
    }
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      this.showToast(passwordErrorMessage(this.passwordForm.get('newPassword')?.errors ?? null), 'error');
      return;
    }
    this.authService.changePassword(this.passwordForm.value).subscribe({
      next: () => {
        this.showToast('Password changed successfully!');
        this.passwordForm.reset();
      },
      error: (err) => this.showToast(apiErrorMessage(err, 'Failed to change password.'), 'error')
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

  // ── Display helpers ───────────────────────────────────────────────────────

  initials(name?: string | null): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  /** "Joined March 2026" — createdAt with no time-of-day noise. */
  joinedLabel(): string {
    const value = this.user()?.createdAt;
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `Joined ${date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`;
  }

  birthdayLabel(): string {
    const value = this.user()?.dateOfBirth;
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  }

  /** The current local time where they are — the small touch that reads as real. */
  localTimeLabel(): string {
    const zone = this.user()?.timeZone;
    if (!zone) return '';
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric', minute: '2-digit', timeZone: zone
      }).format(new Date());
    } catch {
      // An unrecognised zone string must not take the panel down with it.
      return '';
    }
  }

  statusColor(status: string): string {
    switch (status) {
      case 'Completed':   return '#2ec4a0';
      case 'In_progress': return '#7c8ef5';
      case 'On_hold':     return '#9ca3af';
      case 'Cancelled':   return '#ef4444';
      default:            return '#f4a835';
    }
  }

  label(value?: string | null): string {
    return (value ?? '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  }

  trackByGroupId = (_: number, item: SharedProject) => item.group.id;
  trackByTaskId = (_: number, item: TaskDto) => item.id;
  trackByUserId = (_: number, item: MemberDto) => item.userId;
}
