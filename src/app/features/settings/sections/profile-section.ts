import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import { UserService } from '../../../core/services/user.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { locale, t } from '../../../core/i18n/i18n';
import { NumPipe, TPipe } from '../../../core/i18n/t.pipe';
import { UpdateProfileDto } from '../../../models/api.models';
import { SettingsStatus } from '../settings-status';

type TextKey = 'fullName' | 'bio' | 'phoneNumber' | 'country' | 'dateOfBirth';

interface TextRow {
  key: TextKey;
  label: string;
  hint: string;
  kind: 'text' | 'area' | 'tel' | 'date';
  maxLength?: number;
}

/** Matches the API's limit for the profile's "about me" text. */
const BIO_MAX_LENGTH = 500;
const MAX_PICTURE_MB = 5;
const MAX_PICTURE_BYTES = MAX_PICTURE_MB * 1024 * 1024;

const ROWS: Record<TextKey, TextRow> = {
  fullName: { key: 'fullName', label: t('Name'), hint: t('Shown on invites and comments'), kind: 'text', maxLength: 100 },
  bio: {
    key: 'bio', label: t('About you'), hint: t('Optional. A line under your name on your profile'),
    kind: 'area', maxLength: BIO_MAX_LENGTH
  },
  phoneNumber: { key: 'phoneNumber', label: t('Phone'), hint: t('Only you can see it'), kind: 'tel', maxLength: 20 },
  country: { key: 'country', label: t('Country'), hint: t('Shown on your profile'), kind: 'text', maxLength: 100 },
  dateOfBirth: { key: 'dateOfBirth', label: t('Date of birth'), hint: t('Only you can see it'), kind: 'date' }
};

/**
 * Settings → Profile: every field PUT /api/User/me accepts, one row each. "Edit"
 * turns the value into a box; leaving the box (or Enter) saves it.
 */
@Component({
  selector: 'app-settings-profile',
  standalone: true,
  imports: [NgTemplateOutlet, TPipe, NumPipe],
  templateUrl: './profile-section.html',
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfileSection {
  private users = inject(UserService);
  private status = inject(SettingsStatus);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private injector = inject(Injector);

  protected readonly rows = ROWS;
  /** The value is what the API keeps; the label is what is shown. */
  protected readonly genders = [{ value: 'Male', label: t('Male') }, { value: 'Female', label: t('Female') }];
  protected readonly maxPictureMb = MAX_PICTURE_MB;

  /** The shared copy, so a change made here shows everywhere at once. */
  protected readonly user = this.users.currentUser;
  protected readonly editing = signal<TextKey | null>(null);
  protected readonly draft = signal('');
  protected readonly problem = signal('');
  protected readonly uploading = signal(false);
  protected readonly removing = signal(false);
  protected readonly pictureFailed = signal(false);

  protected readonly picture = computed(() => (this.pictureFailed() ? null : this.user()?.profilePictureUrl || null));

  protected readonly initials = computed(() => {
    const words = (this.user()?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
  });

  constructor() {
    // Another screen may hold an older copy; the form always starts from the server's.
    this.users.getMe().subscribe({
      error: err => this.status.failed(apiErrorMessage(err, t('Your profile could not be loaded.')))
    });
  }

  /** What a row shows while it is not being edited. */
  protected shown(key: TextKey): string {
    const user = this.user();
    if (!user) return '';
    if (key !== 'dateOfBirth') return (user[key] ?? '').trim();

    const date = user.dateOfBirth ? new Date(user.dateOfBirth) : null;
    return date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      : '';
  }

  protected edit(key: TextKey): void {
    const user = this.user();
    if (!user) return;

    // <input type="date"> only accepts yyyy-MM-dd.
    const value = key === 'dateOfBirth' ? this.dateInput(user.dateOfBirth) : (user[key] ?? '');
    this.draft.set(value);
    this.problem.set('');
    this.editing.set(key);
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLElement>('.edit .field')?.focus();
    }, { injector: this.injector });
  }

  protected cancel(): void {
    this.editing.set(null);
    this.problem.set('');
  }

  /** Saves the box that is open. Called on Enter, on "Done" and when the box loses focus. */
  protected commit(): void {
    const key = this.editing();
    const user = this.user();
    if (!key || !user) return;

    const value = this.draft().trim();
    if (key === 'fullName' && !value) {
      this.problem.set(t('Your name cannot be empty.'));
      return;
    }

    const before = key === 'dateOfBirth' ? this.dateInput(user.dateOfBirth) : (user[key] ?? '').trim();
    if (value === before) {
      this.cancel();
      return;
    }

    // Empty boxes are sent as null, not '', so clearing a field clears it on the server.
    const changed = key === 'dateOfBirth'
      ? (value ? new Date(value).toISOString() : null)
      : (value || null);
    this.editing.set(null);
    this.save({ [key]: changed } as Partial<UpdateProfileDto>);
  }

  protected setGender(value: string): void {
    this.save({ gender: value || null });
  }

  /** PUT /api/User/me replaces every editable field, so the unchanged ones are sent along. */
  private save(changes: Partial<UpdateProfileDto>): void {
    const user = this.user();
    if (!user) return;

    const body: UpdateProfileDto = {
      fullName: user.fullName,
      phoneNumber: this.orNull(user.phoneNumber),
      country: this.orNull(user.country),
      timeZone: this.orNull(user.timeZone),
      gender: this.orNull(user.gender),
      dateOfBirth: user.dateOfBirth || null,
      bio: this.orNull(user.bio),
      ...changes
    };

    this.status.saving();
    this.users.updateMe(body).subscribe({
      next: () => this.status.saved(),
      error: err => this.status.failed(apiErrorMessage(err, t('Your profile could not be saved.')))
    });
  }

  // ── Photo ──────────────────────────────────────────────────────────────────

  protected upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Lets the same file be picked again after a failure.
    input.value = '';
    if (!file) return;

    if (file.size > MAX_PICTURE_BYTES) {
      this.status.failed(t('The picture must be smaller than {n} MB.', { n: MAX_PICTURE_MB }));
      return;
    }

    this.uploading.set(true);
    this.status.saving();
    this.users.uploadProfileImage(file).subscribe({
      next: () => {
        // The service has already published the new address: every avatar in the app follows.
        this.uploading.set(false);
        this.pictureFailed.set(false);
        this.status.saved();
      },
      error: err => {
        this.uploading.set(false);
        // The server's own reason, for example when picture storage is not set up.
        this.status.failed(apiErrorMessage(err, t('That picture could not be uploaded.')));
      }
    });
  }

  protected removePicture(): void {
    if (this.removing() || !this.user()?.profilePictureUrl) return;

    this.removing.set(true);
    this.status.saving();
    this.users.removeProfileImage().subscribe({
      next: () => {
        this.removing.set(false);
        this.status.saved();
      },
      error: err => {
        this.removing.set(false);
        this.status.failed(apiErrorMessage(err, t('Your picture could not be removed.')));
      }
    });
  }

  private orNull(value: string | null | undefined): string | null {
    const trimmed = (value ?? '').trim();
    return trimmed.length ? trimmed : null;
  }

  private dateInput(value: string | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
}
