import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MiqatLogo } from '../shared/logo/miqat-logo';

import { Language, currentLanguage, setLanguage } from '../core/i18n/i18n';
import { TPipe } from '../core/i18n/t.pipe';
import { ThemeService } from '../core/services/theme.service';

/** The top bar of the landing page (design/miqat-2.0: V2-Landing). */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, MiqatLogo, TPipe],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Header {
  /** The language the switch leads to: Arabic from English, English from Arabic. */
  readonly other: Language = currentLanguage() === 'ar' ? 'en' : 'ar';

  constructor() {
    // Creating the service applies the saved theme. The landing page is the first
    // thing a visitor loads, and nothing else on it asks for the service.
    inject(ThemeService);
  }

  /** Saves the choice and reloads the page in the other language. */
  switchLanguage(): void {
    setLanguage(this.other);
  }
}
