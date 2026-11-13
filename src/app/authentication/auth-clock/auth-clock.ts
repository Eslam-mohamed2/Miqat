import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';

import { isArabic, locale, num, t } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { hijriFullLabel } from '../../core/utils/hijri';
import { browserTimeZone, zonedParts } from '../../core/utils/time-zone';
import { cityOfZone } from '../local-place';

// The ring that fills as the day passes.
const RADIUS = 146;
const CENTRE = 170;
const RING = 2 * Math.PI * RADIUS;

/**
 * The side panel of the sign-in screens (design/miqat-2.0: V2-SignIn): the time
 * where the visitor is, today's Gregorian and Hijri date, and the motto.
 */
@Component({
  selector: 'app-auth-clock',
  standalone: true,
  imports: [TPipe],
  templateUrl: './auth-clock.html',
  styleUrl: './auth-clock.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthClock {
  readonly zone = browserTimeZone();
  readonly city = cityOfZone(this.zone);
  readonly arabic = isArabic();

  /** "Every moment, in its appointed place.": before the accent word, the word, after it. */
  readonly motto = t('Every moment, in its *appointed* place.').split('*');

  private now = signal(new Date());

  private parts = computed(() => zonedParts(this.now(), this.zone));

  readonly time = computed(() => {
    const { hour, minute } = this.parts();
    return num(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  });

  /** "Cairo · 42s". Zones are offset by whole minutes, so the seconds are the same everywhere. */
  readonly where = computed(() => t('{city} · {seconds}s', {
    city: this.city,
    seconds: num(String(this.now().getUTCSeconds()).padStart(2, '0'))
  }));

  /** "Thursday, 12 November 2026" */
  readonly gregorian = computed(() => {
    const parts = this.formatter(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      ?.formatToParts(this.now()) ?? [];
    const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
    return parts.length
      ? t('{weekday}, {day} {month} {year}', { weekday: part('weekday'), day: part('day'), month: part('month'), year: part('year') })
      : '';
  });

  /** "2 Jumada II 1448 AH"; in Arabic "٢ جمادى الآخرة ١٤٤٨ هـ", which names its era itself. */
  readonly hijri = computed(() => t('{date} AH', { date: hijriFullLabel(this.now(), this.zone) }));

  /** The Hijri date in Arabic under the English one. The Arabic interface already says it in Arabic. */
  readonly hijriArabic = computed(() => (this.arabic
    ? ''
    : this.formatter('ar-EG-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' })?.format(this.now()) ?? ''));

  /** How much of the day has passed: the arc, and the dot at its end. */
  readonly ring = computed(() => {
    const { hour, minute } = this.parts();
    const fraction = (hour * 60 + minute) / 1440;
    const angle = fraction * 2 * Math.PI - Math.PI / 2;
    return {
      dash: `${(fraction * RING).toFixed(1)} ${RING.toFixed(1)}`,
      x: (CENTRE + RADIUS * Math.cos(angle)).toFixed(1),
      y: (CENTRE + RADIUS * Math.sin(angle)).toFixed(1)
    };
  });

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private formatter(language: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat | null {
    try {
      return new Intl.DateTimeFormat(language, { ...options, timeZone: this.zone });
    } catch {
      return null;
    }
  }
}
