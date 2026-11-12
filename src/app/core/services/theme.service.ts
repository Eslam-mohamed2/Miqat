import {
  Inject, Injectable, PLATFORM_ID, Renderer2, RendererFactory2, signal
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'dark' | 'light';
/** What the user picked. 'system' means "follow the OS". */
export type ThemePreference = Theme | 'system';

const THEME_STORAGE_KEY = 'miqat-theme';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private currentTheme: Theme = 'dark';
  private readonly isBrowser: boolean;

  /**
   * The resolved theme and the preference are separate concepts, and the UI needs
   * both: with only the resolved value, "System" could never show as selected —
   * picking it on a dark OS looked identical to picking "Dark".
   *
   * Signals so the settings page re-renders when the OS flips while on 'system'.
   */
  readonly theme = signal<Theme>('dark');
  readonly preference = signal<ThemePreference>('system');

  constructor(
    rendererFactory: RendererFactory2,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.renderer = rendererFactory.createRenderer(null, null);
    this.isBrowser = isPlatformBrowser(platformId);

    // Every branch below touches localStorage / window / document. Guarding here
    // keeps the service constructible on the server, where none of them exist.
    if (!this.isBrowser) return;

    const savedTheme = this.readStoredTheme();
    this.preference.set(savedTheme ?? 'system');
    this.currentTheme = savedTheme ?? (this.prefersLight() ? 'light' : 'dark');

    this.applyTheme(this.currentTheme);
    this.watchSystemTheme();
  }

  private readStoredTheme(): Theme | null {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return saved === 'dark' || saved === 'light' ? saved : null;
    } catch {
      // Private browsing / blocked storage.
      return null;
    }
  }

  private storeTheme(theme: Theme): void {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* non-fatal: the theme still applies for this session */
    }
  }

  private prefersLight(): boolean {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: light)').matches;
  }

  private watchSystemTheme(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    mediaQuery.addEventListener('change', (e) => {
      // Only follow the OS while the user has not chosen a theme explicitly.
      if (this.readStoredTheme()) return;
      this.currentTheme = e.matches ? 'light' : 'dark';
      this.applyTheme(this.currentTheme);
    });
  }

  toggleTheme(): void {
    this.setTheme(this.currentTheme === 'dark' ? 'light' : 'dark');
  }

  /**
   * Only an explicit choice is persisted. Previously every apply - including the
   * automatic one at startup - wrote to storage, so the "no manual override"
   * check in watchSystemTheme() could never pass and the app stopped following
   * the OS theme after its first run. 'system' clears the override.
   */
  setTheme(theme: ThemePreference): void {
    if (theme === 'system') {
      this.clearStoredTheme();
      this.currentTheme = this.prefersLight() ? 'light' : 'dark';
    } else {
      this.currentTheme = theme;
      this.storeTheme(theme);
    }
    this.preference.set(theme);
    this.applyTheme(this.currentTheme);
  }

  private clearStoredTheme(): void {
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      /* non-fatal */
    }
  }

  private applyTheme(theme: Theme): void {
    if (!this.isBrowser) return;

    this.theme.set(theme);

    if (theme === 'light') {
      this.renderer.setAttribute(document.documentElement, 'data-theme', 'light');
      this.renderer.addClass(document.body, 'light-mode');
      this.renderer.removeClass(document.body, 'dark-mode');
    } else {
      this.renderer.removeAttribute(document.documentElement, 'data-theme');
      this.renderer.addClass(document.body, 'dark-mode');
      this.renderer.removeClass(document.body, 'light-mode');
    }
  }

  getTheme(): Theme {
    return this.currentTheme;
  }
}
