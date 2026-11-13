import { ChangeDetectionStrategy, Component } from '@angular/core';

import { TPipe } from '../../../core/i18n/t.pipe';

/**
 * Settings → Sharing and booking. The API has nothing to change here yet: free /
 * busy times are always shared with friends and teammates, never with titles, and
 * there are no booking links. The rows say exactly that.
 */
@Component({
  selector: 'app-settings-sharing',
  standalone: true,
  imports: [TPipe],
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="group">
      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Who can see when you’re free' | t }}</span>
          <span class="line-hint">{{ 'They see free or busy, never event details. For now this is your friends and the people on your projects; it cannot be changed yet.' | t }}</span>
        </span>
        <div class="seg" role="group" [attr.aria-label]="'Who can see when you’re free' | t">
          <button type="button" aria-pressed="false" disabled [title]="'Hiding your free and busy times is not available yet' | t">{{ 'Nobody' | t }}</button>
          <button type="button" aria-pressed="true">{{ 'Friends' | t }}</button>
          <button type="button" aria-pressed="false" disabled [title]="'Sharing by link is not set up yet' | t">{{ 'Anyone with the link' | t }}</button>
        </div>
      </div>

      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Hide event titles from friends' | t }}</span>
          <span class="line-hint">{{ 'Friends see “Busy” instead of the title. Miqat never shares titles, so this is always on.' | t }}</span>
        </span>
        <button type="button" role="switch" class="switch" aria-checked="true" [attr.aria-label]="'Hide event titles from friends' | t"
                disabled [title]="'Miqat never shares event titles; this cannot be switched off' | t"><span></span></button>
      </div>

      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Booking link' | t }}</span>
          <span class="line-hint">{{ 'People pick a time from your free hours' | t }}</span>
        </span>
        <span class="value-wrap">
          <span class="value">{{ 'Not set up yet' | t }}</span>
          <button type="button" class="line-btn" disabled [title]="'Booking links are not set up yet' | t">{{ 'Copy' | t }}</button>
        </span>
      </div>

      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Booking types' | t }}</span>
          <span class="line-hint">{{ 'The kinds of meeting people can book with you' | t }}</span>
        </span>
        <span class="value-wrap">
          <span class="value">{{ 'Not set up yet' | t }}</span>
          <button type="button" class="line-btn" disabled [title]="'Booking types are not set up yet' | t">{{ 'Edit' | t }}</button>
        </span>
      </div>
    </div>
  `
})
export class SharingSection {}
