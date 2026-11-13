import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed,
  effect, inject, signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { t } from '../../core/i18n/i18n';
import { TPipe } from '../../core/i18n/t.pipe';
import { UserMenu } from '../../layout/user-menu/user-menu';
import { SettingsStatus } from './settings-status';
import { AccountSection } from './sections/account-section';
import { AppearanceSection } from './sections/appearance-section';
import { BlockedSection } from './sections/blocked-section';
import { CalendarsSection } from './sections/calendars-section';
import { NotificationsSection } from './sections/notifications-section';
import { PlanningSection } from './sections/planning-section';
import { ProfileSection } from './sections/profile-section';
import { SharingSection } from './sections/sharing-section';
import { TimeSection } from './sections/time-section';

export type SettingsSectionKey =
  'profile' | 'account' | 'look' | 'time' | 'plan' | 'cals' | 'notif' | 'share' | 'blocked';

interface SectionInfo {
  key: SettingsSectionKey;
  label: string;
  description: string;
  /** What `?tab=` may say to open it, in lower case. The first one is written to the address. */
  names: string[];
}

interface SectionGroup {
  title: string;
  items: SectionInfo[];
}

/**
 * The sections of design/miqat-2.0 (V2-Settings). The names the app used before
 * the redesign (`?tab=Calendar`, `?tab=Security` ...) still open the section that
 * holds those settings now.
 */
const GROUPS: SectionGroup[] = [
  {
    title: t('You@@settings'),
    items: [
      { key: 'profile', label: t('Profile'), description: t('How you appear to friends and teammates.'), names: ['profile'] },
      { key: 'account', label: t('Account'), description: t('Sign-in and security.'), names: ['account', 'security'] },
      {
        key: 'look', label: t('Appearance'), description: t('Make Miqat feel like yours. Changes apply right away.'),
        names: ['appearance', 'look']
      }
    ]
  },
  {
    title: t('Time'),
    items: [
      {
        key: 'time', label: t('Calendar and time'), description: t('Your week, your hours, and the layers on your calendar.'),
        names: ['calendar', 'time']
      },
      {
        key: 'plan', label: t('Planning and focus'),
        description: t('How Miqat helps you place work. Nothing moves without your approval.'),
        names: ['planning', 'plan', 'focus']
      },
      {
        key: 'cals', label: t('Connected calendars'),
        description: t('Bring events from other calendars next to your Miqat work.'),
        names: ['calendars', 'connected', 'cals']
      }
    ]
  },
  {
    title: t('People'),
    items: [
      {
        key: 'notif', label: t('Notifications'), description: t('Only what needs you, where you want it.'),
        names: ['notifications', 'notif']
      },
      {
        key: 'share', label: t('Sharing and booking'), description: t('Who sees your time, and how people book it.'),
        names: ['sharing', 'share', 'booking']
      },
      {
        key: 'blocked', label: t('Blocked people'),
        description: t('They can’t send you friend requests or messages. They aren’t told.'),
        names: ['blocked']
      }
    ]
  }
];

const SECTIONS = GROUPS.flatMap(group => group.items);

/**
 * Settings (design/miqat-2.0, V2-Settings): the sections on the left, the open one
 * on the right as a card of rows. Nothing has a Save button; the pill beside the
 * title says when a change was kept.
 */
@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    TPipe, UserMenu, ProfileSection, AccountSection, AppearanceSection, TimeSection, PlanningSection,
    CalendarsSection, NotificationsSection, SharingSection, BlockedSection
  ],
  providers: [SettingsStatus],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPage {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private injector = inject(Injector);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected status = inject(SettingsStatus);

  protected readonly groups = GROUPS;
  protected readonly active = signal<SettingsSectionKey>('profile');
  protected readonly section = computed(() => SECTIONS.find(item => item.key === this.active())!);

  protected readonly savedLabel = computed(() => {
    switch (this.status.state()) {
      case 'saving': return t('Saving…');
      case 'saved': return t('Saved');
      case 'failed': return t('Not saved');
      default: return t('Changes save automatically');
    }
  });

  constructor() {
    // ?tab=Calendar opens a section directly, so other screens can link to it.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(params => {
        const wanted = (params.get('tab') ?? '').toLowerCase();
        const match = SECTIONS.find(item => item.names.includes(wanted));
        const next = match?.key ?? 'profile';
        if (next !== this.active()) this.status.reset();
        this.active.set(next);
      });

    // On a phone the sections are one scrolling row. One opened by link (or the
    // last in the row) would otherwise be selected but out of sight.
    effect(() => {
      this.active();
      afterNextRender(() => {
        this.host.nativeElement.querySelector('.nav-item[aria-current="page"]')
          ?.scrollIntoView({ block: 'nearest', inline: 'center' });
      }, { injector: this.injector });
    });
  }

  /** Kept in the address, so the section survives a reload and can be linked to. */
  protected open(section: SectionInfo): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: section.key === 'profile' ? null : section.names[0] },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }
}
