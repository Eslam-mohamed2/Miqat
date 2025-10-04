import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { FlipClock } from '../flip-clock/flip-clock';
import { Authservice } from '../authservice';

@Component({
  selector: 'app-authentication',
  imports: [CommonModule, ReactiveFormsModule ,FlipClock],
  templateUrl: './authentication.html',
  styleUrl: './authentication.scss'
})
export class Authentication {
  activeForm: 'login' | 'register' = 'login';
  loginForm: FormGroup;
  registerForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });

    this.registerForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    });

    this.route.queryParams.subscribe((params) => {
      const formType = params['form'];
      this.activeForm = formType === 'register' ? 'register' : 'login';
    });
  }

  switchForm(form: 'login' | 'register') {
    this.activeForm = form;
    this.router.navigate(['/auth'], { queryParams: { form } });
  }

  onLogin() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    console.log('✅ Login Data:', this.loginForm.value);
    alert('Login successful! 🚀');
  }

  onRegister() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const { password, confirmPassword } = this.registerForm.value;
    if (password !== confirmPassword) {
      alert('❌ Passwords do not match');
      return;
    }

    console.log('✅ Register Data:', this.registerForm.value);
    alert('Registration successful! 🎉');
  }

  getFieldError(form: FormGroup, field: string): string | null {
    const control = form.get(field);
    if (!control || !control.touched || !control.errors) return null;

    if (control.errors['required']) return 'This field is required';
    if (control.errors['email']) return 'Please enter a valid email';
    if (control.errors['minlength'])
      return `Must be at least ${control.errors['minlength'].requiredLength} characters`;

    return null;
  }
}
