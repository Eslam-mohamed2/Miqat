import {
  Component, ChangeDetectionStrategy, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { GroupService } from '../../core/services/group.service';
import { UserService } from '../../core/services/user.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-create-project-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatIconModule],
  templateUrl: './create-project-dialog.html',
  styleUrl: './create-project-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreateProjectDialog {
  private dialogRef = inject(MatDialogRef<CreateProjectDialog>);
  private groupService = inject(GroupService);
  private userService = inject(UserService);

  name = signal('');
  description = signal('');
  selectedColor = signal('#2ec4a0');
  loading = signal(false);
  error = signal('');
  
  users = signal<any[]>([]);
  selectedUserIds = signal<string[]>([]);

  colorSwatches = [
    '#2ec4a0', '#7c8ef5', '#f4a835', '#f4845f',
    '#e879f9', '#38bdf8', '#4ade80', '#fb7185',
    '#a78bfa', '#fbbf24'
  ];

  constructor() {
    this.userService.getAllUsers().subscribe({
      next: (data) => this.users.set(data),
      error: () => console.error('Failed to load users')
    });
  }

  selectColor(color: string) {
    this.selectedColor.set(color);
  }

  isValid(): boolean {
    return this.name().trim().length >= 2;
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
    }).subscribe({
      next: (group) => {
        const userIds = this.selectedUserIds();
        if (userIds.length > 0 && group.id) {
          const reqs = userIds.map(id => this.groupService.addMember(group.id, id).pipe(catchError(() => of(null))));
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
