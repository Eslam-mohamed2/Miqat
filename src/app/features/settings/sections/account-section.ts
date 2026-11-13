import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl } from '@angular/forms';

import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { latinDigits, t } from '../../../core/i18n/i18n';
import { NumPipe, TPipe } from '../../../core/i18n/t.pipe';
import {
  PASSWORD_MIN_LENGTH, passwordErrorMessage, strongPasswordValidator
} from '../../../core/validators/password.validators';
import { SettingsStatus } from '../settings-status';

/** Where the email change stands: not started, asking for the address, or waiting for the code. */
type EmailStep = 'idle' | 'request' | 'confirm';

const CODE_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Settings → Account: the sign-in address (changed in two steps: a code is sent
 * to the new address, nothing changes until it is entered) and the password.
 */
@Component({
  selector: 'app-settings-account',
  standalone: true,
  imports: [TPipe, NumPipe],
  templateUrl: './account-section.html',
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountSection {
  private users = inject(UserService);
  private auth = inject(AuthService);
  private status = inject(SettingsStatus);

  protected readonly user = this.users.currentUser;
  protected readonly codeLength = CODE_LENGTH;
  protected readonly passwordMinLength = PASSWORD_MIN_LENGTH;
  /** The sentence of step 2, around the address in bold. */
  protected readonly confirmNote = t('Step {step} of {total}. Enter the {digits}-digit code we sent to {email}.',
    { step: 2, total: 2, digits: CODE_LENGTH }).split('{email}');

  // ── Email ──────────────────────────────────────────────────────────────────
  protected readonly emailStep = signal<EmailStep>('idle');
  protected readonly newEmail = signal('');
  protected readonly emailPassword = signal('');
  /** The address the code was sent to, shown on the second step. */
  protected readonly pendingEmail = signal('');
  protected readonly emailCode = signal('');
  protected readonly emailError = signal('');
  protected readonly requestingEmail = signal(false);
  protected readonly confirmingEmail = signal(false);

  // ── Password ───────────────────────────────────────────────────────────────
  protected readonly passwordOpen = signal(false);
  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly showPasswords = signal(false);
  protected readonly passwordError = signal('');
  protected readonly changingPassword = signal(false);

  constructor() {
    if (!this.user()) this.users.getMe().subscribe({ error: () => {} });
  }

  // ── Email address ──────────────────────────────────────────────────────────

  protected startEmailChange(): void {
    this.newEmail.set('');
    this.emailPassword.set('');
    this.emailCode.set('');
    this.emailError.set('');
    this.emailStep.set('request');
  }

  protected cancelEmailChange(): void {
    this.emailStep.set('idle');
    this.emailError.set('');
    this.emailCode.set('');
    this.emailPassword.set('');
  }

  /** Back to step 1, keeping what was typed, to correct the address. */
  protected useDifferentEmail(): void {
    this.emailCode.set('');
    this.emailError.set('');
    this.emailStep.set('request');
  }

  /** Step 1: the server checks the password and sends a code to the new address. */
  protected requestEmailChange(): void {
    if (this.requestingEmail()) return;

    const address = this.newEmail().trim();
    if (!EMAIL_PATTERN.test(address) || address.length > 255) {
      this.emailError.set(t('Enter a valid email address.'));
      return;
    }
    if (!this.emailPassword()) {
      this.emailError.set(t('Enter your current password.'));
      return;
    }

    this.requestingEmail.set(true);
    this.emailError.set('');

    this.auth.requestEmailChange(address, this.emailPassword()).subscribe({
      next: () => {
        this.requestingEmail.set(false);
        this.pendingEmail.set(address);
        this.emailCode.set('');
        this.emailStep.set('confirm');
      },
      error: err => {
        this.requestingEmail.set(false);
        this.emailError.set(this.emailErrorMessage(err, t('The code could not be sent.')));
      }
    });
  }

  /** Digits only, like the other code screens. */
  protected onEmailCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = latinDigits(input.value).replace(/\D/g, '').slice(0, CODE_LENGTH);
    input.value = digits;
    this.emailCode.set(digits);
    if (this.emailError()) this.emailError.set('');
  }

  /** Step 2: the code from the new address makes it the sign-in address. */
  protected confirmEmailChange(): void {
    const code = this.emailCode();
    if (code.length !== CODE_LENGTH || this.confirmingEmail()) return;

    this.confirmingEmail.set(true);
    this.emailError.set('');
    this.status.saving();

    this.auth.confirmEmailChange(code).subscribe({
      next: result => {
        const email = result?.email || this.pendingEmail();
        this.confirmingEmail.set(false);

        // The session stays valid: sign-in tokens belong to the account, not to
        // the address. Only the address shown around the app has to change.
        this.users.currentUser.update(user => (user ? { ...user, email } : user));
        this.users.refreshMe();

        this.cancelEmailChange();
        this.status.saved();
      },
      error: err => {
        this.confirmingEmail.set(false);
        this.status.reset();
        this.emailError.set(this.emailErrorMessage(err, t('That code was not accepted.')));
      }
    });
  }

  private emailErrorMessage(err: any, fallback: string): string {
    if (err?.status === 404) return t('Changing your email is not available on this server yet.');
    if (err?.status === 429) return t('Too many attempts. Wait a minute, then try again.');
    return apiErrorMessage(err, fallback);
  }

  // ── Password ───────────────────────────────────────────────────────────────

  protected togglePassword(): void {
    this.passwordOpen.update(open => !open);
    this.currentPassword.set('');
    this.newPassword.set('');
    this.confirmPassword.set('');
    this.passwordError.set('');
    this.showPasswords.set(false);
  }

  protected changePassword(): void {
    if (this.changingPassword()) return;

    if (!this.currentPassword()) {
      this.passwordError.set(t('Enter your current password.'));
      return;
    }
    // The same rules the API applies, so a weak password is refused here first.
    const errors = this.newPassword()
      ? strongPasswordValidator()(new FormControl(this.newPassword()))
      : { required: true };
    if (errors) {
      this.passwordError.set(passwordErrorMessage(errors));
      return;
    }
    if (this.newPassword() !== this.confirmPassword()) {
      this.passwordError.set(t('The new passwords do not match.'));
      return;
    }

    this.changingPassword.set(true);
    this.passwordError.set('');
    this.status.saving();

    this.auth.changePassword({
      currentPassword: this.currentPassword(),
      newPassword: this.newPassword(),
      confirmPassword: this.confirmPassword()
    }).subscribe({
      next: () => {
        this.changingPassword.set(false);
        this.togglePassword();
        this.status.saved();
      },
      error: err => {
        this.changingPassword.set(false);
        this.status.reset();
        this.passwordError.set(apiErrorMessage(err, t('Your password could not be changed.')));
      }
    });
  }

  protected logout(): void {
    this.auth.logout().subscribe();
  }
}
