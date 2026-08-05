import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // isLoggedIn() also rejects expired tokens, so a stale session is sent back to
  // the login screen instead of activating the route and 401-ing on every call.
  if (authService.isLoggedIn()) {
    return true;
  }

  return router.createUrlTree(['/authentication'], {
    queryParams: { form: 'login', returnUrl: state.url }
  });
};
