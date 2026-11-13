import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { t } from '../../core/i18n/i18n';

/**
 * The Miqat logo (design/miqat-2.0/logo, brand sheet in pages/V2-Logo.dc.html).
 *
 * The wordmark is "MIQAT" in fine capitals; its Q is a watch dial whose tail is the
 * gold hand. The Q alone is the mark. Both are drawn inline so they follow the theme:
 * the letters take the text colour and only the hand is coloured.
 *
 *   <app-miqat-logo />                              the mark, 28px (the rail)
 *   <app-miqat-logo variant="wordmark" [height]="22" />
 *
 * The same shapes are files in public/logo for places that need an image
 * (the browser tab, an installed app, a share picture).
 *
 * The drawing is the same in every language and is never mirrored: only the name
 * read out for it follows the interface language.
 */
@Component({
  selector: 'app-miqat-logo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (variant() === 'wordmark') {
      <svg [attr.width]="width()" [attr.height]="height()" viewBox="0 0 516 106" fill="none"
           stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"
           role="img" [attr.aria-label]="name">
        <path d="M2.5 97.5V2.5L46 93.5L89.5 2.5V97.5"></path>
        <path d="M140.5 2.5V97.5"></path>
        <circle cx="240" cy="50" r="49.5"></circle>
        <path d="M240 50V23"></path>
        <path class="logo-hand" d="M240 50L291.62 101.62"></path>
        <circle class="logo-pin" cx="240" cy="50" r="5.2"></circle>
        <path d="M328.5 97.5L370 2.5L411.5 97.5M341.39 68H398.61"></path>
        <path d="M434.5 2.5H513.5M474 2.5V97.5"></path>
      </svg>
    } @else {
      <svg [attr.width]="height()" [attr.height]="height()" viewBox="0 0 112 112" fill="none"
           stroke="currentColor" stroke-width="6.5" stroke-linecap="round"
           role="img" [attr.aria-label]="name">
        <circle cx="56" cy="56" r="44"></circle>
        <path d="M56 56V31"></path>
        <path class="logo-hand" d="M56 56L102.67 102.67"></path>
        <circle class="logo-pin" cx="56" cy="56" r="6.83"></circle>
      </svg>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
      color: var(--mq-text);
      line-height: 0;
    }

    .logo-hand { stroke: var(--mq-logo-hand); }
    .logo-pin { fill: var(--mq-logo-hand); stroke: none; }
  `
})
export class MiqatLogo {
  readonly variant = input<'mark' | 'wordmark'>('mark');
  /** Height in pixels. The wordmark is not used under 96px wide (a height of 20). */
  readonly height = input(28);

  /** What a screen reader says for the drawing. */
  protected readonly name = t('Miqat');

  /** The wordmark's drawing is 516 by 106. */
  protected readonly width = computed(() => Math.round(this.height() * 516 / 106));
}
