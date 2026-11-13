import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { CalendarDataService } from '../../../core/services/calendar-data.service';
import { CalendarService } from '../../../core/services/calendar.service';
import { ThemePreference, ThemeService } from '../../../core/services/theme.service';
import { UserService } from '../../../core/services/user.service';
import {
  Language, Numerals, currentLanguage, locale, savedNumerals, setLanguage, setNumerals, t, tCount
} from '../../../core/i18n/i18n';
import { TPipe } from '../../../core/i18n/t.pipe';
import { formatTimeInZone } from '../../../core/utils/time-zone';
import { CalendarItemDto } from '../../../models/api.models';
import { ACCENTS, AppearanceService } from '../../../core/services/appearance.service';
import { SettingsStatus } from '../settings-status';

const DAY_MS = 86_400_000;

/**
 * Settings → Appearance: theme (ThemeService), accent and "Reduce motion"
 * (AppearanceService, kept in this browser), the interface language and the digit
 * style (core/i18n, kept in this browser; changing the language reloads the page).
 * Density is drawn as designed but cannot be changed yet.
 */
@Component({
  selector: 'app-settings-appearance',
  standalone: true,
  imports: [TPipe],
  templateUrl: './appearance-section.html',
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppearanceSection {
  protected themes = inject(ThemeService);
  protected look = inject(AppearanceService);
  private status = inject(SettingsStatus);
  private users = inject(UserService);
  private calendarData = inject(CalendarDataService);

  protected readonly themeChoices: { value: ThemePreference; label: string }[] = [
    { value: 'dark', label: t('Dark') },
    { value: 'light', label: t('Light') },
    { value: 'system', label: t('System') }
  ];

  /** The interface language. It cannot change while the page is open: choosing the other one reloads. */
  protected readonly language: Language = currentLanguage();
  /** 123 or ١٢٣. Kept even while the interface is English, where it has no effect. */
  protected readonly numerals = signal<Numerals>(savedNumerals());

  /** Each accent as it is drawn on the theme in use. */
  protected readonly swatches = computed(() => ACCENTS.map(accent => ({
    key: accent.key,
    label: accent.label,
    color: this.themes.theme() === 'light' ? accent.light : accent.dark
  })));

  /** The user's next event, so the preview shows something of their own. */
  private readonly next = signal<CalendarItemDto | null>(null);

  protected readonly preview = computed(() => {
    const zone = this.users.timeZone();
    const hour24 = this.calendarData.use24HourClock();
    const event = this.next();
    if (!event) {
      return {
        clock: formatTimeInZone(new Date(), zone, hour24),
        title: t('Nothing coming up'),
        sub: t('Your next event will look like this'),
        join: false
      };
    }

    const start = new Date(event.start);
    const minutes = Math.max(0, Math.round((start.getTime() - Date.now()) / 60_000));
    const when = minutes < 60 ? t('In {n} min', { n: minutes })
      : minutes < 1440 ? t('In {n} h', { n: Math.round(minutes / 60) })
      : start.toLocaleDateString(locale(), { weekday: 'long', timeZone: zone });
    const people = event.attendeeCount > 0 ? tCount(event.attendeeCount + 1, '{n} person', '{n} people') : '';
    return {
      clock: formatTimeInZone(start, zone, hour24), title: event.title, sub: people ? `${when} · ${people}` : when, join: true
    };
  });

  constructor() {
    const now = new Date();
    inject(CalendarService).getFeed(now, new Date(now.getTime() + 7 * DAY_MS), false).subscribe({
      next: items => this.next.set(items
        .filter(item => item.kind === 'Event' && !item.isAllDay && new Date(item.start).getTime() > now.getTime())
        .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null),
      error: () => { /* the preview then says there is nothing coming up */ }
    });
  }

  protected setTheme(choice: ThemePreference): void {
    this.themes.setTheme(choice);
    this.status.saved();
  }

  protected setAccent(key: string): void {
    this.look.accent.set(key);
    this.status.saved();
  }

  protected setLanguage(next: Language): void {
    setLanguage(next);
  }

  protected setNumerals(next: Numerals): void {
    if (next === this.numerals()) return;
    this.numerals.set(next);
    setNumerals(next);
    this.status.saved();
  }

  protected toggleMotion(): void {
    this.look.reduceMotion.update(on => !on);
    this.status.saved();
  }
}
