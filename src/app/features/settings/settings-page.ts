import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ThemeService, ThemePreference } from '../../core/services/theme.service';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { UpdateProfileDto, UserDto } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';
import {
  passwordErrorMessage, passwordValidators, passwordsMatchValidator
} from '../../core/validators/password.validators';

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

  activeTab = signal<'Profile' | 'Appearance' | 'Security'>('Profile');

  /**
   * Workspace, Team, Integrations and Billing were listed here but had no markup
   * at all — selecting any of them rendered a blank page. None has a backing API
   * either, so they are gone rather than left as dead ends.
   */
  readonly tabs = [
    { name: 'Profile', icon: 'person' },
    { name: 'Appearance', icon: 'palette' },
    { name: 'Security', icon: 'security' }
  ] as const;

  readonly genders = ['Male', 'Female'];

  /**
   * From the browser's own ICU data when available, so the list matches what the
   * platform can actually resolve. The fallback covers older browsers.
   */
  readonly timeZones: string[] = this.loadTimeZones();

  profileForm!: FormGroup;
  passwordForm!: FormGroup;

  user = signal<UserDto | null>(null);

  isLoading = signal(true);
  isSaving = signal(false);
  isChangingPassword = signal(false);
  isUploading = signal(false);

  toastMessage = signal('');
  toastError = signal(false);
  showToastState = signal(false);

  showCurrentPassword = signal(false);
  showNewPassword = signal(false);
  showConfirmPassword = signal(false);

  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Every field here maps to something UpdateProfileDto actually accepts. The
    // form previously exposed only first/last name plus a bio the API has no
    // column for, so phone, country, timezone, gender and date of birth were
    // unreachable from the UI even though the endpoint supported them.
    this.profileForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: [''],
      email: [{ value: '', disabled: true }],
      phoneNumber: ['', Validators.maxLength(20)],
      country: [''],
      timeZone: [''],
      gender: [''],
      dateOfBirth: ['']
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      // Was minLength(8) only, so passwords missing an uppercase/number/special
      // character passed here and were rejected by the API.
      newPassword: ['', passwordValidators],
      confirmPassword: ['', Validators.required]
    }, { validators: passwordsMatchValidator('newPassword', 'confirmPassword') });

    this.loadProfile();
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  loadProfile() {
    this.isLoading.set(true);
    this.userService.getMe().subscribe({
      next: data => {
        this.user.set(data);

        const [firstName = '', ...rest] = (data.fullName ?? '').trim().split(' ');

        this.profileForm.reset({
          firstName,
          lastName: rest.join(' '),
          email: data.email ?? '',
          phoneNumber: data.phoneNumber ?? '',
          country: data.country ?? '',
          timeZone: data.timeZone ?? '',
          gender: data.gender ?? '',
          // <input type="date"> only accepts yyyy-MM-dd.
          dateOfBirth: this.toDateInput(data.dateOfBirth)
        });

        this.isLoading.set(false);
      },
      error: err => {
        this.isLoading.set(false);
        this.showToast(apiErrorMessage(err, 'Failed to load your profile.'), true);
      }
    });
  }

  saveProfile() {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const value = this.profileForm.getRawValue();

    const body: UpdateProfileDto = {
      fullName: `${value.firstName} ${value.lastName}`.trim(),
      // Empty inputs are sent as null, not '', so clearing a field actually
      // clears it server-side instead of storing a blank string.
      phoneNumber: this.orNull(value.phoneNumber),
      country: this.orNull(value.country),
      timeZone: this.orNull(value.timeZone),
      gender: this.orNull(value.gender),
      dateOfBirth: value.dateOfBirth ? new Date(value.dateOfBirth).toISOString() : null
    };

    this.userService.updateMe(body).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.showToast('Profile updated');
        this.loadProfile();
      },
      error: err => {
        this.isSaving.set(false);
        this.showToast(apiErrorMessage(err, 'Failed to update your profile.'), true);
      }
    });
  }

  uploadImage(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.showToast('Image must be smaller than 5MB.', true);
      input.value = '';
      return;
    }

    this.isUploading.set(true);
    this.userService.uploadProfileImage(file).subscribe({
      next: () => {
        this.isUploading.set(false);
        this.showToast('Profile picture updated');
        this.loadProfile();
      },
      error: err => {
        this.isUploading.set(false);
        // Surfaces the server's reason — e.g. the 503 when image storage is not
        // configured — rather than a blanket "upload failed".
        this.showToast(apiErrorMessage(err, 'Failed to upload that image.'), true);
      }
    });

    // Lets the same file be picked again after a failure.
    input.value = '';
  }

  // ── Security ───────────────────────────────────────────────────────────────

  changePassword() {
    if (this.passwordForm.hasError('mismatch')) {
      this.showToast('New passwords do not match.', true);
      return;
    }
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      this.showToast(passwordErrorMessage(this.passwordForm.get('newPassword')?.errors ?? null), true);
      return;
    }

    this.isChangingPassword.set(true);
    this.authService.changePassword(this.passwordForm.value).subscribe({
      next: () => {
        this.isChangingPassword.set(false);
        this.showToast('Password changed');
        this.passwordForm.reset();
      },
      error: err => {
        this.isChangingPassword.set(false);
        this.showToast(apiErrorMessage(err, 'Failed to change your password.'), true);
      }
    });
  }

  // ── Appearance ─────────────────────────────────────────────────────────────

  setTheme(preference: ThemePreference) {
    this.themeService.setTheme(preference);
  }

  isThemeSelected(preference: ThemePreference): boolean {
    return this.themeService.preference() === preference;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  setTab(tab: 'Profile' | 'Appearance' | 'Security') {
    this.activeTab.set(tab);
  }

  initials(): string {
    const name = this.user()?.fullName?.trim();
    if (!name) return '?';
    return name.split(' ').filter(Boolean).slice(0, 2)
      .map(part => part[0]).join('').toUpperCase();
  }

  memberSince(): string {
    const created = this.user()?.createdAt;
    if (!created) return '';
    const date = new Date(created);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  }

  showToast(message: string, isError = false) {
    this.toastMessage.set(message);
    this.toastError.set(isError);
    this.showToastState.set(true);

    // Without clearing the previous timer, a second toast inherits the first
    // one's countdown and can vanish almost immediately.
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.showToastState.set(false), 3500);
  }

  private orNull(value: string | null | undefined): string | null {
    const trimmed = (value ?? '').trim();
    return trimmed.length ? trimmed : null;
  }

  private toDateInput(value: string | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

  private loadTimeZones(): string[] {
    try {
      const supported = (Intl as unknown as {
        supportedValuesOf?: (key: string) => string[]
      }).supportedValuesOf?.('timeZone');
      if (supported?.length) return supported;
    } catch {
      /* fall through to the short list */
    }

    return [
      'UTC', 'Africa/Cairo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
      'Asia/Dubai', 'Asia/Riyadh', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Singapore',
      'Asia/Tokyo', 'Australia/Sydney', 'America/New_York', 'America/Chicago',
      'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo'
    ];
  }
}
