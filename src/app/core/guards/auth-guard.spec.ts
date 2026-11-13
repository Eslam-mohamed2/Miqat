import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable, firstValueFrom, isObservable, of, throwError } from 'rxjs';

import { AuthService, SessionExpiredError } from '../services/auth.service';
import { authGuard } from './auth-guard';

describe('authGuard', () => {
  let auth: jasmine.SpyObj<AuthService>;

  const run = async (): Promise<boolean | UrlTree> => {
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/tasks' } as RouterStateSnapshot));
    return isObservable(result) ? firstValueFrom(result as Observable<boolean | UrlTree>) : (result as boolean | UrlTree);
  };

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['isLoggedIn', 'hasSession', 'renewSession']);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: { createUrlTree: (commands: unknown[], extras: unknown) => ({ commands, extras }) } }
      ]
    });
  });

  it('lets a signed-in user in without asking the server', async () => {
    auth.isLoggedIn.and.returnValue(true);

    expect(await run()).toBeTrue();
    expect(auth.renewSession).not.toHaveBeenCalled();
  });

  it('sends someone with no session to the sign-in screen, remembering the page', async () => {
    auth.isLoggedIn.and.returnValue(false);
    auth.hasSession.and.returnValue(false);

    expect(await run()).toEqual(jasmine.objectContaining({
      commands: ['/authentication'],
      extras: { queryParams: { form: 'login', returnUrl: '/tasks' } }
    }) as unknown as UrlTree);
    expect(auth.renewSession).not.toHaveBeenCalled();
  });

  it('renews the session of someone who comes back after a break, then lets them in', async () => {
    auth.isLoggedIn.and.returnValue(false);
    auth.hasSession.and.returnValue(true);
    auth.renewSession.and.returnValue(of('new-token'));

    expect(await run()).toBeTrue();
  });

  it('sends them to sign in when the refresh token is refused', async () => {
    auth.isLoggedIn.and.returnValue(false);
    auth.hasSession.and.returnValue(true);
    auth.renewSession.and.returnValue(throwError(() => new SessionExpiredError()));

    expect(await run()).toEqual(jasmine.objectContaining({ commands: ['/authentication'] }) as unknown as UrlTree);
  });

  it('opens the page when the server cannot be reached: that is not the end of a session', async () => {
    auth.isLoggedIn.and.returnValue(false);
    auth.hasSession.and.returnValue(true);
    auth.renewSession.and.returnValue(throwError(() => new Error('offline')));

    expect(await run()).toBeTrue();
  });
});
