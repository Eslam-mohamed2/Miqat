import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { finalize } from 'rxjs';
import { FlipClock } from '../../flip-clock/flip-clock';
import { passwordValidators, passwordsMatchValidator } from '../../core/validators/password.validators';
import { apiErrorMessage } from '../../core/http/api-error';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FlipClock],
  templateUrl: './reset-password.html'
})
export class ResetPasswordComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  resetForm!: FormGroup;
  email = '';
  token = '';
  // Signals because the app runs zoneless: plain fields written from an async
  // callback do not trigger change detection, so loading and error states
  // never reached the screen.
  isLoading = signal(false);
  errorMessage = signal('');
  showPassword = false;
  showConfirmPassword = false;

  passwordStrength = { length: false, upper: false, lower: false, number: false, special: false };
  strengthScore = 0;

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.email = params['email'] || '';
      this.token = params['token'] || '';
      
      if (!this.email || !this.token) {
        this.router.navigate(['/authentication/forgot-password']);
      }
    });

    this.resetForm = this.fb.group({
      newPassword: ['', passwordValidators],
      confirmPassword: ['', [Validators.required]]
    }, { validators: passwordsMatchValidator('newPassword', 'confirmPassword') });

    this.resetForm.get('newPassword')?.valueChanges.subscribe(val => {
      this.updatePasswordStrength(val || '');
    });
  }

  updatePasswordStrength(password: string) {
    this.passwordStrength = {
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[^A-Za-z0-9]/.test(password)
    };
    this.strengthScore = Object.values(this.passwordStrength).filter(Boolean).length;
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  onSubmit(): void {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');
    const { newPassword, confirmPassword } = this.resetForm.value;

    this.authService.resetPassword({ email: this.email, token: this.token, newPassword, confirmPassword }).pipe(
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: () => {
        this.router.navigate(['/authentication'], { queryParams: { form: 'login', reset: '1' } });
      },
      error: (err) => {
        this.errorMessage.set(apiErrorMessage(err, 'Failed to reset password. Please try again.'));
      }
    });
  }

  isFieldInvalid(field: string): boolean {
    const control = this.resetForm.get(field);
    return !!(control && control.invalid && control.touched);
  }
}
