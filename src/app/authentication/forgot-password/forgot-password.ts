import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { finalize } from 'rxjs';

import { FlipClock } from '../../flip-clock/flip-clock';
import { apiErrorMessage } from '../../core/http/api-error';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, FlipClock],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss'
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  forgotForm: FormGroup;
  // Signals because the app runs zoneless: plain fields written from an async
  // callback do not trigger change detection, so loading and error states
  // never reached the screen.
  isLoading = signal(false);
  errorMessage = signal('');

  constructor() {
    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onSubmit(): void {
    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    const email = this.forgotForm.value.email;

    this.authService.forgotPassword({ email }).pipe(
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: () => {
        this.router.navigate(['/authentication/verify-otp'], {
          queryParams: { email, purpose: 'PasswordReset' }
        });
      },
      error: (err) => {
        this.errorMessage.set(apiErrorMessage(err, 'Failed to request password reset. Please try again.'));
      }
    });
  }

  isFieldInvalid(field: string): boolean {
    const control = this.forgotForm.get(field);
    return !!(control && control.invalid && control.touched);
  }
}
