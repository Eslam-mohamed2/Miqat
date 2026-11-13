import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, PLATFORM_ID, inject, signal, viewChild
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GoogleSigninButtonDirective, SocialAuthService, SocialUser } from '@abacritt/angularx-social-login';
import { Subscription, finalize } from 'rxjs';

import { isArabic, t } from '../core/i18n/i18n';
import { TPipe } from '../core/i18n/t.pipe';
import { AuthService } from '../core/services/auth.service';
import { browserTimeZone } from '../core/utils/time-zone';
import { passwordErrorMessage, passwordValidators } from '../core/validators/password.validators';
import { AuthShell } from './auth-shell/auth-shell';
import { authError, rawServerAnswer } from './server-text';

/** Sign in and create an account (design/miqat-2.0: V2-SignIn). */
@Component({
  selector: 'authentication',
  standalone: true,
  imports: [ReactiveFormsModule, GoogleSigninButtonDirective, AuthShell, TPipe],
  templateUrl: './authentication.html',
  styleUrl: './authentication.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Authentication implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private platformId = inject(PLATFORM_ID);
  private socialAuthService = inject(SocialAuthService);

  /** Google's own button: its script draws it here, out of sight (see onGoogleLogin). */
  private googleHost = viewChild<ElementRef<HTMLElement>>('googleHost');

  // Signals, because the app runs without Zone.js: a plain field written from a
  // subscription does not reach the screen.
  readonly activeForm = signal<'login' | 'register'>('login');
  readonly isLoading = signal(false);
  /**
   * Kept separate from `isLoading`. The email/password submit buttons bind to
   * `isLoading`, and Google's library can emit a restored credential on page load
   * with no user interaction - sharing one flag left both buttons permanently
   * disabled before the user clicked anything.
   */
  readonly isGoogleLoading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly showPassword = signal(false);

  /** The language Google draws its own button in: the interface's when that is Arabic, else its default. */
  readonly googleLocale = isArabic() ? 'ar' : '';

  /** Where authGuard bounced the user from, so login can send them back. */
  private returnUrl = '/calendar';
  /** authState replays, so the same credential must not retrigger a sign-in. */
  private handledGoogleToken: string | null = null;
  private googleAuthSub?: Subscription;

  loginForm!: FormGroup;
  registerForm!: FormGroup;

  ngOnInit(): void {
    const path = this.route.snapshot.routeConfig?.path;
    if (path === 'register') {
      this.activeForm.set('register');
    } else if (path === 'login') {
      this.activeForm.set('login');
    }

    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.registerForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', passwordValidators]
    });

    this.route.queryParams.subscribe(params => {
      if (params['form'] === 'register') {
        this.activeForm.set('register');
      } else if (params['form'] === 'login') {
        this.activeForm.set('login');
      }
      this.returnUrl = params['returnUrl'] || '/calendar';

      // "Get started" on the landing page hands over the address typed there.
      if (params['email']) {
        this.loginForm.patchValue({ email: params['email'] });
        this.registerForm.patchValue({ email: params['email'] });
      }

      if (params['verified']) {
        this.successMessage.set(t('Your email is verified. You can sign in now.'));
      } else if (params['reset']) {
        this.successMessage.set(t('Your password has been reset. You can sign in now.'));
      }
    });

    // Someone who is already signed in has nothing to do here.
    if (this.authService.isLoggedIn()) {
      this.router.navigateByUrl(this.returnUrl, { replaceUrl: true });
      return;
    }

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
    this.activeForm.set(form);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.showPassword.set(false);
    this.loginForm.reset();
    this.registerForm.reset();
  }

  togglePassword(): void {
    this.showPassword.update(shown => !shown);
  }

  forgotPassword(): void {
    this.router.navigate(['/authentication/forgot-password']);
  }

  onLogin(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.authService.login(this.loginForm.value).pipe(
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: () => {
        // A 200 with no usable token would otherwise navigate to a dashboard that
        // 401s on every request. Fail loudly here instead.
        if (!this.authService.isLoggedIn()) {
          this.errorMessage.set(t('Login succeeded but no session token was returned. Please try again.'));
          return;
        }
        this.router.navigateByUrl(this.returnUrl);
      },
      error: (err) => {
        // The account exists but its email was never confirmed. The code can only
        // be entered (or asked for again) on the OTP screen, so an error message
        // here was a dead end: the user could neither sign in nor verify.
        // The check reads the API's own English, whatever language the screen is in.
        if (err?.status === 401 && /not verified/i.test(rawServerAnswer(err))) {
          this.router.navigate(['/authentication/verify-otp'], {
            queryParams: {
              email: this.loginForm.value.email,
              purpose: 'EmailVerification',
              resend: '1'
            }
          });
          return;
        }

        this.errorMessage.set(authError(err, 'Login failed. Please try again.'));
      }
    });
  }

  onRegister(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set('');

    const { fullName, email, password } = this.registerForm.value;

    // The form asks for a name, an address and a password. The time zone is the
    // device's, and is confirmed on "Set up your week"; phone and country are
    // optional and live in Settings.
    this.authService.register({
      fullName, email, password, phoneNumber: '', country: '', timeZone: browserTimeZone()
    }).pipe(
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: () => {
        // Route is 'authentication/verify-otp' — '/verify-otp' matches nothing and
        // used to drop registration into a router error.
        this.router.navigate(['/authentication/verify-otp'], {
          queryParams: { email, purpose: 'EmailVerification' }
        });
      },
      error: (err) => {
        // 502 means the account WAS created but the verification email did not
        // go out. The only place the "Resend code" button exists is the OTP
        // screen, so stranding the user here with a message telling them to use
        // it would be a dead end — send them where the button is.
        if (err?.status === 502) {
          this.router.navigate(['/authentication/verify-otp'], {
            queryParams: { email, purpose: 'EmailVerification', sendFailed: '1' }
          });
          return;
        }
        this.errorMessage.set(authError(err, 'Registration failed. Please try again.'));
      }
    });
  }

  /**
   * "Continue with Google". Only Google's own button can start its sign-in, and that
   * button cannot be styled, so it is kept out of sight and pressed from here. The
   * credential comes back through `authState`, as it always did.
   */
  onGoogleLogin(): void {
    // Explicit user action, so allow a retry of a token that already failed.
    // Passive re-emissions still can't loop, because only this path clears it.
    this.handledGoogleToken = null;

    const button = this.googleHost()?.nativeElement.querySelector<HTMLElement>('div[role="button"]');
    if (!button) {
      this.errorMessage.set(t('Google sign-in is not available right now. Use your email and password instead.'));
      return;
    }
    this.errorMessage.set('');
    button.click();
  }

  private handleGoogleLogin(token: string) {
    // authState replays the last credential to every new subscriber and re-emits
    // when Google restores a session, so the same token can arrive several times.
    if (this.isGoogleLoading() || this.handledGoogleToken === token) return;
    this.handledGoogleToken = token;

    this.isGoogleLoading.set(true);
    this.errorMessage.set('');
    this.authService.googleLogin({ token }).pipe(
      finalize(() => this.isGoogleLoading.set(false))
    ).subscribe({
      next: () => {
        if (!this.authService.isLoggedIn()) {
          this.errorMessage.set(t('Google login succeeded but no session token was returned.'));
          return;
        }
        this.router.navigateByUrl(this.returnUrl);
      },
      error: (err) => {
        this.errorMessage.set(authError(err, 'Google login failed.'));
      }
    });
  }

  isFieldInvalid(form: FormGroup, field: string): boolean {
    const control = form.get(field);
    return !!(control && control.invalid && control.touched);
  }

  /** What is wrong with the password typed on the sign-up form. */
  passwordError(): string {
    return passwordErrorMessage(this.registerForm.get('password')?.errors ?? null);
  }
}
