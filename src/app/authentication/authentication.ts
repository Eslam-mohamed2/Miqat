import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';

import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule, FormBuilder,
  FormGroup, Validators
} from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { FlipClock } from '../flip-clock/flip-clock';
import { finalize } from 'rxjs';

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
  private cdr = inject(ChangeDetectorRef);


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
      // Improved: Match the hint in the HTML (Ucase, Lcase, Number, Special Char)
      password: ['', [
        Validators.required,
        Validators.minLength(8),
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
      ]],
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

    this.authService.login(this.loginForm.value).pipe(
      finalize(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({

      next: (res) => {
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
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

    this.authService.register(this.registerForm.value).pipe(
      finalize(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      })
    ).subscribe({

      next: (res) => {
        this.successMessage = 'Account created! Please enter the OTP sent to your email.';
        this.registeredEmail = this.registerForm.value.email;
        this.showOtpPopup = true;
      },
      error: (err) => {
        // The service already handles 204/200 OK by returning of('Success')
        // If we still hit the error block with a 2xx status, it means something is wrong in the service
        this.errorMessage = this.extractErrorMessage(err, 'Registration failed. Please try again.');
        console.error('Registration error details:', err);
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
    this.authService.resendOtp({
      email: this.registeredEmail,
      purpose: 'EmailVerification' // ← was 'Registration'
    }).subscribe({
      next: () => {
        this.successMessage = 'A new code has been sent to your email!';
        this.errorMessage = '';
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Failed to resend OTP.';
        this.successMessage = '';
      }
    });
  }

  isFieldInvalid(form: FormGroup, field: string): boolean {
    const control = form.get(field);
    return !!(control && control.invalid && control.touched);
  }

  private extractErrorMessage(err: any, defaultMsg: string): string {
    console.log('Raw error object received:', err);
    if (typeof err === 'string') return err;

    let message = '';
    
    // Handle case where error is an object but contains a message
    if (err.error?.message && typeof err.error.message === 'string') {
      message = err.error.message;
    }

    // Handle case where err.error is a JSON string (common in some API configurations)
    if (!message && typeof err.error === 'string' && err.error.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(err.error);
        message = parsed.message || parsed.title || '';
      } catch (e) {
        console.error('Failed to parse error JSON:', e);
      }
    }

    if (!message && typeof err.error === 'string' && err.error.trim().length > 0 && !err.error.startsWith('<')) {
      message = err.error;
    }

    // Check if it's an HttpErrorResponse with a 409 status specifically
    if (!message && err.status === 409) {
      message = 'Conflict: User might already exist or a policy was violated.';
    }

    // ASP.NET Core Validation errors
    if (!message && err.error?.errors) {
      const errorEntries = Object.entries(err.error.errors);
      if (errorEntries.length > 0) {
        const [key, messages] = errorEntries[0];
        if (Array.isArray(messages) && messages.length > 0) {
          message = messages[0];
        }
      }
    }

    const finalMsg = message || err.error?.message || err.error?.title || err.message || defaultMsg;
    console.log('Extracted error message:', finalMsg);
    return finalMsg;
  }
}
