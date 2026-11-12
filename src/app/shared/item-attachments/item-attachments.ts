import {
  ChangeDetectionStrategy, Component, effect, inject, input, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import { ATTACHMENT_MAX_BYTES, AttachmentService } from '../../core/services/attachment.service';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { AttachmentDto, CalendarItemKind } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';

/**
 * Files attached to one task or event: the list, a way to add one and a way to
 * get one back. Used by the task page and the event window.
 *
 * It hides itself on API builds that have no attachments.
 */
@Component({
  selector: 'app-item-attachments',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './item-attachments.html',
  styleUrl: './item-attachments.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.unavailable]': '!available()' }
})
export class ItemAttachments {
  private attachments = inject(AttachmentService);
  private users = inject(UserService);
  private readonly myId = inject(AuthService).getCurrentUserId();

  readonly kind = input.required<CalendarItemKind>();
  readonly itemId = input.required<string>();
  /** True when the user owns the item, and so may remove files other people added. */
  readonly canManage = input(false);

  readonly list = signal<AttachmentDto[]>([]);
  readonly loading = signal(true);
  readonly available = signal(true);
  readonly uploading = signal(false);
  /** Id of the file being downloaded or removed, so its row can show it. */
  readonly busyId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => this.load(this.kind(), this.itemId()));
  }

  private load(kind: CalendarItemKind, itemId: string) {
    this.loading.set(true);
    this.error.set(null);

    this.attachments.getForItem(kind, itemId).subscribe({
      next: list => {
        this.list.set(list);
        this.available.set(true);
        this.loading.set(false);
      },
      error: err => {
        // 404 here means the API has no attachments at all (an older build).
        this.available.set(err?.status !== 404);
        this.list.set([]);
        this.loading.set(false);
        if (err?.status !== 404) this.error.set(apiErrorMessage(err, 'Files could not be loaded.'));
      }
    });
  }

  upload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared straight away so the same file can be chosen again after a failure.
    input.value = '';
    if (!file || this.uploading()) return;

    if (file.size > ATTACHMENT_MAX_BYTES) {
      this.error.set('A file can be up to 10 MB.');
      return;
    }

    this.uploading.set(true);
    this.error.set(null);

    this.attachments.upload(this.kind(), this.itemId(), file).subscribe({
      next: attachment => {
        this.list.update(list => [...list, attachment]);
        this.uploading.set(false);
      },
      error: err => {
        this.uploading.set(false);
        this.error.set(apiErrorMessage(err, 'That file was not attached.'));
      }
    });
  }

  /** Fetches the file with the user's sign-in, then hands it to the browser to save. */
  download(attachment: AttachmentDto) {
    if (this.busyId()) return;
    this.busyId.set(attachment.id);
    this.error.set(null);

    this.attachments.download(attachment.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.fileName;
        link.click();
        URL.revokeObjectURL(url);
        this.busyId.set(null);
      },
      error: err => {
        this.busyId.set(null);
        this.error.set(apiErrorMessage(err, 'That file could not be downloaded.'));
      }
    });
  }

  remove(attachment: AttachmentDto) {
    if (this.busyId() || !confirm(`Remove "${attachment.fileName}"?`)) return;
    this.busyId.set(attachment.id);
    this.error.set(null);

    this.attachments.delete(attachment.id).subscribe({
      next: () => {
        this.list.update(list => list.filter(a => a.id !== attachment.id));
        this.busyId.set(null);
      },
      error: err => {
        this.busyId.set(null);
        this.error.set(apiErrorMessage(err, 'That file was not removed.'));
      }
    });
  }

  canRemove(attachment: AttachmentDto): boolean {
    return this.canManage() || (!!this.myId && attachment.uploadedByUserId === this.myId);
  }

  icon(attachment: AttachmentDto): string {
    const type = attachment.contentType ?? '';
    if (type.startsWith('image/')) return 'image';
    if (type === 'application/pdf') return 'picture_as_pdf';
    if (type.includes('zip')) return 'folder_zip';
    if (type.includes('sheet') || type.includes('excel') || type === 'text/csv') return 'table_chart';
    return 'description';
  }

  /** 1536 -> "1.5 KB". */
  size(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** "Carlos Rodriguez · 12 Nov", in the profile's time zone. */
  details(attachment: AttachmentDto): string {
    const date = new Date(attachment.createdAt);
    const day = Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, {
      day: 'numeric', month: 'short', timeZone: this.users.timeZone()
    }).format(date);
    return [this.size(attachment.sizeBytes), attachment.uploadedByName, day].filter(Boolean).join(' · ');
  }

  trackById = (_: number, attachment: AttachmentDto) => attachment.id;
}
