import { Provider, EnvironmentProviders, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { SOCIAL_AUTH_CONFIG, SocialAuthServiceConfig } from '@abacritt/angularx-social-login';

/**
 * What every component spec needs before it can create its component.
 *
 * The app runs without Zone.js (see app.config.ts), so a TestBed that does not ask
 * for zoneless change detection fails with NG0908 before the component is even
 * constructed - which is why the generated "should create" specs all failed. The
 * rest stands in for the app-level providers the components inject: HTTP (answered
 * by the testing backend, so no request leaves the test), the router, animations
 * and the social-login configuration.
 */
export const TEST_PROVIDERS: (Provider | EnvironmentProviders)[] = [
  provideZonelessChangeDetection(),
  provideHttpClient(),
  provideHttpClientTesting(),
  provideRouter([]),
  provideNoopAnimations(),
  {
    provide: SOCIAL_AUTH_CONFIG,
    useValue: { autoLogin: false, providers: [] } as SocialAuthServiceConfig
  }
];
