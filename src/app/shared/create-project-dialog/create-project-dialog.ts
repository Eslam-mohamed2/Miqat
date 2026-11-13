import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AuthService } from '../../core/services/auth.service';
import { FriendService } from '../../core/services/friend.service';
import { GroupService } from '../../core/services/group.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { GroupDto } from '../../models/api.models';
import { t } from '../../core/i18n/i18n';
import { NumPipe, TCountPipe, TPipe } from '../../core/i18n/t.pipe';

/**
 * The colours a project can be given. They are data, saved with the project and
 * shown wherever its tasks appear; the set is the design's calendar colours.
 */
const PROJECT_COLOURS = ['#CDAE72', '#8FBF9F', '#8FB0E0', '#D99AA8', '#B9A7E6', '#D9B26A', '#E3907F'];

/** The "New project" dialog. It closes with the created project, or null when cancelled. */
@Component({
  selector: 'app-create-project-dialog',
  standalone: true,
  imports: [TPipe, TCountPipe, NumPipe],
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
  selectedColor = signal(PROJECT_COLOURS[0]);
  loading = signal(false);
  error = signal('');

  users = signal<{ id: string; name: string }[]>([]);
  selectedUserIds = signal<string[]>([]);

  readonly colorSwatches = PROJECT_COLOURS;

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
    if (!this.isValid() || this.loading()) return;
    this.loading.set(true);
    this.error.set('');

    const project: Partial<GroupDto> = {
      name: this.name().trim(),
      description: this.description().trim(),
      color: this.selectedColor()
    };

    this.groupService.createGroup(project).subscribe({
      next: (group) => {
        const userIds = this.selectedUserIds();
        if (userIds.length > 0 && group.id) {
          // A member who cannot be added does not stop the project from being made.
          const requests = userIds.map(id => this.groupService.addMember(group.id, id).pipe(catchError(() => of(null))));
          forkJoin(requests).subscribe(() => {
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
        this.error.set(apiErrorMessage(err, t('The project was not created. Please try again.')));
      }
    });
  }

  textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
