import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { nearestCalendarColor } from '../../features/calendar/components/calendar-sidebar/calendar-colors';
import {
  GoogleCalendar, GoogleCalendarImportResult, GoogleImportPeriod, GoogleImportProgress, GoogleLastImport,
  UserCalendarDto
} from '../../models/api.models';
import { apiErrorMessage } from '../http/api-error';
import { t } from '../i18n/i18n';
import { GoogleEvent, googleEventsToIcs } from '../utils/google-ics';
import { AuthService } from './auth.service';
import { CalendarService } from './calendar.service';
import { LocalPrefsService } from './local-prefs.service';

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const API_URL = 'https://www.googleapis.com/calendar/v3';
/** Read-only: Miqat can list calendars and read events, and change nothing. */
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

/** Only what the import reads is asked for; guests and their addresses never leave Google. */
const EVENT_FIELDS = 'nextPageToken,items(id,status,summary,description,location,hangoutLink,start,end,'
  + 'recurrence,recurringEventId,originalStartTime,iCalUID,eventType)';
const CALENDAR_FIELDS = 'nextPageToken,items(id,summary,summaryOverride,backgroundColor,primary,deleted)';
const PAGE_SIZE = '2500';
/** The longest name the calendar form takes. */
const MAX_CALENDAR_NAME = 80;

export type GoogleImportProblem =
  | 'script' | 'popup-closed' | 'popup-blocked' | 'denied' | 'no-permission' | 'refused'
  | 'expired' | 'not-set-up' | 'busy' | 'gone' | 'network' | 'unknown';

/** Something that stopped the import, with a sentence a person can act on. */
export class GoogleImportError extends Error {
  constructor(readonly problem: GoogleImportProblem, message: string) {
    super(message);
  }
}

/** In English: the sentence is put into the interface language when the problem is raised. */
const MESSAGES: Record<GoogleImportProblem, string> = {
  'script': 'Google’s sign-in could not be loaded. Check your connection, or an ad blocker, and try again.',
  'popup-closed': 'The Google window was closed before it finished, so nothing was imported. If Google showed an error '
    + 'there instead of a sign-in, this address is not approved for Google sign-in yet.',
  'popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for Miqat and try again.',
  'denied': 'You did not give Miqat permission to read your Google calendars, so nothing was imported.',
  'no-permission': 'Google did not pass on the permission to read your calendars. Try again and tick the calendar box when Google asks.',
  'refused': 'Google refused the request. This is ours to fix, not yours; you can still import an .ics file.',
  'expired': 'Google’s permission ran out (it lasts about an hour). Start the import again.',
  'not-set-up': 'Google has not been set up to share calendars with Miqat yet. This is ours to fix, not yours; you can still import an .ics file.',
  'busy': 'Google is taking too many requests right now. Try again in a minute.',
  'gone': 'Google no longer has this calendar.',
  'network': 'Google could not be reached. Check your connection and try again.',
  'unknown': 'Google could not finish this. Try again in a minute.'
};

function problem(kind: GoogleImportProblem): GoogleImportError {
  return new GoogleImportError(kind, t(MESSAGES[kind]));
}

// ── The part of Google Identity Services this file uses ───────────────────────
interface TokenResponse { access_token?: string; error?: string; }
interface TokenClientConfig {
  client_id: string;
  scope: string;
  prompt: string;
  callback: (response: TokenResponse) => void;
  error_callback: (error: { type?: string }) => void;
}
interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient(config: TokenClientConfig): { requestAccessToken(): void };
      hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean;
    };
  };
}

/** The name the Miqat calendar gets: the Google calendar's own, as far as it fits. */
function nameFor(calendar: GoogleCalendar): string {
  return calendar.name.slice(0, MAX_CALENDAR_NAME).trim();
}

function identity(): GoogleIdentity['accounts']['oauth2'] | null {
  return (window as unknown as { google?: Partial<GoogleIdentity> }).google?.accounts?.oauth2 ?? null;
}

interface CalendarListPage {
  nextPageToken?: string;
  items?: { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean; deleted?: boolean }[];
}
interface EventsPage { nextPageToken?: string; items?: GoogleEvent[]; }

/**
 * Copies Google calendars into Miqat from the browser. The user gives Google's
 * read-only calendar permission in Google's own window; the events are read here,
 * turned into iCalendar text and sent through the same import an .ics file takes.
 *
 * Google's access token is held in this object for the length of the import. It is
 * never stored and never sent to the Miqat API, and Miqat's own token never goes
 * to Google: Google is called with `fetch`, outside the app's HTTP interceptor.
 */
@Injectable({ providedIn: 'root' })
export class GoogleCalendarImportService {
  private calendarApi = inject(CalendarService);
  private auth = inject(AuthService);
  private prefs = inject(LocalPrefsService);

  private token: string | null = null;
  /** Counts the times the import was closed, to tell a late answer from Google apart. */
  private visit = 0;
  private script: Promise<void> | null = null;

  /** When this user last imported in this browser; null before the first time. */
  lastImport(): GoogleLastImport | null {
    return this.lastImportPref()();
  }

  /** True while Google's permission from this visit is still held. */
  get signedIn(): boolean {
    return this.token !== null;
  }

  /**
   * Loads Google's sign-in script. Called when the import opens, so that the
   * button's click can open Google's window at once: a window opened later, after
   * waiting for a download, is one browsers block.
   */
  prepare(): Promise<void> {
    if (identity()) return Promise.resolve();

    this.script ??= new Promise<void>((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = SCRIPT_URL;
      tag.async = true;
      tag.onload = () => identity() ? resolve() : reject(problem('script'));
      tag.onerror = () => {
        tag.remove();
        reject(problem('script'));
      };
      document.head.appendChild(tag);
    }).catch(error => {
      // The next try loads it again.
      this.script = null;
      throw error;
    });
    return this.script;
  }

  /**
   * Opens Google's window and waits for the permission to read calendars. With the
   * script already there (see `prepare`), the window opens inside the caller's click.
   */
  signIn(): Promise<void> {
    const oauth = identity();
    return oauth ? this.ask(oauth) : this.prepare().then(() => {
      const loaded = identity();
      if (!loaded) throw problem('script');
      return this.ask(loaded);
    });
  }

  private async ask(oauth: GoogleIdentity['accounts']['oauth2']): Promise<void> {
    const visit = this.visit;
    const token = await new Promise<string>((resolve, reject) => {
      oauth.initTokenClient({
        client_id: environment.googleClientId,
        scope: GOOGLE_CALENDAR_SCOPE,
        prompt: 'select_account',
        callback: response => {
          if (response.error === 'access_denied') reject(problem('denied'));
          else if (response.error || !response.access_token) reject(problem('refused'));
          // Google lets a person untick single permissions on its consent screen.
          else if (!oauth.hasGrantedAllScopes(response, GOOGLE_CALENDAR_SCOPE)) reject(problem('no-permission'));
          else resolve(response.access_token);
        },
        error_callback: error => reject(problem(
          error?.type === 'popup_closed' ? 'popup-closed'
          : error?.type === 'popup_failed_to_open' ? 'popup-blocked'
          : 'unknown'))
      }).requestAccessToken();
    });
    // An answer that arrives after the import was closed is not kept.
    if (visit === this.visit) this.token = token;
  }

  /** Drops Google's permission. Called when the import closes. */
  forget(): void {
    this.visit++;
    this.token = null;
  }

  /** The calendars of the Google account, the main one first. */
  async calendars(): Promise<GoogleCalendar[]> {
    const found: GoogleCalendar[] = [];
    let pageToken: string | undefined;

    do {
      const page = await this.google<CalendarListPage>('/users/me/calendarList', {
        minAccessRole: 'reader', maxResults: '250', fields: CALENDAR_FIELDS, pageToken
      });
      for (const item of page.items ?? []) {
        if (item.deleted) continue;
        found.push({
          id: item.id,
          name: (item.summaryOverride || item.summary || t('Untitled calendar')).trim(),
          color: item.backgroundColor || '',
          primary: !!item.primary
        });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    return found.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
  }

  /**
   * Copies the chosen calendars, one after the other. A calendar that fails does
   * not stop the next one: its result says why. `progress` is told what is going on.
   */
  async import(
    chosen: GoogleCalendar[], period: GoogleImportPeriod, progress: (step: GoogleImportProgress) => void
  ): Promise<GoogleCalendarImportResult[]> {
    const results: GoogleCalendarImportResult[] = [];
    const targets = { ...this.lastImport()?.targets };
    let mine: UserCalendarDto[] | null = null;

    for (const calendar of chosen) {
      const result: GoogleCalendarImportResult = {
        id: calendar.id, name: calendar.name, color: nearestCalendarColor(calendar.color),
        added: 0, updated: 0, skipped: 0, simplified: [], split: [], error: null
      };
      results.push(result);
      let target: UserCalendarDto | null = null;
      let madeNow = false;

      try {
        const events = await this.events(calendar, period, read => progress({ calendarId: calendar.id, step: 'reading', events: read }));
        const converted = googleEventsToIcs(events, { now: new Date() });
        result.skipped = converted.leftOut;
        result.simplified = converted.simplified;
        result.split = converted.split;
        if (!converted.files.length) continue;

        progress({ calendarId: calendar.id, step: 'saving', events: converted.written });
        mine ??= await firstValueFrom(this.calendarApi.getCalendars());
        target = this.calendarOf(calendar, mine, targets);
        if (!target) {
          target = await firstValueFrom(this.calendarApi.createCalendar({ name: nameFor(calendar), color: result.color }));
          mine.push(target);
          madeNow = true;
        }

        for (const text of converted.files) {
          const file = new File([text], 'google-calendar.ics', { type: 'text/calendar' });
          const saved = await firstValueFrom(this.calendarApi.importIcs(file, target.id));
          result.added += saved.imported;
          result.updated += saved.updated;
          result.skipped += saved.skipped;
        }
      } catch (error) {
        result.error = error instanceof GoogleImportError ? error.message
          : apiErrorMessage(error, t('Miqat could not save these events. Try again.'));
      } finally {
        if (target && madeNow && !result.added) {
          // Every event was already here, in a calendar that has since been renamed
          // or in another one: the calendar just made would stay empty.
          await firstValueFrom(this.calendarApi.deleteCalendar(target.id)).catch(() => undefined);
          mine?.splice(mine.indexOf(target), 1);
        } else if (target) {
          targets[calendar.id] = target.id;
        }
        progress({ calendarId: calendar.id, step: 'done', events: result.added + result.updated, result });
      }
    }

    if (results.some(result => result.added || result.updated)) {
      this.lastImportPref().set({
        at: new Date().toISOString(),
        calendars: results.filter(result => result.added || result.updated).length,
        events: results.reduce((total, result) => total + result.added + result.updated, 0),
        targets
      });
    }
    return results;
  }

  // ── Google ──────────────────────────────────────────────────────────────────

  private async events(
    calendar: GoogleCalendar, period: GoogleImportPeriod, read: (events: number) => void
  ): Promise<GoogleEvent[]> {
    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;

    do {
      // singleEvents=false keeps a repeating event as one event with its rule; its
      // changed and deleted dates come along as events that name it.
      const page = await this.google<EventsPage>(`/calendars/${encodeURIComponent(calendar.id)}/events`, {
        singleEvents: 'false', showDeleted: 'false', maxResults: PAGE_SIZE, fields: EVENT_FIELDS,
        timeMin: period.from?.toISOString(), timeMax: period.to?.toISOString(), pageToken
      });
      events.push(...(page.items ?? []));
      read(events.length);
      pageToken = page.nextPageToken;
    } while (pageToken);

    return events;
  }

  private async google<T>(path: string, query: Record<string, string | undefined>): Promise<T> {
    if (!this.token) throw problem('expired');

    const url = new URL(API_URL + path);
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(name, value);
    }

    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
    } catch {
      throw problem('network');
    }
    if (response.ok) return await response.json() as T;

    const body = await response.text().catch(() => '');
    if (response.status === 401) {
      this.token = null;
      throw problem('expired');
    }
    if (response.status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used in project|is disabled/i.test(body)) {
      throw problem('not-set-up');
    }
    if (response.status === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes/i.test(body)) {
      throw problem('no-permission');
    }
    if (response.status === 429 || (response.status === 403 && /rateLimitExceeded|quotaExceeded/i.test(body))) {
      throw problem('busy');
    }
    if (response.status === 403) {
      throw new GoogleImportError('refused', t('Google refused to let Miqat read this. Try again, or import an .ics file instead.'));
    }
    if (response.status === 404 || response.status === 410) throw problem('gone');
    throw problem('unknown');
  }

  // ── Miqat ───────────────────────────────────────────────────────────────────

  /**
   * The Miqat calendar a Google calendar goes into: the one it went into last time
   * (this browser remembers, so renaming it in Miqat is fine), or else the one
   * with its name. Null when there is none yet.
   */
  private calendarOf(calendar: GoogleCalendar, mine: UserCalendarDto[], targets: Record<string, string>): UserCalendarDto | null {
    const name = nameFor(calendar).toLowerCase();
    return mine.find(candidate => candidate.id === targets[calendar.id])
      ?? mine.find(candidate => candidate.name.trim().toLowerCase() === name)
      ?? null;
  }

  private lastImportPref() {
    return this.prefs.value<GoogleLastImport | null>(`google.lastImport.${this.auth.getCurrentUserId() ?? 'me'}`, null);
  }
}
