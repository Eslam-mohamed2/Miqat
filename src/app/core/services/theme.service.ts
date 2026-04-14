import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private currentTheme: 'dark' | 'light' = 'dark';

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
    
    const savedTheme = localStorage.getItem('miqat-theme') as 'dark' | 'light';
    
    // Check OS preference if no saved theme
    const osPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;

    this.currentTheme = savedTheme || (osPrefersLight ? 'light' : 'dark');
    this.applyTheme(this.currentTheme);
  }

  toggleTheme(): void {
    this.currentTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(this.currentTheme);
  }

  private applyTheme(theme: 'dark' | 'light'): void {
    if (theme === 'light') {
      this.renderer.setAttribute(document.documentElement, 'data-theme', 'light');
    } else {
      this.renderer.removeAttribute(document.documentElement, 'data-theme');
    }
    localStorage.setItem('miqat-theme', this.currentTheme);
  }

  getTheme(): 'dark' | 'light' {
    return this.currentTheme;
  }
}
