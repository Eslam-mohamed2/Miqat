import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild
} from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';

import { t, tCount } from '../../../../core/i18n/i18n';
import { TPipe } from '../../../../core/i18n/t.pipe';
import { CalendarDataService } from '../../../../core/services/calendar-data.service';
import { GoogleCalendarImportService, GoogleImportError } from '../../../../core/services/google-calendar-import.service';
import {
  GoogleCalendar, GoogleCalendarImportResult, GoogleImportPeriod, GoogleImportProgress
} from '../../../../models/api.models';

type Step = 'intro' | 'choose' | 'running' | 'done';

interface PeriodChoice {
  id: string;
  label: string;
  /** Months before and after today; null leaves that side open. */
  back: number | null;
  ahead: number | null;
}

const PERIODS: PeriodChoice[] = [
  { id: 'near', label: t('The last 3 months and the next 12'), back: 3, ahead: 12 },
  { id: 'ahead', label: t('From today, the next 12 months'), back: 0, ahead: 12 },
  { id: 'year', label: t('The last 12 months and the next 12'), back: 12, ahead: 12 },
  { id: 'all', label: t('Everything, past and future'), back: null, ahead: null }
];

/** One chosen calendar while the import runs, and what became of it. */
interface Row {
  calendar: GoogleCalendar;
  state: 'waiting' | 'reading' | 'saving' | 'done';
  events: number;
  result: GoogleCalendarImportResult | null;
}

/** Opens the import; it closes with true when events were brought in. */
export function openGoogleImport(dialog: MatDialog): MatDialogRef<GoogleImportDialog, boolean> {
  return dialog.open(GoogleImportDialog, {
    width: '560px',
    maxWidth: '95vw',
    panelClass: 'custom-dialog-container',
    // A click beside the window must not end an import half-way.
    disableClose: true,
    autoFocus: 'dialog',
    ariaLabel: t('Import from Google Calendar')
  });
}

/**
 * "Import from Google Calendar": sign in to Google for the calendars only, choose
 * which calendars and which period, watch them being copied, read what happened.
 * It copies; it does not connect. Every screen of it says so.
 */
@Component({
  selector: 'app-google-import',
  standalone: true,
  imports: [TPipe],
  templateUrl: './google-import.html',
  styleUrl: './google-import.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GoogleImportDialog {
  private dialogRef = inject(MatDialogRef<GoogleImportDialog, boolean>);
  private google = inject(GoogleCalendarImportService);
  private calendarData = inject(CalendarDataService);
  private title = viewChild<ElementRef<HTMLElement>>('title');

  readonly periods = PERIODS;

  readonly step = signal<Step>('intro');
  /** What the first screen is waiting for. */
  readonly waiting = signal<'' | 'google' | 'calendars'>('');
  readonly problem = signal<string | null>(null);
  readonly calendars = signal<GoogleCalendar[]>([]);
  readonly chosen = signal<ReadonlySet<string>>(new Set());
  readonly periodId = signal(PERIODS[0].id);
  readonly rows = signal<Row[]>([]);
  /** True once any import of this visit brought events in. */
  private imported = false;

  readonly heading = computed(() => {
    switch (this.step()) {
      case 'intro': return t('Import from Google Calendar');
      case 'choose': return t('Choose what to import');
      case 'running': return t('Importing your events');
      case 'done': return this.total() ? t('Import finished') : t('Nothing was imported');
    }
  });

  readonly connectLabel = computed(() =>
    this.waiting() === 'google' ? t('Waiting for Google…')
    : this.waiting() === 'calendars' ? t('Reading your calendars…')
    : this.problem() ? t('Try again') : t('Continue with Google'));

  readonly importLabel = computed(() => {
    const count = this.chosen().size;
    return count ? tCount(count, 'Import {n} calendar', 'Import {n} calendars') : t('Import');
  });

  /** Events added or updated by the run on screen. */
  readonly total = computed(() =>
    this.rows().reduce((sum, row) => sum + (row.result ? row.result.added + row.result.updated : 0), 0));

  /** "Calendar 2 of 3" */
  readonly position = computed(() => {
    const rows = this.rows();
    const current = rows.findIndex(row => row.state === 'reading' || row.state === 'saving');
    return current < 0 ? '' : t('Calendar {current} of {total}', { current: current + 1, total: rows.length });
  });

  readonly summary = computed(() => {
    const results = this.rows().map(row => row.result).filter((result): result is GoogleCalendarImportResult => !!result);
    const added = results.reduce((sum, result) => sum + result.added, 0);
    const updated = results.reduce((sum, result) => sum + result.updated, 0);
    const failed = results.filter(result => result.error).length;

    if (!added && !updated) {
      return failed
        ? t('No events were brought in. The reason is under each calendar.')
        : t('There was nothing to import: the calendars you chose have no events in that period.');
    }
    const parts = [
      added ? tCount(added, '{n} event added', '{n} events added') : '',
      updated ? tCount(updated, '{n} event updated', '{n} events updated') : ''
    ].filter(Boolean);
    const what = parts.length > 1 ? t('{first} and {second}', { first: parts[0], second: parts[1] }) : parts[0];
    return failed
      ? t('{what}. {failed}.', {
          what, failed: tCount(failed, '{n} calendar could not be imported', '{n} calendars could not be imported')
        })
      : t('{what}.', { what });
  });

  constructor() {
    // Loaded ahead of the click, so Google's window can open inside it. A failure
    // is reported when the button is pressed.
    this.google.prepare().catch(() => undefined);
    inject(DestroyRef).onDestroy(() => this.google.forget());
  }

  // ── Google's permission ─────────────────────────────────────────────────────

  connect(): void {
    if (this.waiting()) return;
    this.problem.set(null);
    this.waiting.set('google');

    this.google.signIn()
      .then(() => {
        this.waiting.set('calendars');
        return this.google.calendars();
      })
      .then(calendars => {
        this.calendars.set(calendars);
        const main = calendars.find(calendar => calendar.primary) ?? calendars[0];
        this.chosen.set(new Set(main ? [main.id] : []));
        this.waiting.set('');
        this.show('choose');
      })
      .catch(error => {
        this.waiting.set('');
        this.problem.set(this.reason(error));
      });
  }

  // ── Choosing ────────────────────────────────────────────────────────────────

  isChosen(id: string): boolean {
    return this.chosen().has(id);
  }

  toggle(id: string): void {
    this.chosen.update(current => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  setPeriod(event: Event): void {
    this.periodId.set((event.target as HTMLSelectElement).value);
  }

  // ── Importing ───────────────────────────────────────────────────────────────

  start(): void {
    const chosen = this.calendars().filter(calendar => this.chosen().has(calendar.id));
    if (!chosen.length || this.step() === 'running') return;

    this.problem.set(null);
    this.rows.set(chosen.map(calendar => ({ calendar, state: 'waiting', events: 0, result: null })));
    this.show('running');

    this.google.import(chosen, this.period(), progress => this.follow(progress)).then(results => {
      if (results.some(result => result.added || result.updated)) {
        this.imported = true;
        this.calendarData.reload();
      }
      this.show('done');
    }).catch(error => {
      this.problem.set(this.reason(error));
      this.show('done');
    });
  }

  private follow(progress: GoogleImportProgress): void {
    this.rows.update(rows => rows.map(row => row.calendar.id !== progress.calendarId ? row : {
      ...row, state: progress.step, events: progress.events, result: progress.result ?? null
    }));
  }

  private period(): GoogleImportPeriod {
    const choice = PERIODS.find(period => period.id === this.periodId()) ?? PERIODS[0];
    // Counted from the start of today, so "from today" keeps this morning's events.
    const monthsFromNow = (months: number) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setMonth(date.getMonth() + months);
      return date;
    };
    return {
      from: choice.back === null ? null : monthsFromNow(-choice.back),
      to: choice.ahead === null ? null : monthsFromNow(choice.ahead)
    };
  }

  /** What a row says while its calendar is being copied. */
  progressOf(row: Row): string {
    switch (row.state) {
      case 'waiting': return t('Waiting');
      case 'reading': return row.events
        ? tCount(row.events, 'Reading from Google… {n} event so far', 'Reading from Google… {n} events so far')
        : t('Reading from Google…');
      case 'saving': return tCount(row.events, 'Saving {n} event to Miqat…', 'Saving {n} events to Miqat…');
      case 'done': return row.result ? this.countsOf(row.result) : '';
    }
  }

  /** "12 added · 3 updated · 1 skipped" */
  countsOf(result: GoogleCalendarImportResult): string {
    const parts = [
      result.added ? t('{n} added', { n: result.added }) : '',
      result.updated ? t('{n} updated', { n: result.updated }) : '',
      result.skipped ? t('{n} skipped', { n: result.skipped }) : ''
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : result.error ? t('Not imported') : t('No events in this period');
  }

  /** "Gym, Stand-up and 3 more" */
  titles(list: string[]): string {
    const shown = list.slice(0, 3).join(t(', '));
    return list.length > 3
      ? tCount(list.length - 3, '{titles} and {n} more', '{titles} and {n} more', { titles: shown })
      : shown;
  }

  // ── Leaving, or going round again ───────────────────────────────────────────

  /** Back to the chooser; to the first screen when Google's permission has run out. */
  again(): void {
    this.problem.set(null);
    this.show(this.google.signedIn ? 'choose' : 'intro');
  }

  close(): void {
    if (this.step() === 'running') return;
    this.dialogRef.close(this.imported);
  }

  private show(step: Step): void {
    this.step.set(step);
    // The control that had the focus is gone with the old screen.
    setTimeout(() => this.title()?.nativeElement.focus());
  }

  private reason(error: unknown): string {
    return error instanceof GoogleImportError ? error.message : t('Google could not finish this. Try again in a minute.');
  }
}
