import {
  Component, ChangeDetectionStrategy, DestroyRef, ElementRef, Injector, afterNextRender,
  computed, effect, inject, signal, untracked
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ThemeService, ThemePreference } from '../../core/services/theme.service';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { DeviceService } from '../../core/services/device.service';
import { CalendarService } from '../../core/services/calendar.service';
import { CalendarDataService } from '../../core/services/calendar-data.service';
import {
  CalendarSettingsDto, CalendarViewName, DayOfWeekName, DeviceDto, PushKeyDto,
  UpdateProfileDto, UserPreferencesDto
} from '../../models/api.models';
import { REMINDER_PRESETS, durationLabel, reminderLabel } from '../../core/utils/reminder-label';
import { apiErrorMessage } from '../../core/http/api-error';
import {
  passwordErrorMessage, passwordValidators, passwordsMatchValidator
} from '../../core/validators/password.validators';

type SettingsTab = 'Profile' | 'Appearance' | 'Notifications' | 'Calendar' | 'Security';

/** Where the email change stands: not started, asking for the address, or waiting for the code. */
type EmailStep = 'idle' | 'request' | 'confirm';

/**
 * What the "This device" block can offer:
 * - hidden: the server has no devices API (an older build)
 * - unsupported: this browser cannot receive push
 * - not-configured: the server has no push keys yet
 * - ready: push can be switched on here
 */
type PushState = 'loading' | 'hidden' | 'unsupported' | 'not-configured' | 'ready' | 'error';

type CalendarSettingsState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

const DAYS: DayOfWeekName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EVENT_LENGTHS = [15, 30, 45, 60, 90, 120];
const CODE_LENGTH = 6;

/** The service worker that shows push notifications; served from the site root. */
const PUSH_WORKER_URL = '/push-sw.js';
/** Remembers which registered device is this browser, so its row can say so. */
const PUSH_DEVICE_KEY = 'miqat-push-device-id';

/** Matches the API's limit for the profile's "about me" text. */
const BIO_MAX_LENGTH = 500;

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule, ReactiveFormsModule],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPage {
  public themeService = inject(ThemeService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private deviceService = inject(DeviceService);
  private calendarService = inject(CalendarService);
  private calendarData = inject(CalendarDataService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private injector = inject(Injector);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  activeTab = signal<SettingsTab>('Profile');

  /**
   * Workspace, Team, Integrations and Billing were listed here but had no markup
   * at all — selecting any of them rendered a blank page. None has a backing API
   * either, so they are gone rather than left as dead ends.
   */
  readonly tabs: { name: SettingsTab; icon: string }[] = [
    { name: 'Profile', icon: 'person' },
    { name: 'Appearance', icon: 'palette' },
    // Back now that the API stores these per account (GET/PUT /api/User/me/preferences).
    // The old toggles lived only in the page's memory and reset on every visit.
    { name: 'Notifications', icon: 'notifications' },
    { name: 'Calendar', icon: 'calendar_month' },
    { name: 'Security', icon: 'security' }
  ];

  readonly bioMaxLength = BIO_MAX_LENGTH;

  readonly genders = ['Male', 'Female'];

  /**
   * From the browser's own ICU data when available, so the list matches what the
   * platform can actually resolve. The fallback covers older browsers.
   */
  readonly timeZones: string[] = this.loadTimeZones();

  profileForm!: FormGroup;
  passwordForm!: FormGroup;
  emailForm!: FormGroup;

  // ── Email change (Security) ────────────────────────────────────────────────
  emailStep = signal<EmailStep>('idle');
  /** The address the code was sent to, shown on the second step. */
  pendingEmail = signal('');
  emailCode = signal('');
  emailError = signal<string | null>(null);
  isRequestingEmail = signal(false);
  isConfirmingEmail = signal(false);
  showEmailPassword = signal(false);
  readonly codeLength = CODE_LENGTH;

  // ── This device (Notifications) ────────────────────────────────────────────
  pushState = signal<PushState>('loading');
  devices = signal<DeviceDto[]>([]);
  /** Id of the registered device that is this browser, when it is one of them. */
  thisDeviceId = signal<string | null>(null);
  isEnablingPush = signal(false);
  removingDeviceId = signal<string | null>(null);
  pushError = signal<string | null>(null);
  private pushKey: PushKeyDto | null = null;
  private pushLoaded = false;

  // ── Calendar preferences ───────────────────────────────────────────────────
  calendarState = signal<CalendarSettingsState>('idle');
  /** The values on the form; saved as a whole by "Save calendar settings". */
  calendarDraft = signal<CalendarSettingsDto | null>(null);
  /** What the server holds, to tell whether the form has unsaved changes. */
  private calendarSaved = signal<CalendarSettingsDto | null>(null);
  isSavingCalendar = signal(false);

  readonly views: CalendarViewName[] = ['Month', 'Week', 'Day', 'Agenda'];
  readonly allDays = DAYS;

  /** The seven days, starting on the day the week starts on. */
  readonly orderedDays = computed<DayOfWeekName[]>(() => {
    const start = Math.max(0, DAYS.indexOf(this.calendarDraft()?.weekStartsOn ?? 'Sunday'));
    return [...DAYS.slice(start), ...DAYS.slice(0, start)];
  });

  /** The usual lengths, plus the stored one when it is not among them. */
  readonly eventLengths = computed(() => {
    const stored = this.calendarDraft()?.defaultEventMinutes;
    const values = stored && !EVENT_LENGTHS.includes(stored) ? [...EVENT_LENGTHS, stored] : EVENT_LENGTHS;
    return [...values].sort((a, b) => a - b).map(minutes => ({ minutes, label: durationLabel(minutes) }));
  });

  /** The usual reminders, plus the stored one when it is not among them. */
  readonly reminderChoices = computed(() => {
    const stored = this.calendarDraft()?.defaultReminderMinutes;
    const values = stored != null && !REMINDER_PRESETS.includes(stored)
      ? [...REMINDER_PRESETS, stored]
      : [...REMINDER_PRESETS];
    return values.sort((a, b) => a - b).map(minutes => ({ minutes, label: reminderLabel(minutes) }));
  });

  /** Set while the working day would end before it starts. */
  readonly workHoursError = computed(() => {
    const draft = this.calendarDraft();
    if (!draft) return null;
    if (!draft.workDayStart || !draft.workDayEnd) return 'Set both a start and an end time.';
    return draft.workDayStart < draft.workDayEnd ? null : 'The working day must end after it starts.';
  });

  readonly calendarDirty = computed(() =>
    JSON.stringify(this.calendarDraft()) !== JSON.stringify(this.calendarSaved()));

  /**
   * The shared copy, so an avatar changed here (or anywhere) is reflected
   * everywhere the moment it lands. The form still reads its values from the
   * fetch below — this is only the display source.
   */
  readonly user = this.userService.currentUser;

  isLoading = signal(true);
  isSaving = signal(false);
  isChangingPassword = signal(false);
  isUploading = signal(false);
  isRemovingPicture = signal(false);

  /** null until loaded (or when the server could not be asked). */
  preferences = signal<UserPreferencesDto | null>(null);
  preferencesError = signal(false);
  /** The preference being saved right now, so its switch can show it. */
  savingPreference = signal<keyof UserPreferencesDto | null>(null);

  toastMessage = signal('');
  toastError = signal(false);
  showToastState = signal(false);

  showCurrentPassword = signal(false);
  showNewPassword = signal(false);
  showConfirmPassword = signal(false);

  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Every field here maps to something UpdateProfileDto actually accepts. The
    // form previously exposed only first/last name plus a bio the API has no
    // column for, so phone, country, timezone, gender and date of birth were
    // unreachable from the UI even though the endpoint supported them.
    this.profileForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: [''],
      email: [{ value: '', disabled: true }],
      phoneNumber: ['', Validators.maxLength(20)],
      country: [''],
      timeZone: [''],
      gender: [''],
      dateOfBirth: [''],
      bio: ['', Validators.maxLength(BIO_MAX_LENGTH)]
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      // Was minLength(8) only, so passwords missing an uppercase/number/special
      // character passed here and were rejected by the API.
      newPassword: ['', passwordValidators],
      confirmPassword: ['', Validators.required]
    }, { validators: passwordsMatchValidator('newPassword', 'confirmPassword') });

    this.emailForm = this.fb.group({
      newEmail: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
      currentPassword: ['', Validators.required]
    });

    // ?tab=Calendar opens a section directly, so other screens can link to it.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const wanted = (params.get('tab') ?? '').toLowerCase();
        const match = this.tabs.find(tab => tab.name.toLowerCase() === wanted);
        if (match) this.activeTab.set(match.name);
      });

    // The device list and the calendar preferences are fetched when their tab is
    // first opened, not on every visit to Settings.
    effect(() => {
      const tab = this.activeTab();
      untracked(() => {
        if (tab === 'Notifications' && !this.pushLoaded) this.loadPush();
        if (tab === 'Calendar' && this.calendarState() === 'idle') this.loadCalendarSettings();
      });
    });

    // On a phone the tabs are one scrolling row. A tab opened by link (or the last
    // one in the row) would otherwise be selected but out of sight.
    effect(() => {
      this.activeTab();
      afterNextRender(() => {
        this.host.nativeElement.querySelector('.sidebar-item.active')
          ?.scrollIntoView({ block: 'nearest', inline: 'center' });
      }, { injector: this.injector });
    });

    this.loadProfile();
    this.loadPreferences();
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  loadProfile() {
    this.isLoading.set(true);
    this.userService.getMe().subscribe({
      next: data => {
        const [firstName = '', ...rest] = (data.fullName ?? '').trim().split(' ');

        this.profileForm.reset({
          firstName,
          lastName: rest.join(' '),
          email: data.email ?? '',
          phoneNumber: data.phoneNumber ?? '',
          country: data.country ?? '',
          timeZone: data.timeZone ?? '',
          gender: data.gender ?? '',
          // <input type="date"> only accepts yyyy-MM-dd.
          dateOfBirth: this.toDateInput(data.dateOfBirth),
          bio: data.bio ?? ''
        });

        this.isLoading.set(false);
      },
      error: err => {
        this.isLoading.set(false);
        this.showToast(apiErrorMessage(err, 'Failed to load your profile.'), true);
      }
    });
  }

  saveProfile() {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const value = this.profileForm.getRawValue();

    const body: UpdateProfileDto = {
      fullName: `${value.firstName} ${value.lastName}`.trim(),
      // Empty inputs are sent as null, not '', so clearing a field actually
      // clears it server-side instead of storing a blank string.
      phoneNumber: this.orNull(value.phoneNumber),
      country: this.orNull(value.country),
      timeZone: this.orNull(value.timeZone),
      gender: this.orNull(value.gender),
      dateOfBirth: value.dateOfBirth ? new Date(value.dateOfBirth).toISOString() : null,
      bio: this.orNull(value.bio)
    };

    this.userService.updateMe(body).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.showToast('Profile updated');
        this.loadProfile();
      },
      error: err => {
        this.isSaving.set(false);
        this.showToast(apiErrorMessage(err, 'Failed to update your profile.'), true);
      }
    });
  }

  uploadImage(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.showToast('Image must be smaller than 5MB.', true);
      input.value = '';
      return;
    }

    this.isUploading.set(true);
    this.userService.uploadProfileImage(file).subscribe({
      next: () => {
        this.isUploading.set(false);
        // The service has already published the new URL to `currentUser`, so
        // there is nothing to re-fetch — every avatar in the app has updated.
        this.showToast('Profile picture updated across the app');
      },
      error: err => {
        this.isUploading.set(false);
        // Surfaces the server's reason — e.g. the 503 when image storage is not
        // configured — rather than a blanket "upload failed".
        this.showToast(apiErrorMessage(err, 'Failed to upload that image.'), true);
      }
    });

    // Lets the same file be picked again after a failure.
    input.value = '';
  }

  removePicture() {
    if (this.isRemovingPicture() || !this.user()?.profilePictureUrl) return;

    this.isRemovingPicture.set(true);
    this.userService.removeProfileImage().subscribe({
      next: () => {
        this.isRemovingPicture.set(false);
        this.showToast('Profile picture removed');
      },
      error: err => {
        this.isRemovingPicture.set(false);
        this.showToast(apiErrorMessage(err, 'Failed to remove your picture.'), true);
      }
    });
  }

  bioLength(): number {
    return (this.profileForm.get('bio')?.value ?? '').length;
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  loadPreferences() {
    this.preferencesError.set(false);
    this.userService.getPreferences().subscribe({
      next: preferences => this.preferences.set(preferences),
      error: () => this.preferencesError.set(true)
    });
  }

  /** Saves on every switch; a failed save puts the switch back. */
  togglePreference(key: keyof UserPreferencesDto) {
    const current = this.preferences();
    if (!current || this.savingPreference()) return;

    const next = { ...current, [key]: !current[key] };
    this.preferences.set(next);
    this.savingPreference.set(key);

    this.userService.updatePreferences(next).subscribe({
      next: saved => {
        // Trust the server's answer when it sends one back.
        if (saved && typeof saved.pushNotifications === 'boolean') this.preferences.set(saved);
        this.savingPreference.set(null);
        this.showToast('Notification settings saved');
      },
      error: err => {
        this.preferences.set(current);
        this.savingPreference.set(null);
        this.showToast(apiErrorMessage(err, 'Could not save that setting.'), true);
      }
    });
  }

  // ── This device (push) ─────────────────────────────────────────────────────

  private get pushSupported(): boolean {
    return typeof window !== 'undefined'
      && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  loadPush() {
    this.pushLoaded = true;
    this.pushState.set('loading');
    this.pushError.set(null);
    this.thisDeviceId.set(this.storedDeviceId());

    this.deviceService.getPushKey().subscribe({
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

  private loadDevices() {
    this.deviceService.getMine().subscribe({
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
  async enablePush() {
    const key = this.pushKey?.publicKey;
    if (!key || this.isEnablingPush()) return;

    this.isEnablingPush.set(true);
    this.pushError.set(null);

    let subscription: PushSubscription;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.isEnablingPush.set(false);
        this.pushError.set(permission === 'denied'
          ? 'Notifications are blocked for this site. Allow them in your browser settings for this site, then try again.'
          : 'Permission was not given, so push stays off on this device.');
        return;
      }

      const registration = await navigator.serviceWorker.register(PUSH_WORKER_URL);
      await navigator.serviceWorker.ready;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.keyBytes(key)
      });
    } catch {
      this.isEnablingPush.set(false);
      this.pushError.set('Push could not be switched on in this browser.');
      return;
    }

    const keys = subscription.toJSON().keys ?? {};
    this.deviceService.register({
      endpoint: subscription.endpoint,
      p256dh: keys['p256dh'] ?? '',
      auth: keys['auth'] ?? '',
      name: this.deviceName()
    }).subscribe({
      next: device => {
        this.rememberThisDevice(device.id);
        this.isEnablingPush.set(false);
        this.loadDevices();
        this.showToast('Push notifications are on for this device');
      },
      error: err => {
        this.isEnablingPush.set(false);
        this.pushError.set(apiErrorMessage(err, 'This device could not be registered.'));
        // Do not leave the browser subscribed to a server that does not know it.
        subscription.unsubscribe().catch(() => { /* nothing to undo */ });
      }
    });
  }

  removeDevice(device: DeviceDto) {
    if (this.removingDeviceId()) return;
    this.removingDeviceId.set(device.id);
    this.pushError.set(null);

    this.deviceService.remove(device.id).subscribe({
      next: () => {
        this.devices.update(list => list.filter(item => item.id !== device.id));
        this.removingDeviceId.set(null);
        if (device.id === this.thisDeviceId()) {
          this.forgetThisDevice();
          this.unsubscribeHere();
        }
        this.showToast('Device removed');
      },
      error: err => {
        this.removingDeviceId.set(null);
        this.pushError.set(apiErrorMessage(err, 'That device could not be removed.'));
      }
    });
  }

  /** "12 Nov 2026, 4:45 PM" in the profile's time zone. */
  lastSeen(device: DeviceDto): string {
    const date = new Date(device.lastSeenAt);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: this.userService.timeZone()
    }).format(date);
  }

  trackByDeviceId = (_: number, device: DeviceDto) => device.id;

  private unsubscribeHere() {
    if (!this.pushSupported) return;
    navigator.serviceWorker.getRegistration(PUSH_WORKER_URL)
      .then(registration => registration?.pushManager.getSubscription())
      .then(subscription => subscription?.unsubscribe())
      .catch(() => { /* already gone */ });
  }

  private storedDeviceId(): string | null {
    try { return localStorage.getItem(PUSH_DEVICE_KEY); } catch { return null; }
  }

  private rememberThisDevice(id: string) {
    this.thisDeviceId.set(id);
    try { localStorage.setItem(PUSH_DEVICE_KEY, id); } catch { /* private mode */ }
  }

  private forgetThisDevice() {
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

  // ── Calendar preferences ───────────────────────────────────────────────────

  loadCalendarSettings() {
    this.calendarState.set('loading');
    this.calendarService.getSettings().subscribe({
      next: settings => {
        const clean = this.cleanSettings(settings);
        this.calendarDraft.set(clean);
        this.calendarSaved.set(clean);
        this.calendarState.set('ready');
      },
      // 404: the server has no calendar settings (an older build).
      error: err => this.calendarState.set(err?.status === 404 ? 'unavailable' : 'error')
    });
  }

  patchCalendar(changes: Partial<CalendarSettingsDto>) {
    this.calendarDraft.update(draft => draft ? { ...draft, ...changes } : draft);
  }

  /** The reminder select holds '' for "no reminder"; the API wants null. */
  setDefaultReminder(value: string) {
    this.patchCalendar({ defaultReminderMinutes: value === '' ? null : Number(value) });
  }

  isWorkDay(day: DayOfWeekName): boolean {
    return this.calendarDraft()?.workDays.includes(day) ?? false;
  }

  toggleWorkDay(day: DayOfWeekName) {
    const draft = this.calendarDraft();
    if (!draft) return;
    const days = draft.workDays.includes(day)
      ? draft.workDays.filter(item => item !== day)
      : [...draft.workDays, day];
    // Kept in calendar order, whatever order they were clicked in.
    this.patchCalendar({ workDays: DAYS.filter(item => days.includes(item)) });
  }

  resetCalendar() {
    this.calendarDraft.set(this.calendarSaved());
  }

  saveCalendar() {
    const draft = this.calendarDraft();
    if (!draft || this.isSavingCalendar() || this.workHoursError()) return;

    this.isSavingCalendar.set(true);
    this.calendarService.saveSettings(draft).subscribe({
      next: saved => {
        // Trust the server's copy when it sends one back.
        const clean = this.cleanSettings(saved?.weekStartsOn ? saved : draft);
        this.calendarDraft.set(clean);
        this.calendarSaved.set(clean);
        // The calendar screen reads this, so it follows without a reload.
        this.calendarData.settings.set(clean);
        this.isSavingCalendar.set(false);
        this.showToast('Calendar settings saved');
      },
      error: err => {
        this.isSavingCalendar.set(false);
        this.showToast(apiErrorMessage(err, 'Could not save your calendar settings.'), true);
      }
    });
  }

  /** Time inputs want "HH:mm" exactly, and the form never holds a missing list. */
  private cleanSettings(settings: CalendarSettingsDto): CalendarSettingsDto {
    return {
      ...settings,
      workDayStart: (settings.workDayStart ?? '09:00').slice(0, 5),
      workDayEnd: (settings.workDayEnd ?? '17:00').slice(0, 5),
      workDays: settings.workDays ?? [],
      defaultReminderMinutes: settings.defaultReminderMinutes ?? null
    };
  }

  // ── Email address ──────────────────────────────────────────────────────────

  startEmailChange() {
    this.emailForm.reset({ newEmail: '', currentPassword: '' });
    this.emailCode.set('');
    this.emailError.set(null);
    this.showEmailPassword.set(false);
    this.emailStep.set('request');
  }

  cancelEmailChange() {
    this.emailStep.set('idle');
    this.emailError.set(null);
    this.emailCode.set('');
    this.emailForm.reset({ newEmail: '', currentPassword: '' });
  }

  /** Back to step 1, keeping what was typed, to correct the address. */
  useDifferentEmail() {
    this.emailCode.set('');
    this.emailError.set(null);
    this.emailStep.set('request');
  }

  /** Step 1: the server checks the password and sends a code to the new address. */
  requestEmailChange() {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    if (this.isRequestingEmail()) return;

    const { newEmail, currentPassword } = this.emailForm.getRawValue();
    const address = (newEmail ?? '').trim();

    this.isRequestingEmail.set(true);
    this.emailError.set(null);

    this.authService.requestEmailChange(address, currentPassword).subscribe({
      next: () => {
        this.isRequestingEmail.set(false);
        this.pendingEmail.set(address);
        this.emailCode.set('');
        this.emailStep.set('confirm');
        this.showToast('We sent a code to ' + address);
      },
      error: err => {
        this.isRequestingEmail.set(false);
        this.emailError.set(this.emailErrorMessage(err, 'The code could not be sent.'));
      }
    });
  }

  /** Digits only, like the other code screens. */
  onEmailCodeInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    input.value = digits;
    this.emailCode.set(digits);
    if (this.emailError()) this.emailError.set(null);
  }

  /** Step 2: the code from the new address makes it the sign-in address. */
  confirmEmailChange() {
    const code = this.emailCode();
    if (code.length !== CODE_LENGTH || this.isConfirmingEmail()) return;

    this.isConfirmingEmail.set(true);
    this.emailError.set(null);

    this.authService.confirmEmailChange(code).subscribe({
      next: result => {
        const email = result?.email || this.pendingEmail();
        this.isConfirmingEmail.set(false);

        // The session stays valid: sign-in tokens belong to the account, not to
        // the address. Only the address shown around the app has to change.
        this.userService.currentUser.update(user => user ? { ...user, email } : user);
        this.profileForm.patchValue({ email });
        this.userService.refreshMe();

        this.cancelEmailChange();
        this.showToast(`Email changed. Sign in with ${email} from now on.`);
      },
      error: err => {
        this.isConfirmingEmail.set(false);
        this.emailError.set(this.emailErrorMessage(err, 'That code was not accepted.'));
      }
    });
  }

  private emailErrorMessage(err: any, fallback: string): string {
    if (err?.status === 404) return 'Changing your email is not available on this server yet.';
    if (err?.status === 429) return 'Too many attempts. Wait a minute, then try again.';
    return apiErrorMessage(err, fallback);
  }

  // ── Security ───────────────────────────────────────────────────────────────

  changePassword() {
    if (this.passwordForm.hasError('mismatch')) {
      this.showToast('New passwords do not match.', true);
      return;
    }
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      this.showToast(passwordErrorMessage(this.passwordForm.get('newPassword')?.errors ?? null), true);
      return;
    }

    this.isChangingPassword.set(true);
    this.authService.changePassword(this.passwordForm.value).subscribe({
      next: () => {
        this.isChangingPassword.set(false);
        this.showToast('Password changed');
        this.passwordForm.reset();
      },
      error: err => {
        this.isChangingPassword.set(false);
        this.showToast(apiErrorMessage(err, 'Failed to change your password.'), true);
      }
    });
  }

  // ── Appearance ─────────────────────────────────────────────────────────────

  setTheme(preference: ThemePreference) {
    this.themeService.setTheme(preference);
  }

  isThemeSelected(preference: ThemePreference): boolean {
    return this.themeService.preference() === preference;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  setTab(tab: SettingsTab) {
    this.activeTab.set(tab);
    // Kept in the address so the section survives a reload and can be linked to.
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'Profile' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  initials(): string {
    const name = this.user()?.fullName?.trim();
    if (!name) return '?';
    return name.split(' ').filter(Boolean).slice(0, 2)
      .map(part => part[0]).join('').toUpperCase();
  }

  memberSince(): string {
    const created = this.user()?.createdAt;
    if (!created) return '';
    const date = new Date(created);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  }

  showToast(message: string, isError = false) {
    this.toastMessage.set(message);
    this.toastError.set(isError);
    this.showToastState.set(true);

    // Without clearing the previous timer, a second toast inherits the first
    // one's countdown and can vanish almost immediately.
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.showToastState.set(false), 3500);
  }

  private orNull(value: string | null | undefined): string | null {
    const trimmed = (value ?? '').trim();
    return trimmed.length ? trimmed : null;
  }

  private toDateInput(value: string | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

  private loadTimeZones(): string[] {
    try {
      const supported = (Intl as unknown as {
        supportedValuesOf?: (key: string) => string[]
      }).supportedValuesOf?.('timeZone');
      if (supported?.length) return supported;
    } catch {
      /* fall through to the short list */
    }

    return [
      'UTC', 'Africa/Cairo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
      'Asia/Dubai', 'Asia/Riyadh', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Singapore',
      'Asia/Tokyo', 'Australia/Sydney', 'America/New_York', 'America/Chicago',
      'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo'
    ];
  }
}
