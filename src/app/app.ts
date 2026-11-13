import { Component, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { filter } from 'rxjs/operators';

import { t } from './core/i18n/i18n';
import { Footer } from './footer/footer';
import { Header } from './header/header';

/** True for the landing page, the only page that wears the public header and footer. */
function isLanding(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return path === '' || path === '/' || path.startsWith('/home');
}

@Component({
  selector: 'app-root',
  imports: [Header, Footer, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected title = 'Miqat';

  /**
   * Whether the public header and footer show. Decided from the address the page was
   * opened at, so they are not drawn for a moment on every other page before the
   * first navigation ends.
   */
  readonly showLayout = signal(typeof location === 'undefined' ? true : isLanding(location.pathname));

  constructor(private router: Router, browserTitle: Title) {
    // The browser tab: "Miqat", or the name in Arabic. No page sets a title of its own.
    browserTitle.setTitle(t('Miqat'));

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.showLayout.set(isLanding(event.urlAfterRedirects)));
  }
}
