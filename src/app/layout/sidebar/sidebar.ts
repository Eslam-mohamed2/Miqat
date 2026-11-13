import { ChangeDetectionStrategy, Component, HostListener, computed, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { InboxCountService } from '../../core/services/inbox-count.service';
import { QuickAddService } from '../../core/services/quick-add.service';
import { ThemeService } from '../../core/services/theme.service';
import { t, tCount } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { MiqatLogo } from '../../shared/logo/miqat-logo';

/**
 * The app's navigation (design/miqat-2.0, "shared shell").
 *
 * Wide screens: a 60px rail at the start edge (the left; the right in Arabic) with the logo, the five sections, and
 * Inbox and Settings at the bottom. Phones: a floating tab bar at the bottom with
 * Day, Week, quick add, Tasks and Inbox; the other sections are in the avatar menu.
 */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MiqatLogo, TPipe],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.focused]': 'focused()' }
})
export class Sidebar {
  /** A focused screen (Find a time, Plan my day) is drawn without the rail; phones keep the tab bar. */
  readonly focused = input(false);

  private inbox = inject(InboxCountService);
  private quickAdd = inject(QuickAddService);
  readonly themes = inject(ThemeService);

  readonly unread = this.inbox.total;

  readonly inboxLabel = computed(() => {
    const count = this.unread();
    return count ? tCount(count, 'Inbox, {n} new', 'Inbox, {n} new') : t('Inbox');
  });

  readonly themeLabel = computed(() => this.themes.theme() === 'dark' ? t('Switch to light mode') : t('Switch to dark mode'));

  toggleTheme(): void {
    this.themes.toggleTheme();
  }

  openQuickAdd(): void {
    this.quickAdd.openPalette();
  }

  /**
   * The "Create" menu of the rail, and where it opens: level with its button, on the
   * page side of the rail. Only the top comes from here; the stylesheet keeps the menu
   * 56px from the rail's own edge (inset-inline-start), so it opens to the right of a
   * rail on the left and to the left of a rail on the right (Arabic).
   */
  readonly createOpen = signal(false);
  readonly createTop = signal(0);

  toggleCreate(event: MouseEvent): void {
    event.stopPropagation();
    this.createTop.set((event.currentTarget as HTMLElement).getBoundingClientRect().top);
    this.createOpen.update(open => !open);
  }

  create(kind: 'event' | 'task' | 'project' | 'palette'): void {
    this.createOpen.set(false);
    if (kind === 'event') this.quickAdd.newEvent();
    else if (kind === 'task') this.quickAdd.newTask();
    else if (kind === 'project') this.quickAdd.newProject();
    else this.quickAdd.openPalette();
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  closeCreate(): void {
    this.createOpen.set(false);
  }
}
