import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';

/**
 * Catch-all for unmatched URLs. Without a `**` route the router throws
 * "Cannot match any routes", which surfaces as a blank screen and a console error.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="not-found">
      <mat-icon class="not-found__icon">explore_off</mat-icon>
      <h1 class="not-found__code">404</h1>
      <p class="not-found__title">This page doesn't exist</p>
      <p class="not-found__sub">The link may be outdated, or the page may have moved.</p>
      <a class="not-found__action" [routerLink]="homeLink">
        <mat-icon>arrow_back</mat-icon>
        {{ homeLabel }}
      </a>
    </div>
  `,
  styles: [`
    .not-found {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 70vh;
      padding: 32px 16px;
      text-align: center;
    }
    .not-found__icon {
      width: 56px;
      height: 56px;
      font-size: 56px;
      opacity: 0.35;
    }
    .not-found__code {
      margin: 8px 0 0;
      font-size: 56px;
      font-weight: 700;
      line-height: 1;
    }
    .not-found__title {
      margin: 4px 0 0;
      font-size: 18px;
      font-weight: 600;
    }
    .not-found__sub {
      margin: 0;
      opacity: 0.7;
    }
    .not-found__action {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 20px;
      padding: 10px 20px;
      border-radius: 999px;
      background: #2ec4a0;
      color: #06231d;
      font-weight: 600;
      text-decoration: none;
    }
    .not-found__action:hover { filter: brightness(1.08); }
  `]
})
export class NotFound {
  private authService = inject(AuthService);

  get homeLink(): string {
    return this.authService.isLoggedIn() ? '/dashboard' : '/home';
  }

  get homeLabel(): string {
    return this.authService.isLoggedIn() ? 'Back to dashboard' : 'Back to home';
  }
}
