import {
  Component, ChangeDetectionStrategy, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { GroupService } from '../../core/services/group.service';
import { FriendService } from '../../core/services/friend.service';
import { AuthService } from '../../core/services/auth.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-create-project-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule],
  templateUrl: './create-project-dialog.html',
  styleUrl: './create-project-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreateProjectDialog {
  private dialogRef = inject(MatDialogRef<CreateProjectDialog>);
  private groupService = inject(GroupService);
  private friendService = inject(FriendService);
  private authService = inject(AuthService);

  name = signal('');
  description = signal('');
  selectedColor = signal('#2ec4a0');
  loading = signal(false);
  error = signal('');
  
  users = signal<{ id: string; name: string }[]>([]);
  selectedUserIds = signal<string[]>([]);

  colorSwatches = [
    '#2ec4a0', '#7c8ef5', '#f4a835', '#f4845f',
    '#e879f9', '#38bdf8', '#4ade80', '#fb7185',
    '#a78bfa', '#fbbf24'
  ];

  constructor() {
    // Friends, not every user: GET /api/User is [Authorize(Roles = "Admin")] and
    // returned 403 here, which is why the invite list always said "No users found".
    this.friendService.getFriendUsers(this.authService.getCurrentUserId()).subscribe({
      next: people => this.users.set(people),
      error: () => this.users.set([])
    });
  }

  selectColor(color: string) {
    this.selectedColor.set(color);
  }

  isValid(): boolean {
    return this.name().trim().length >= 2;
  }

  initials(name: string): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  toggleUser(userId: string) {
    const current = this.selectedUserIds();
    if (current.includes(userId)) {
      this.selectedUserIds.set(current.filter(id => id !== userId));
    } else {
      this.selectedUserIds.set([...current, userId]);
    }
  }

  cancel() {
    this.dialogRef.close(null);
  }

  create() {
    if (!this.isValid()) return;
    this.loading.set(true);
    this.error.set('');

    this.groupService.createGroup({
      name: this.name().trim(),
      description: this.description().trim(),
      color: this.selectedColor()
    } as any).subscribe({
      next: (group) => {
        const userIds = this.selectedUserIds();
        if (userIds.length > 0 && group.id) {
          const reqs = userIds.map(id => this.groupService.addMember(group.id!, id).pipe(catchError(() => of(null))));
          forkJoin(reqs).subscribe(() => {
            this.loading.set(false);
            this.dialogRef.close(group);
          });
        } else {
          this.loading.set(false);
          this.dialogRef.close(group);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set('Failed to create project. Please try again.');
      }
    });
  }
}
