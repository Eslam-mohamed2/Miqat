import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MiqatLogo } from '../../shared/logo/miqat-logo';

import { Language, currentLanguage, setLanguage, t } from '../../core/i18n/i18n';
import { NumPipe, TPipe } from '../../core/i18n/t.pipe';
import { ThemeService } from '../../core/services/theme.service';
import { browserTimeZone } from '../../core/utils/time-zone';
import { AuthClock } from '../auth-clock/auth-clock';
import { cityOfZone } from '../local-place';

/**
 * The page around every signed-out form (design/miqat-2.0: V2-SignIn): the logo, the
 * sign-up steps and the language switch above the form, the terms line below it, and
 * the side panel.
 *
 *   <app-auth-shell>form</app-auth-shell>                      the clock in the side panel
 *   <app-auth-shell [step]="1">form</app-auth-shell>           with "Account, Verify, Your week"
 *   <app-auth-shell [step]="2" [panelLabel]="'Preview of your week' | t">
 *     form <div authPanel>the screen's own side panel</div>
 *   </app-auth-shell>
 */
@Component({
  selector: 'app-auth-shell',
  standalone: true,
  imports: [RouterLink, AuthClock, MiqatLogo, TPipe, NumPipe],
  templateUrl: './auth-shell.html',
  styleUrl: './auth-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthShell {
  /** Which step of signing up this screen is (0, 1 or 2); null on the screens outside that flow. */
  readonly step = input<number | null>(null);

  /** Names the screen's own side panel (`[authPanel]`); left out, the panel shows the clock. */
  readonly panelLabel = input<string | null>(null);

  readonly steps = [t('Account'), t('Verify@@step'), t('Your week')];
  readonly clockLabel = t('Current time in {city}', { city: cityOfZone(browserTimeZone()) });

  /** The terms line in five pieces: text, "Terms", text, "Privacy Policy", text. */
  readonly legal = t('By continuing you agree to the *Terms* and *Privacy Policy*.').split('*');

  /**
   * The language the switch in the corner leads to. It is here because a visitor
   * picks a language before having an account, and so before Settings.
   */
  readonly other: Language = currentLanguage() === 'ar' ? 'en' : 'ar';

  constructor() {
    // Creating the service applies the saved theme; these screens are outside the
    // app shell, where nothing else asks for it.
    inject(ThemeService);
  }

  /** Saves the choice and reloads the page in the other language. */
  switchLanguage(): void {
    setLanguage(this.other);
  }
}
