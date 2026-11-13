import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { inject } from '@angular/core';
import { catchError, map, of } from 'rxjs';

import { AuthService, SessionExpiredError } from '../services/auth.service';

/**
 * Lets a signed-in user into the app.
 *
 * The access token lasts minutes and the refresh token days. Someone who comes back
 * after a break has an expired access token and a good refresh token: that is still
 * a session, so it is renewed here before the page opens. Without this, closing the
 * tab for a quarter of an hour meant signing in again.
 */
export const authGuard: CanActivateFn = (_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    return true;
  }

  const signIn = router.createUrlTree(['/authentication'], {
    queryParams: { form: 'login', returnUrl: state.url }
  });

  // No token at all, or nothing to renew it with: the sign-in screen.
  if (!authService.hasSession()) {
    return signIn;
  }

  return authService.renewSession().pipe(
    map(() => true),
    // A refused refresh token is the end of the session. A server that could not be
    // reached is not: the page opens and its own requests say what is wrong.
    catchError(err => of(err instanceof SessionExpiredError ? signIn : true))
  );
};
