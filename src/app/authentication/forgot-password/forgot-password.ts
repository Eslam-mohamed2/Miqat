import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { TPipe } from '../../core/i18n/t.pipe';
import { AuthService } from '../../core/services/auth.service';
import { AuthShell } from '../auth-shell/auth-shell';
import { authError } from '../server-text';

/** "Reset your password": asks for the address and emails it a code (design/miqat-2.0: V2-SignIn). */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, AuthShell, TPipe],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
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
        this.errorMessage.set(authError(err, 'Failed to request password reset. Please try again.'));
      }
    });
  }

  backToSignIn(): void {
    this.router.navigate(['/authentication'], { queryParams: { form: 'login' } });
  }

  isFieldInvalid(field: string): boolean {
    const control = this.forgotForm.get(field);
    return !!(control && control.invalid && control.touched);
  }
}
