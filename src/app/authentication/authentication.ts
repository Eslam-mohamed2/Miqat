import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule, FormBuilder,
  FormGroup, Validators
} from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { FlipClock } from '../flip-clock/flip-clock';
@Component({
  selector: 'authentication',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, FlipClock],
  templateUrl: './authentication.html',
  styleUrl: './authentication.scss'
})
export class Authentication implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  activeForm: 'login' | 'register' = 'login';
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  showPassword = false;

  showOtpPopup = false;
  otpCode = '';
  isVerifyingOtp = false;
  registeredEmail = '';

  loginForm!: FormGroup;
  registerForm!: FormGroup;

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['form'] === 'register') {
        this.activeForm = 'register';
      } else if (params['form'] === 'login') {
        this.activeForm = 'login';
      }
    });

    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.registerForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      phoneNumber: ['', [Validators.required]],
      country: ['', [Validators.required]],
      timeZone: ['', [Validators.required]]
    });
  }

  switchForm(form: 'login' | 'register'): void {
    this.activeForm = form;
    this.errorMessage = '';
    this.successMessage = '';
    this.loginForm.reset();
    this.registerForm.reset();
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  onLogin(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    this.isLoading = true;
    this.errorMessage = '';

    this.authService.login(this.loginForm.value).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = this.extractErrorMessage(err, 'Login failed. Please try again.');
      }
    });
  }

  onRegister(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    this.isLoading = true;
    this.errorMessage = '';

    this.authService.register(this.registerForm.value).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.successMessage = 'Account created! Please enter the OTP sent to your email.';
        this.registeredEmail = this.registerForm.value.email;
        this.showOtpPopup = true;
      },
      error: (err) => {
        this.isLoading = false;
        if (err.status === 204) {
          // SAFEGUARD: The API returned 204 successfully but was interpreted as an HTTP error
          this.successMessage = 'Account created! Please enter the OTP sent to your email.';
          this.registeredEmail = this.registerForm.value.email;
          this.showOtpPopup = true;
        } else {
          this.errorMessage = this.extractErrorMessage(err, 'Registration failed. Please try again.');
        }
      }
    });
  }

  onOtpCodeChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.otpCode = input.value;
  }

  submitOtp(): void {
    if (!this.otpCode) return;
    this.isVerifyingOtp = true;

    this.authService.verifyOtp({ email: this.registeredEmail, code: this.otpCode, purpose: 'EmailVerification' }).subscribe({
      next: () => {
        const loginData = {
          email: this.registeredEmail,
          password: this.registerForm.value.password // Using verified password in memory
        };

        this.authService.login(loginData).subscribe({
          next: () => {
            this.isVerifyingOtp = false;
            this.showOtpPopup = false;
            this.router.navigate(['/dashboard']);
          },
          error: () => {
            // Failsafe: Email verified, but auto-login blocked.
            this.isVerifyingOtp = false;
            this.showOtpPopup = false;
            this.switchForm('login');
            this.successMessage = 'Account verified! Please login.';
          }
        });
      },
      error: (err) => {
        this.isVerifyingOtp = false;
        this.errorMessage = this.extractErrorMessage(err, 'Invalid code. Please try again.');
      }
    });
  }

  requestResendOtp(): void {
    this.authService.resendOtp({ email: this.registeredEmail, purpose: 'Registration' }).subscribe({
      next: (res) => {
        this.successMessage = 'A new code has been sent to your email!';
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Failed to resend OTP.';
      }
    });
  }

  isFieldInvalid(form: FormGroup, field: string): boolean {
    const control = form.get(field);
    return !!(control && control.invalid && control.touched);
  }

  private extractErrorMessage(err: any, defaultMsg: string): string {
    if (typeof err === 'string') return err;
    if (typeof err.error === 'string') return err.error;
    if (err.error?.errors) {
      const firstKey = Object.keys(err.error.errors)[0];
      return err.error.errors[firstKey][0] || defaultMsg;
    }
    return err.error?.message || err.error?.title || defaultMsg;
  }
}