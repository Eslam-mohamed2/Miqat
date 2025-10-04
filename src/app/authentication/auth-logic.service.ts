import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class AuthLogic {
  activeForm: 'login' | 'register' = 'login';

  constructor(private router: Router) {}

  goToLogin() {
    this.activeForm = 'login';
    this.router.navigate(['/auth'], { queryParams: { form: 'login' } });
  }

  goToRegister() {
    this.activeForm = 'register';
    this.router.navigate(['/auth'], { queryParams: { form: 'register' } });
  }

  setActiveForm(form: 'login' | 'register') {
    this.activeForm = form;
  }

  getActiveForm() {
    return this.activeForm;
  }
}
