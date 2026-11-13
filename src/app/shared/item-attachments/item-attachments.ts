import {
  ChangeDetectionStrategy, Component, effect, inject, input, signal
} from '@angular/core';

import { ATTACHMENT_MAX_BYTES, AttachmentService } from '../../core/services/attachment.service';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { AttachmentDto, CalendarItemKind } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';
import { formatNumber, isArabic, locale, t } from '../../core/i18n/i18n';
import { NumPipe, TPipe } from '../../core/i18n/t.pipe';

/**
 * Files attached to one task or event: the list, a way to add one and a way to
 * get one back. Used by the task page and the event window.
 *
 * It hides itself on API builds that have no attachments.
 */
@Component({
  selector: 'app-item-attachments',
  standalone: true,
  imports: [TPipe, NumPipe],
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
        if (err?.status !== 404) this.error.set(apiErrorMessage(err, t('Files could not be loaded.')));
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
      this.error.set(t('A file can be up to {n} MB.', { n: 10 }));
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
        this.error.set(apiErrorMessage(err, t('That file was not attached.')));
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
        this.error.set(apiErrorMessage(err, t('That file could not be downloaded.')));
      }
    });
  }

  remove(attachment: AttachmentDto) {
    if (this.busyId() || !confirm(t('Remove "{name}"?', { name: attachment.fileName }))) return;
    this.busyId.set(attachment.id);
    this.error.set(null);

    this.attachments.delete(attachment.id).subscribe({
      next: () => {
        this.list.update(list => list.filter(a => a.id !== attachment.id));
        this.busyId.set(null);
      },
      error: err => {
        this.busyId.set(null);
        this.error.set(apiErrorMessage(err, t('That file was not removed.')));
      }
    });
  }

  canRemove(attachment: AttachmentDto): boolean {
    return this.canManage() || (!!this.myId && attachment.uploadedByUserId === this.myId);
  }

  /**
   * A short tag for the kind of file: "IMG", "PDF", "ZIP", "XLS", or its extension.
   * The names of formats stay as they are in every language; "IMG" and "FILE" are words.
   */
  tag(attachment: AttachmentDto): string {
    const type = attachment.contentType ?? '';
    if (type.startsWith('image/')) return t('IMG');
    if (type === 'application/pdf') return 'PDF';
    if (type.includes('zip')) return 'ZIP';
    if (type.includes('sheet') || type.includes('excel') || type === 'text/csv') return 'XLS';
    const extension = /\.([a-z0-9]{1,4})$/i.exec(attachment.fileName ?? '')?.[1];
    return extension ? extension.toUpperCase() : t('FILE');
  }

  /** 1536 -> "1.5 KB". */
  size(bytes: number): string {
    if (bytes < 1024) return t('{n} B', { n: this.figure(bytes, 0) });
    if (bytes < 1024 * 1024) return t('{n} KB', { n: this.figure(bytes / 1024, bytes < 10 * 1024 ? 1 : 0) });
    return t('{n} MB', { n: this.figure(bytes / (1024 * 1024), 1) });
  }

  /** A number with a fixed count of decimals, in the chosen digits and with their decimal mark. */
  private figure(value: number, decimals: number): string {
    return formatNumber(value, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false });
  }

  /** "Carlos Rodriguez · 12 Nov", in the profile's time zone. */
  details(attachment: AttachmentDto): string {
    const date = new Date(attachment.createdAt);
    const day = Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale(), {
      day: 'numeric', month: 'short', timeZone: this.users.timeZone()
    }).format(date);
    // In an Arabic line a Latin name would otherwise pull the date's digits to its own side:
    // the name is isolated (U+2068 … U+2069) so each piece of the line keeps its place.
    const name = attachment.uploadedByName && isArabic()
      ? '\u2068' + attachment.uploadedByName + '\u2069'
      : attachment.uploadedByName;
    return [this.size(attachment.sizeBytes), name, day].filter(Boolean).join(' · ');
  }
}
