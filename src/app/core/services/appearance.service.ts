import { Injectable, effect, inject } from '@angular/core';

import { LocalPrefsService } from './local-prefs.service';
import { Theme, ThemeService } from './theme.service';
import { t } from '../i18n/i18n';

/** One accent of design/miqat-2.0 (Settings → Appearance), as drawn on each theme. */
export interface Accent {
  key: string;
  /** In the interface language. */
  label: string;
  dark: string;
  light: string;
}

export const ACCENTS: Accent[] = [
  { key: 'champagne', get label() { return t('Champagne'); }, dark: '#CDAE72', light: '#C9A35F' },
  { key: 'rose', get label() { return t('Rose gold'); }, dark: '#C9A08E', light: '#C08F7C' },
  { key: 'platinum', get label() { return t('Platinum'); }, dark: '#B9C2CC', light: '#8E9BAA' },
  { key: 'jade', get label() { return t('Jade'); }, dark: '#9CC2A8', light: '#6FA488' }
];

/** The accent the theme files hold; choosing it removes the override. */
const DEFAULT_ACCENT = 'champagne';
const MOTION_STYLE_ID = 'mq-reduce-motion';

/**
 * The Appearance choices the API has no field for, kept in this browser and
 * applied to the whole app: the accent colour and "Reduce motion".
 *
 * The accent overrides the two accent custom properties of the theme
 * (src/styles/_theme.scss); every screen draws its accent through them.
 */
@Injectable({ providedIn: 'root' })
export class AppearanceService {
  private prefs = inject(LocalPrefsService);
  private themes = inject(ThemeService);

  readonly accent = this.prefs.value('look.accent', DEFAULT_ACCENT);
  readonly reduceMotion = this.prefs.value('look.reduceMotion', false);

  constructor() {
    effect(() => this.applyAccent(this.accent(), this.themes.theme()));
    effect(() => this.applyMotion(this.reduceMotion()));
  }

  private applyAccent(key: string, theme: Theme): void {
    if (typeof document === 'undefined') return;

    const accent = ACCENTS.find(item => item.key === key);
    // The light theme sets its colours on <body> as well as <html>, so both are overridden.
    for (const element of [document.documentElement, document.body]) {
      if (!accent || accent.key === DEFAULT_ACCENT) {
        element.style.removeProperty('--mq-accent');
        element.style.removeProperty('--mq-accent-text');
        continue;
      }
      const fill = theme === 'light' ? accent.light : accent.dark;
      element.style.setProperty('--mq-accent', fill);
      // As text on the light theme the accent is mixed toward ink, as in _theme.scss.
      element.style.setProperty('--mq-accent-text',
        theme === 'light' ? `color-mix(in srgb, ${fill} 48%, var(--mq-ink))` : fill);
    }
  }

  /** The same rule the global stylesheet applies when the device asks for less motion. */
  private applyMotion(reduce: boolean): void {
    if (typeof document === 'undefined') return;

    const existing = document.getElementById(MOTION_STYLE_ID);
    if (!reduce) {
      existing?.remove();
      return;
    }
    if (existing) return;

    const style = document.createElement('style');
    style.id = MOTION_STYLE_ID;
    style.textContent = '*,*::before,*::after{animation-duration:.01ms!important;' +
      'animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}';
    document.head.appendChild(style);
  }
}
