import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, signal
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ThemePreference, ThemeService } from '../../core/services/theme.service';
import { UserService } from '../../core/services/user.service';
import { t } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';

/**
 * The signed-in user's circle at the end of a page header (design/miqat-2.0:
 * "EM", outlined in the accent). Pressing it opens the account menu: profile,
 * settings, theme, help, sign out and, on phones, the sections that have no tab.
 *
 *   <app-user-menu />              36px, as in the calendar and tasks headers
 *   <app-user-menu [size]="44" />  phone headers
 */
@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [RouterLink, TPipe],
  templateUrl: './user-menu.html',
  styleUrl: './user-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--size.px]': 'size()' }
})
export class UserMenu {
  private users = inject(UserService);
  private auth = inject(AuthService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly themes = inject(ThemeService);

  /** Diameter of the circle, in pixels. */
  readonly size = input(36);

  readonly open = signal(false);
  readonly pictureFailed = signal(false);

  readonly user = this.users.currentUser;
  readonly name = computed(() => this.user()?.fullName?.trim() || this.user()?.email || '');
  readonly picture = computed(() => (this.pictureFailed() ? null : this.user()?.profilePictureUrl || null));

  readonly initials = computed(() => {
    const words = this.name().split(/[\s@.]+/).filter(Boolean);
    const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2);
    return letters.toUpperCase() || '··';
  });

  readonly themeChoices: { value: ThemePreference; label: string }[] = [
    { value: 'dark', label: t('Dark') },
    { value: 'light', label: t('Light') },
    { value: 'system', label: t('System') }
  ];

  constructor() {
    // Another part of the page may not have asked for the profile yet.
    if (!this.user()) this.users.getMe().subscribe({ error: () => {} });
  }

  toggle(): void {
    this.open.update(open => !open);
  }

  close(): void {
    this.open.set(false);
  }

  setTheme(choice: ThemePreference): void {
    this.themes.setTheme(choice);
  }

  signOut(): void {
    this.close();
    this.auth.logout().subscribe();
  }

  @HostListener('document:pointerdown', ['$event'])
  onOutside(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
