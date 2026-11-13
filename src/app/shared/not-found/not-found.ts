import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { t } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';

/**
 * Catch-all for unmatched URLs. Without a `**` route the router throws
 * "Cannot match any routes", which surfaces as a blank screen and a console error.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, TPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="not-found">
      <svg class="not-found__mark" width="44" height="44" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="15" stroke="currentColor" stroke-width="1.2"></circle>
        <circle cx="16" cy="16" r="10.5" stroke="currentColor" stroke-opacity="0.35" stroke-width="1"></circle>
        <path d="M16 8.5V16l5 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
      </svg>
      <p class="not-found__code">{{ 'Page not found · {n}' | t: { n: 404 } }}</p>
      <h1 class="not-found__title">{{ 'This page doesn’t exist' | t }}</h1>
      <p class="not-found__sub">{{ 'The link may be outdated, or the page may have moved.' | t }}</p>
      <a class="not-found__action" [routerLink]="homeLink">{{ homeLabel }}</a>
    </main>
  `,
  styleUrl: './not-found.scss'
})
export class NotFound {
  private authService = inject(AuthService);

  get homeLink(): string {
    return this.authService.isLoggedIn() ? '/calendar' : '/home';
  }

  get homeLabel(): string {
    return this.authService.isLoggedIn() ? t('Back to your calendar') : t('Back to home');
  }
}
