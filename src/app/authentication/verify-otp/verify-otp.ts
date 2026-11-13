import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';

import { latinDigits, num, t } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { AuthService } from '../../core/services/auth.service';
import { OtpPurpose } from '../../models/api.models';
import { AuthShell } from '../auth-shell/auth-shell';
import { authError } from '../server-text';

/** "Check your email": the 6-digit code step (design/miqat-2.0: V2-SignIn). */
@Component({
  selector: 'app-verify-otp',
  standalone: true,
  imports: [AuthShell, TPipe],
  templateUrl: './verify-otp.html',
  styleUrl: './verify-otp.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VerifyOtpComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  email = signal('');
  /**
   * Which flow sent the user here. This used to be hardcoded to 'PasswordReset',
   * so codes issued during registration were verified against the wrong purpose
   * and email verification could never succeed.
   */
  purpose = signal<OtpPurpose>('PasswordReset');
  otpDigits = signal<string[]>(['', '', '', '', '', '']);

  readonly otpCode = computed(() => this.otpDigits().join(''));
  readonly isEmailVerification = computed(() => this.purpose() === 'EmailVerification');

  // All of this state is written from async callbacks and a timer. The app runs
  // zoneless (provideZonelessChangeDetection), so plain fields mutated outside a
  // template event never trigger a re-render — the countdown sat frozen at 60 and
  // no error, success or loading state ever appeared on screen.
  isLoading = signal(false);
  isResending = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  countdown = signal(60);
  /** "0:42" */
  readonly countdownLabel = computed(() => {
    const left = this.countdown();
    return num(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
  });

  /**
   * "We sent a 6-digit code to *you@company.com*. It expires in 10 minutes.", as the
   * text before the address and the text after it (the address is drawn between them).
   */
  readonly sentTo = t('We sent a {n}-digit code to *{email}*. It expires in {minutes} minutes.', { n: 6, minutes: 10 }).split('*');

  private timerInterval?: ReturnType<typeof setInterval>;
  /** True when no code was sent on the way here (see ngOnInit). */
  private arrivedWithoutCode = false;

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.email.set(params['email'] || '');
      this.purpose.set(params['purpose'] === 'EmailVerification' ? 'EmailVerification' : 'PasswordReset');
      // Registration succeeded but the email itself failed to send — say so up
      // front instead of letting the user wait for a code that never left.
      if (params['sendFailed'] === '1') {
        this.errorMessage.set(
          t('Your account was created, but the code could not be emailed. Press "Resend code" to try again.'));
      }
      // Sent here from the sign-in form: no code was emailed just now, so there is
      // nothing to wait for — offer "Resend code" straight away.
      this.arrivedWithoutCode = params['resend'] === '1' || params['sendFailed'] === '1';
      if (params['resend'] === '1') {
        this.successMessage.set(
          t('Your email is not verified yet. Enter the code we emailed you when you signed up, or press "Resend code" for a new one.'));
      }
      if (!this.email()) {
        this.router.navigate(['/authentication/forgot-password']);
      }
    });

    if (this.arrivedWithoutCode) this.countdown.set(0);
    else this.startTimer();
  }

  ngOnDestroy() {
    this.clearTimer();
  }

  startTimer() {
    this.countdown.set(60);
    this.clearTimer();
    this.timerInterval = setInterval(() => {
      const remaining = this.countdown();
      if (remaining > 0) this.countdown.set(remaining - 1);
      else this.clearTimer();
    }, 1000);
  }

  clearTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  onOtpDigitChange(index: number, event: any): void {
    // Codes are digits only. Anything else is dropped, and the box is rewritten so
    // a rejected letter does not stay on screen.
    // An Arabic keyboard may type ٤ for 4: the code itself is always 0-9.
    const value = latinDigits(String(event.target.value ?? '')).replace(/\D/g, '');
    if (event.target.value !== value.slice(0, 1) && value.length <= 1) {
      event.target.value = value;
    }
    if (value && value.length > 1) {
      // Handle paste
      const digits = value.split('').slice(0, 6);
      this.otpDigits.update(current => {
        const next = [...current];
        digits.forEach((d: string, i: number) => {
          if (index + i < 6) next[index + i] = d;
        });
        return next;
      });
      // The box that received the paste still holds the whole string; show its own digit.
      event.target.value = digits[0];
      // focus the correct input
      setTimeout(() => {
        const nextIndex = Math.min(index + digits.length, 5);
        const inputs = document.querySelectorAll('.otp-input');
        (inputs[nextIndex] as HTMLInputElement)?.focus();
      });
    } else {
      this.otpDigits.update(current => {
        const next = [...current];
        next[index] = value;
        return next;
      });
      if (value && index < 5) {
        setTimeout(() => {
          const inputs = document.querySelectorAll('.otp-input');
          (inputs[index + 1] as HTMLInputElement)?.focus();
        });
      }
    }
  }

  onKeyDown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.otpDigits()[index] && index > 0) {
      setTimeout(() => {
        const inputs = document.querySelectorAll('.otp-input');
        (inputs[index - 1] as HTMLInputElement)?.focus();
      });
    }
  }

  onSubmit(): void {
    if (this.otpCode().length < 6) {
      this.errorMessage.set(t('Enter all {n} digits of the code.', { n: 6 }));
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.authService.verifyOtp({ email: this.email(), code: this.otpCode(), purpose: this.purpose() }).pipe(
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: () => {
        if (this.isEmailVerification()) {
          // Registration is complete. The API signs the user in with this answer, so
          // the last step of signing up follows: "Set up your week". Asking them to
          // type their password again right after they proved who they are was an
          // unnecessary extra step.
          if (this.authService.isLoggedIn()) {
            this.router.navigate(['/authentication/setup']);
            return;
          }
          this.router.navigate(['/authentication'], {
            queryParams: { form: 'login', verified: '1' }
          });
          return;
        }

        // POST /api/Auth/reset-password matches its `token` against the OTP
        // *code*, not against a JWT. Forwarding the access token from this
        // response meant reset-password always answered "Invalid OTP".
        this.router.navigate(['/authentication/reset-password'], {
          queryParams: { email: this.email(), token: this.otpCode() }
        });
      },
      error: (err) => {
        this.errorMessage.set(authError(err, 'Invalid code. Please try again.'));
      }
    });
  }

  resendOtp(): void {
    if (this.countdown() > 0 || this.isResending()) return;
    this.isResending.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    this.authService.resendOtp({ email: this.email(), purpose: this.purpose() }).pipe(
      finalize(() => this.isResending.set(false))
    ).subscribe({
      next: () => {
        this.successMessage.set(t('A new code has been sent to your email.'));
        this.startTimer();
      },
      error: (err) => {
        this.errorMessage.set(authError(err, 'Failed to resend the code.'));
      }
    });
  }

  /** "Wrong email?": back to where the address was typed. */
  changeEmail(): void {
    if (this.isEmailVerification()) this.router.navigate(['/register']);
    else this.router.navigate(['/authentication/forgot-password']);
  }
}
