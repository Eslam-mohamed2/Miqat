import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { finalize } from 'rxjs';
import { FlipClock } from '../../flip-clock/flip-clock';
import { OtpPurpose } from '../../models/api.models';
import { apiErrorMessage } from '../../core/http/api-error';

@Component({
  selector: 'app-verify-otp',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FlipClock],
  templateUrl: './verify-otp.html'
})
export class VerifyOtpComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
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
  private timerInterval?: ReturnType<typeof setInterval>;

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.email.set(params['email'] || '');
      this.purpose.set(params['purpose'] === 'EmailVerification' ? 'EmailVerification' : 'PasswordReset');
      // Registration succeeded but the email itself failed to send — say so up
      // front instead of letting the user wait for a code that never left.
      if (params['sendFailed'] === '1') {
        this.errorMessage.set(
          'Your account was created, but the code could not be emailed. Press "Resend code" to try again.');
      }
      if (!this.email()) {
        this.router.navigate(['/authentication/forgot-password']);
      }
    });
    this.startTimer();
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
    const value = event.target.value;
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
    if (this.otpCode().length < 6) return;
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.authService.verifyOtp({ email: this.email(), code: this.otpCode(), purpose: this.purpose() }).pipe(
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: (res) => {
        if (this.isEmailVerification()) {
          // Registration is complete — there is no reset token to carry forward.
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
        this.errorMessage.set(apiErrorMessage(err, 'Invalid code. Please try again.'));
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
        this.successMessage.set('A new code has been sent to your email.');
        this.startTimer();
      },
      error: (err) => {
        this.errorMessage.set(apiErrorMessage(err, 'Failed to resend OTP.'));
      }
    });
  }
}
