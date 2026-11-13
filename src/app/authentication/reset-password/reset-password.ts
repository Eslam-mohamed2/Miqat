import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, finalize, of, switchMap } from 'rxjs';

import { t } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { AuthService } from '../../core/services/auth.service';
import { PASSWORD_MIN_LENGTH, passwordValidators, passwordsMatchValidator } from '../../core/validators/password.validators';
import { AuthShell } from '../auth-shell/auth-shell';
import { authError } from '../server-text';

/** "Choose a new password": the last step of a password reset (design/miqat-2.0: V2-SignIn). */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, AuthShell, TPipe],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
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
  showPassword = signal(false);
  showConfirmPassword = signal(false);
  /** The shortest password the API takes, for the hint in the empty field. */
  readonly minLength = PASSWORD_MIN_LENGTH;

  /** What has been typed so far, for the list of rules under the field. */
  private typed = signal('');

  /** The rules the API holds a password to, each with whether it is met. */
  readonly rules = computed(() => {
    const password = this.typed();
    return [
      { label: t('{n}+ characters', { n: PASSWORD_MIN_LENGTH }), met: password.length >= PASSWORD_MIN_LENGTH },
      { label: t('Uppercase letter'), met: /[A-Z]/.test(password) },
      { label: t('Number@@password rule'), met: /\d/.test(password) },
      { label: t('Special character'), met: /[^A-Za-z0-9]/.test(password) }
    ];
  });

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

    this.resetForm.get('newPassword')?.valueChanges.subscribe(value => this.typed.set(value || ''));
  }

  togglePassword(): void {
    this.showPassword.update(shown => !shown);
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword.update(shown => !shown);
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
      // "Save and sign in": the new password is used straight away. If that sign-in
      // does not go through, the sign-in screen takes over with a note.
      switchMap(() => this.authService.login({ email: this.email, password: newPassword }).pipe(
        catchError(() => of(null))
      )),
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: () => {
        if (this.authService.isLoggedIn()) {
          this.router.navigateByUrl('/calendar');
          return;
        }
        this.router.navigate(['/authentication'], { queryParams: { form: 'login', reset: '1' } });
      },
      error: (err) => {
        this.errorMessage.set(authError(err, 'Failed to reset password. Please try again.'));
      }
    });
  }

  isFieldInvalid(field: string): boolean {
    const control = this.resetForm.get(field);
    return !!(control && control.invalid && control.touched);
  }

  /** The rules appear with the first character, or when the field is left empty. */
  showRules(): boolean {
    return !!this.typed() || !!this.resetForm.get('newPassword')?.touched;
  }

  /** The two passwords differ, and the second one has been visited. */
  mismatch(): boolean {
    return this.resetForm.hasError('mismatch') && !!this.resetForm.get('confirmPassword')?.touched;
  }
}
