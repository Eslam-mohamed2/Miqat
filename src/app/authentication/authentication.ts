import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule, FormBuilder,
  FormGroup, Validators
} from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { FlipClock } from '../flip-clock/flip-clock';
import { finalize, Subscription } from 'rxjs';
import { SocialAuthService, GoogleLoginProvider, SocialUser, GoogleSigninButtonDirective } from '@abacritt/angularx-social-login';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { passwordValidators } from '../core/validators/password.validators';
import { apiErrorMessage } from '../core/http/api-error';

@Component({
  selector: 'authentication',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, FlipClock, GoogleSigninButtonDirective],
  templateUrl: './authentication.html',
  styleUrl: './authentication.scss'
})
export class Authentication implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private platformId = inject(PLATFORM_ID);
  private socialAuthService = inject(SocialAuthService); // ✅ inject directly

  activeForm: 'login' | 'register' = 'login';
  isLoading = false;
  /**
   * Kept separate from `isLoading`. The email/password submit buttons bind to
   * `isLoading`, and Google's library can emit a restored credential on page load
   * with no user interaction - sharing one flag left both buttons permanently
   * disabled before the user clicked anything.
   */
  isGoogleLoading = false;
  errorMessage = '';
  successMessage = '';
  showPassword = false;
  /** Where authGuard bounced the user from, so login can send them back. */
  private returnUrl = '/dashboard';
  /** authState replays, so the same credential must not retrigger a sign-in. */
  private handledGoogleToken: string | null = null;
  private googleAuthSub?: Subscription;

  loginForm!: FormGroup;
  registerForm!: FormGroup;

  ngOnInit(): void {
    const path = this.route.snapshot.routeConfig?.path;
    if (path === 'register') {
      this.activeForm = 'register';
    } else if (path === 'login') {
      this.activeForm = 'login';
    }

    this.route.queryParams.subscribe(params => {
      if (params['form'] === 'register') {
        this.activeForm = 'register';
      } else if (params['form'] === 'login') {
        this.activeForm = 'login';
      }
      this.returnUrl = params['returnUrl'] || '/dashboard';

      if (params['verified']) {
        this.successMessage = 'Your email is verified. You can sign in now.';
      } else if (params['reset']) {
        this.successMessage = 'Your password has been reset. You can sign in now.';
      }
    });

    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.registerForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', passwordValidators],
      phoneNumber: ['', [Validators.required]],
      country: ['', [Validators.required]],
      timeZone: ['', [Validators.required]]
    });

    if (isPlatformBrowser(this.platformId)) {
      this.googleAuthSub = this.socialAuthService.authState.subscribe((user: SocialUser) => {
        if (user?.idToken) {
          this.handleGoogleLogin(user.idToken);
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.googleAuthSub?.unsubscribe();
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
      next: () => {
        // A 200 with no usable token would otherwise navigate to a dashboard that
        // 401s on every request. Fail loudly here instead.
        if (!this.authService.isLoggedIn()) {
          this.errorMessage = 'Login succeeded but no session token was returned. Please try again.';
          return;
        }
        this.router.navigateByUrl(this.returnUrl);
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
      next: () => {
        // Route is 'authentication/verify-otp' — '/verify-otp' matches nothing and
        // used to drop registration into a router error.
        this.router.navigate(['/authentication/verify-otp'], {
          queryParams: {
            email: this.registerForm.value.email,
            purpose: 'EmailVerification'
          }
        });
      },
      error: (err) => {
        this.errorMessage = this.extractErrorMessage(err, 'Registration failed. Please try again.');
        console.error('Registration error details:', err);
      }
    });
  }

  onGoogleLogin(): void {
    if (isPlatformBrowser(this.platformId)) {
      // Explicit user action, so allow a retry of a token that already failed.
      // Passive re-emissions still can't loop, because only this path clears it.
      this.handledGoogleToken = null;
      this.socialAuthService.signIn(GoogleLoginProvider.PROVIDER_ID)
        .then((user: SocialUser) => {
          if (user && user.idToken) {
            this.handleGoogleLogin(user.idToken);
          }
        })
        .catch((err: any) => {
          console.error('Google Sign In Error', err);
          this.errorMessage = 'Google sign-in failed. Please try again.';
          this.cdr.detectChanges();
        });
    }
  }

  private handleGoogleLogin(token: string) {
    // authState replays the last credential to every new subscriber and re-emits
    // when Google restores a session, so the same token can arrive several times.
    if (this.isGoogleLoading || this.handledGoogleToken === token) return;
    this.handledGoogleToken = token;

    this.isGoogleLoading = true;
    this.errorMessage = '';
    this.authService.googleLogin({ token }).pipe(
      finalize(() => { this.isGoogleLoading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: () => {
        if (!this.authService.isLoggedIn()) {
          this.errorMessage = 'Google login succeeded but no session token was returned.';
          this.cdr.detectChanges();
          return;
        }
        this.router.navigateByUrl(this.returnUrl);
      },
      error: (err) => {
        this.errorMessage = this.extractErrorMessage(err, 'Google login failed.');
        this.cdr.detectChanges();
      }
    });
  }

  isFieldInvalid(form: FormGroup, field: string): boolean {
    const control = form.get(field);
    return !!(control && control.invalid && control.touched);
  }

  private extractErrorMessage(err: any, defaultMsg: string): string {
    return apiErrorMessage(err, defaultMsg);
  }
}