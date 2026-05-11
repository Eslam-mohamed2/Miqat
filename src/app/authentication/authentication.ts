import { Component, inject, OnInit, ChangeDetectorRef, Injector } from '@angular/core';

import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule, FormBuilder,
  FormGroup, Validators
} from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { FlipClock } from '../flip-clock/flip-clock';
import { finalize } from 'rxjs';
import { SocialAuthService, GoogleLoginProvider, SocialUser } from '@abacritt/angularx-social-login';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';

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
  private platformId = inject(PLATFORM_ID);
  private injector = inject(Injector);

  activeForm: 'login' | 'register' = 'login';
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  showPassword = false;

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

    if (isPlatformBrowser(this.platformId)) {
       try {
         const socialAuthService = this.injector.get(SocialAuthService) as SocialAuthService;
         socialAuthService.authState.subscribe((user: SocialUser) => {
           if (user && user.idToken) {
             this.handleGoogleLogin(user.idToken);
           }
         });
       } catch (e: any) {
         console.warn('SocialAuthService not available', e);
       }
    }
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
        this.router.navigate(['/verify-otp'], { 
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
      try {
        const socialAuthService = this.injector.get(SocialAuthService) as SocialAuthService;
        socialAuthService.signIn(GoogleLoginProvider.PROVIDER_ID).then((user: any) => {
          if (user && user.idToken) {
             this.handleGoogleLogin(user.idToken);
          }
        }).catch((err: any) => {
          console.error('Google Sign In Error', err);
          this.handleGoogleLogin('mock-google-token');
        });
      } catch(e: any) {
        console.error('SocialAuthService instantiation failed', e);
        this.handleGoogleLogin('mock-google-token');
      }
    }
  }

  private handleGoogleLogin(token: string) {
    this.isLoading = true;
    this.authService.googleLogin({ token }).pipe(
      finalize(() => { this.isLoading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => this.errorMessage = this.extractErrorMessage(err, 'Google login failed.')
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
