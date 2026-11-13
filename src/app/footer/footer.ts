import { ChangeDetectionStrategy, Component } from '@angular/core';

import { TPipe } from '../core/i18n/t.pipe';
import { MiqatLogo } from '../shared/logo/miqat-logo';

/** The foot of the landing page (design/miqat-2.0: V2-Landing). */
@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [MiqatLogo, TPipe],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Footer {
  readonly year = new Date().getFullYear();
}
