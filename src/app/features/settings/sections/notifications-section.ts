import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { DeviceService } from '../../../core/services/device.service';
import { UserService } from '../../../core/services/user.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { locale, t } from '../../../core/i18n/i18n';
import { TPipe } from '../../../core/i18n/t.pipe';
import { DeviceDto, PushKeyDto, UserPreferencesDto } from '../../../models/api.models';
import { SettingsStatus } from '../settings-status';

/**
 * What the "This device" rows can offer:
 * - hidden: the server has no devices API (an older build)
 * - unsupported: this browser cannot receive push
 * - not-configured: the server has no push keys yet
 * - ready: push can be switched on here
 */
type PushState = 'loading' | 'hidden' | 'unsupported' | 'not-configured' | 'ready' | 'error';

type PreferenceKey = keyof UserPreferencesDto;

interface Cell {
  label: string;
  /** The server switch behind this box; null when the channel does not carry this kind. */
  key: PreferenceKey | null;
  reason: string;
}

/** The service worker that shows push notifications; served from the site root. */
const PUSH_WORKER_URL = '/push-sw.js';
/** Remembers which registered device is this browser, so its row can say so. */
const PUSH_DEVICE_KEY = 'miqat-push-device-id';

const TOPICS = [
  { label: t('Mentions'), hint: t('When someone @mentions you') },
  { label: t('Invites'), hint: t('New invites and changes to your events') },
  { label: t('Reminders'), hint: t('Before events and when tasks are due') },
  { label: t('Task updates'), hint: t('On tasks you own or are assigned') },
  { label: t('Friend requests'), hint: '' }
];

/**
 * Settings → Notifications. The server keeps three switches per account
 * (GET / PUT /api/User/me/preferences): live notifications (in the open app and on
 * devices with push), email, and the weekly summary. The design's grid shows them
 * by kind and channel, so every box of a channel moves together.
 */
@Component({
  selector: 'app-settings-notifications',
  standalone: true,
  imports: [TPipe],
  templateUrl: './notifications-section.html',
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationsSection {
  private users = inject(UserService);
  private deviceApi = inject(DeviceService);
  private status = inject(SettingsStatus);

  /** null until loaded (or when the server could not be asked). */
  protected readonly preferences = signal<UserPreferencesDto | null>(null);
  protected readonly preferencesError = signal(false);
  private readonly savingPreference = signal(false);

  protected readonly pushState = signal<PushState>('loading');
  protected readonly devices = signal<DeviceDto[]>([]);
  /** Id of the registered device that is this browser, when it is one of them. */
  protected readonly thisDeviceId = signal<string | null>(null);
  protected readonly enablingPush = signal(false);
  protected readonly removingDeviceId = signal<string | null>(null);
  protected readonly pushError = signal('');
  private pushKey: PushKeyDto | null = null;

  /** Device push needs the server's keys; without them the Phone column has nothing to send to. */
  private readonly phoneReason = computed(() => {
    switch (this.pushState()) {
      case 'ready': case 'unsupported': return '';
      case 'loading': return t('Checking push on this server…');
      default: return t('Push to devices is not set up on this server yet');
    }
  });

  /** The grid: one row per kind of notification, one box per channel. */
  protected readonly matrix = computed(() => {
    const phone = this.phoneReason();
    const live = (label: string): Cell[] => [
      { label: t('{topic} in Miqat', { topic: label }), key: 'pushNotifications', reason: '' },
      { label: t('{topic} by email', { topic: label }), key: 'emailNotifications', reason: '' },
      { label: t('{topic} on your phone', { topic: label }), key: phone ? null : 'pushNotifications', reason: phone }
    ];
    return [
      ...TOPICS.map(topic => ({ ...topic, cells: live(topic.label) })),
      {
        label: t('Weekly recap'), hint: t('Your tasks and activity of the week, once a week'),
        cells: [
          { label: t('{topic} in Miqat', { topic: t('Weekly recap') }), key: null, reason: t('The weekly recap is an email') },
          { label: t('{topic} by email', { topic: t('Weekly recap') }), key: 'weeklySummary' as PreferenceKey, reason: '' },
          { label: t('{topic} on your phone', { topic: t('Weekly recap') }), key: null, reason: t('The weekly recap is an email') }
        ]
      }
    ];
  });

  constructor() {
    this.loadPreferences();
    this.loadPush();
  }

  // ── The three switches ─────────────────────────────────────────────────────

  protected loadPreferences(): void {
    this.preferencesError.set(false);
    this.users.getPreferences().subscribe({
      next: preferences => this.preferences.set(preferences),
      error: () => this.preferencesError.set(true)
    });
  }

  protected isOn(cell: Cell): boolean {
    return !!cell.key && !!this.preferences()?.[cell.key];
  }

  protected isDisabled(cell: Cell): boolean {
    return !cell.key || !this.preferences() || this.savingPreference();
  }

  /** Saves on every box; a failed save puts the boxes back. */
  protected toggle(cell: Cell): void {
    const current = this.preferences();
    if (!cell.key || !current || this.savingPreference()) return;

    const next = { ...current, [cell.key]: !current[cell.key] };
    this.preferences.set(next);
    this.savingPreference.set(true);
    this.status.saving();

    this.users.updatePreferences(next).subscribe({
      next: saved => {
        // Trust the server's answer when it sends one back.
        if (saved && typeof saved.pushNotifications === 'boolean') this.preferences.set(saved);
        this.savingPreference.set(false);
        this.status.saved();
      },
      error: err => {
        this.preferences.set(current);
        this.savingPreference.set(false);
        this.status.failed(apiErrorMessage(err, t('That setting could not be saved.')));
      }
    });
  }

  // ── This device (push) ─────────────────────────────────────────────────────

  private get pushSupported(): boolean {
    return typeof window !== 'undefined'
      && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  protected loadPush(): void {
    this.pushState.set('loading');
    this.pushError.set('');
    this.thisDeviceId.set(this.storedDeviceId());

    this.deviceApi.getPushKey().subscribe({
      next: key => {
        this.pushKey = key;
        this.loadDevices();
        if (!key?.isConfigured || !key.publicKey) this.pushState.set('not-configured');
        else this.pushState.set(this.pushSupported ? 'ready' : 'unsupported');
      },
      // 404: the server has no devices at all (an older build) - show nothing.
      error: err => this.pushState.set(err?.status === 404 ? 'hidden' : 'error')
    });
  }

  private loadDevices(): void {
    this.deviceApi.getMine().subscribe({
      next: devices => {
        this.devices.set(devices);
        // Removed from another browser: this one is no longer registered.
        const mine = this.thisDeviceId();
        if (mine && !devices.some(device => device.id === mine)) this.forgetThisDevice();
      },
      error: () => this.devices.set([])
    });
  }

  /**
   * Asks the browser for permission, subscribes it to the server's push key and
   * registers the subscription. Every step can be refused, so each failure says
   * what happened instead of a blanket "could not enable".
   */
  protected async enablePush(): Promise<void> {
    const key = this.pushKey?.publicKey;
    if (!key || this.enablingPush()) return;

    this.enablingPush.set(true);
    this.pushError.set('');

    let subscription: PushSubscription;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.enablingPush.set(false);
        this.pushError.set(permission === 'denied'
          ? t('Notifications are blocked for this site. Allow them in your browser settings for this site, then try again.')
          : t('Permission was not given, so push stays off on this device.'));
        return;
      }

      const registration = await navigator.serviceWorker.register(PUSH_WORKER_URL);
      await navigator.serviceWorker.ready;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.keyBytes(key)
      });
    } catch {
      this.enablingPush.set(false);
      this.pushError.set(t('Push could not be switched on in this browser.'));
      return;
    }

    const keys = subscription.toJSON().keys ?? {};
    this.deviceApi.register({
      endpoint: subscription.endpoint,
      p256dh: keys['p256dh'] ?? '',
      auth: keys['auth'] ?? '',
      name: this.deviceName()
    }).subscribe({
      next: device => {
        this.rememberThisDevice(device.id);
        this.enablingPush.set(false);
        this.loadDevices();
        this.status.saved();
      },
      error: err => {
        this.enablingPush.set(false);
        this.pushError.set(apiErrorMessage(err, t('This device could not be registered.')));
        // Do not leave the browser subscribed to a server that does not know it.
        subscription.unsubscribe().catch(() => { /* nothing to undo */ });
      }
    });
  }

  protected removeDevice(device: DeviceDto): void {
    if (this.removingDeviceId()) return;
    this.removingDeviceId.set(device.id);
    this.pushError.set('');

    this.deviceApi.remove(device.id).subscribe({
      next: () => {
        this.devices.update(list => list.filter(item => item.id !== device.id));
        this.removingDeviceId.set(null);
        if (device.id === this.thisDeviceId()) {
          this.forgetThisDevice();
          this.unsubscribeHere();
        }
        this.status.saved();
      },
      error: err => {
        this.removingDeviceId.set(null);
        this.pushError.set(apiErrorMessage(err, t('That device could not be removed.')));
      }
    });
  }

  /** "12 Nov 2026, 4:45 PM" in the profile's time zone. */
  protected lastSeen(device: DeviceDto): string {
    const date = new Date(device.lastSeenAt);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale(), {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: this.users.timeZone()
    }).format(date);
  }

  private unsubscribeHere(): void {
    if (!this.pushSupported) return;
    navigator.serviceWorker.getRegistration(PUSH_WORKER_URL)
      .then(registration => registration?.pushManager.getSubscription())
      .then(subscription => subscription?.unsubscribe())
      .catch(() => { /* already gone */ });
  }

  private storedDeviceId(): string | null {
    try { return localStorage.getItem(PUSH_DEVICE_KEY); } catch { return null; }
  }

  private rememberThisDevice(id: string): void {
    this.thisDeviceId.set(id);
    try { localStorage.setItem(PUSH_DEVICE_KEY, id); } catch { /* private mode */ }
  }

  private forgetThisDevice(): void {
    this.thisDeviceId.set(null);
    try { localStorage.removeItem(PUSH_DEVICE_KEY); } catch { /* private mode */ }
  }

  /** "Edge on Windows": a label the user recognises in the device list. */
  private deviceName(): string {
    const agent = navigator.userAgent;
    const browser = agent.includes('Edg/') ? 'Edge'
      : agent.includes('OPR/') ? 'Opera'
      : agent.includes('Firefox/') ? 'Firefox'
      : agent.includes('Chrome/') ? 'Chrome'
      : agent.includes('Safari/') ? 'Safari'
      : 'Browser';
    const system = agent.includes('Windows') ? 'Windows'
      : agent.includes('Android') ? 'Android'
      : /iPhone|iPad|iPod/.test(agent) ? 'iOS'
      : agent.includes('Mac OS X') ? 'macOS'
      : agent.includes('Linux') ? 'Linux'
      : '';
    return system ? `${browser} on ${system}` : browser;
  }

  /** The server key arrives as URL-safe base64; the browser wants its bytes. */
  private keyBytes(key: string): Uint8Array<ArrayBuffer> {
    const padded = (key + '='.repeat((4 - (key.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }
}
