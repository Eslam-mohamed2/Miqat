import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private currentTheme: 'dark' | 'light' = 'dark';

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
    
    // Check for saved theme
    const savedTheme = localStorage.getItem('miqat-theme') as 'dark' | 'light';
    
    if (savedTheme) {
      this.currentTheme = savedTheme;
    } else {
      // Default to system preference
      const osPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      this.currentTheme = osPrefersLight ? 'light' : 'dark';
    }

    this.applyTheme(this.currentTheme);
    this.watchSystemTheme();
  }

  private watchSystemTheme(): void {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    
    // Modern way to add listener
    mediaQuery.addEventListener('change', (e) => {
      // Only apply if no manual override is saved
      if (!localStorage.getItem('miqat-theme')) {
        this.currentTheme = e.matches ? 'light' : 'dark';
        this.applyTheme(this.currentTheme);
      }
    });
  }

  toggleTheme(): void {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(this.currentTheme);
  }

  setTheme(theme: 'dark' | 'light' | 'system'): void {
    if (theme === 'system') {
      const osPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      this.currentTheme = osPrefersLight ? 'light' : 'dark';
    } else {
      this.currentTheme = theme;
    }
    this.applyTheme(this.currentTheme);
  }

  private applyTheme(theme: 'dark' | 'light'): void {
    if (theme === 'light') {
      this.renderer.setAttribute(document.documentElement, 'data-theme', 'light');
      this.renderer.addClass(document.body, 'light-mode');
      this.renderer.removeClass(document.body, 'dark-mode');
    } else {
      this.renderer.removeAttribute(document.documentElement, 'data-theme');
      this.renderer.addClass(document.body, 'dark-mode');
      this.renderer.removeClass(document.body, 'light-mode');
    }
    localStorage.setItem('miqat-theme', this.currentTheme);
  }

  getTheme(): 'dark' | 'light' {
    return this.currentTheme;
  }
}
