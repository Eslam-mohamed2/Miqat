import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { finalize } from 'rxjs';
import { FlipClock } from '../../flip-clock/flip-clock';

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

  email = '';
  otpDigits = ['', '', '', '', '', ''];
  get otpCode() { return this.otpDigits.join(''); }

  isLoading = false;
  isResending = false;
  errorMessage = '';
  successMessage = '';

  countdown = 60;
  timerInterval: any;

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.email = params['email'] || '';
      if (!this.email) {
        this.router.navigate(['/authentication/forgot-password']);
      }
    });
    this.startTimer();
  }

  ngOnDestroy() {
    this.clearTimer();
  }

  startTimer() {
    this.countdown = 60;
    this.clearTimer();
    this.timerInterval = setInterval(() => {
      if (this.countdown > 0) this.countdown--;
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
      digits.forEach((d: string, i: number) => {
        if (index + i < 6) this.otpDigits[index + i] = d;
      });
      // focus the correct input
      setTimeout(() => {
        const nextIndex = Math.min(index + digits.length, 5);
        const inputs = document.querySelectorAll('.otp-input');
        (inputs[nextIndex] as HTMLInputElement)?.focus();
      });
    } else {
      this.otpDigits[index] = value;
      if (value && index < 5) {
        setTimeout(() => {
          const inputs = document.querySelectorAll('.otp-input');
          (inputs[index + 1] as HTMLInputElement)?.focus();
        });
      }
    }
  }

  onKeyDown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.otpDigits[index] && index > 0) {
      setTimeout(() => {
        const inputs = document.querySelectorAll('.otp-input');
        (inputs[index - 1] as HTMLInputElement)?.focus();
      });
    }
  }

  onSubmit(): void {
    if (this.otpCode.length < 6) return;
    this.isLoading = true;
    this.errorMessage = '';

    this.authService.verifyOtp({ email: this.email, code: this.otpCode, purpose: 'PasswordReset' }).pipe(
      finalize(() => this.isLoading = false)
    ).subscribe({
      next: (res) => {
        let token = '';
        if (typeof res === 'string') {
          try {
            const parsed = JSON.parse(res);
            token = parsed.token || parsed.accessToken;
          } catch {
            token = res;
          }
        } else if (res) {
          token = res.token || res.accessToken;
        }
        
        this.router.navigate(['/authentication/reset-password'], { queryParams: { email: this.email, token: token } });
      },
      error: (err) => {
        this.errorMessage = err.error?.message || err.message || 'Invalid code. Please try again.';
      }
    });
  }

  resendOtp(): void {
    if (this.countdown > 0 || this.isResending) return;
    this.isResending = true;
    this.errorMessage = '';
    this.successMessage = '';
    
    this.authService.resendOtp({ email: this.email, purpose: 'PasswordReset' }).pipe(
      finalize(() => this.isResending = false)
    ).subscribe({
      next: () => {
        this.successMessage = 'A new code has been sent to your email.';
        this.startTimer();
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Failed to resend OTP.';
      }
    });
  }
}
