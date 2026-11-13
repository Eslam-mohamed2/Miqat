import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { CalendarDataService } from '../../../core/services/calendar-data.service';
import { CalendarService } from '../../../core/services/calendar.service';
import { GoogleCalendarImportService } from '../../../core/services/google-calendar-import.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserService } from '../../../core/services/user.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { t } from '../../../core/i18n/i18n';
import { TPipe } from '../../../core/i18n/t.pipe';
import { formatTimeInZone } from '../../../core/utils/time-zone';
import { openGoogleImport } from '../../calendar/components/google-import/google-import';
import { dayMonthLabel, listText } from '../../profile/day-overlap';
import { SettingsStatus } from '../settings-status';

/** The API's limit for an .ics upload. */
const MAX_FILE_MB = 2;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/**
 * Settings → Connected calendars. Miqat does not sync with any other calendar.
 * What exists is a copy on request: from Google in a few clicks, from anywhere
 * else through an .ics file, and your own events saved as one. The rows say so.
 */
@Component({
  selector: 'app-settings-calendars',
  standalone: true,
  imports: [TPipe],
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="group">
      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Google Calendar' | t }}</span>
          <span class="line-hint">{{ 'Copies the calendars you pick into Miqat. Changes you make in Google later are not followed. Import again to refresh.' | t }}</span>
        </span>
        <span class="value-wrap">
          <span class="value">{{ googleStatus() }}</span>
          <button type="button" class="line-btn" (click)="importFromGoogle()">
            {{ (google.lastImport() ? 'Import again' : 'Import') | t }}
          </button>
        </span>
      </div>

      @for (source of sources; track source.name) {
        <div class="line">
          <span class="line-text">
            <span class="line-label">{{ source.name }}</span>
            <span class="line-hint">{{ source.hint }}</span>
          </span>
          <span class="value-wrap">
            <span class="value">{{ 'Not available' | t }}</span>
            <button type="button" class="line-btn" disabled [title]="'Miqat cannot read {name} directly yet' | t: { name: source.name }">{{ 'Connect' | t }}</button>
          </span>
        </div>
      }

      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Import a calendar file' | t }}</span>
          <span class="line-hint">{{ 'Events from an .ics file (exported from Google, Outlook or Apple), up to {n} MB, go into your default calendar' | t: { n: maxFileMb } }}</span>
        </span>
        <span class="value-wrap">
          @if (lastImport()) { <span class="value">{{ lastImport() }}</span> }
          <input type="file" #file hidden accept=".ics,text/calendar" (change)="importFile($event)" />
          <button type="button" class="line-btn" [disabled]="importing()" (click)="file.click()">
            {{ (importing() ? 'Importing…' : 'Import') | t }}
          </button>
        </span>
      </div>

      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Export my events' | t }}</span>
          <span class="line-hint">{{ 'Saves your Miqat events as an .ics file other calendars can read' | t }}</span>
        </span>
        <button type="button" class="line-btn" [disabled]="exporting()" (click)="exportFile()">
          {{ (exporting() ? 'Preparing…' : 'Export') | t }}
        </button>
      </div>

      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Show declined events' | t }}</span>
          <span class="line-hint">{{ 'Faded, so you remember what you said no to. Not available yet.' | t }}</span>
        </span>
        <button type="button" role="switch" class="switch" aria-checked="false" [attr.aria-label]="'Show declined events' | t"
                disabled [title]="'Showing declined events is not available yet' | t"><span></span></button>
      </div>
    </div>
  `
})
export class CalendarsSection {
  private calendarApi = inject(CalendarService);
  private calendarData = inject(CalendarDataService);
  private status = inject(SettingsStatus);
  private toasts = inject(ToastService);
  private dialog = inject(MatDialog);
  private users = inject(UserService);
  protected readonly google = inject(GoogleCalendarImportService);

  /** Calendars Miqat cannot read itself: their events come in as a file. */
  protected readonly sources = [
    { name: 'Outlook', hint: t('Not available yet. Export an .ics file from Outlook and import it below.') },
    { name: 'Apple iCloud', hint: t('Not available yet. Export an .ics file from Apple Calendar and import it below.') }
  ];

  protected readonly maxFileMb = MAX_FILE_MB;
  protected readonly importing = signal(false);
  protected readonly exporting = signal(false);
  /** What the last import of this visit did. */
  protected readonly lastImport = signal('');

  /** "Last imported 13 Nov, 09:20", from what this browser remembers. */
  protected readonly googleStatus = computed(() => {
    const last = this.google.lastImport();
    if (!last) return t('Not imported yet');
    const at = new Date(last.at);
    const zone = this.users.timeZone();
    return t('Last imported {day}, {time}', {
      day: dayMonthLabel(at, zone, 'short'),
      time: formatTimeInZone(at, zone, this.calendarData.use24HourClock())
    });
  });

  protected importFromGoogle(): void {
    openGoogleImport(this.dialog).afterClosed().subscribe(imported => {
      // The dialog has told the whole story; the pill only confirms it was kept.
      if (imported) this.status.saved();
    });
  }

  protected importFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Lets the same file be picked again.
    input.value = '';
    if (!file || this.importing()) return;

    if (file.size > MAX_FILE_BYTES) {
      this.status.failed(t('That file is larger than {n} MB.', { n: MAX_FILE_MB }));
      return;
    }

    this.importing.set(true);
    this.status.saving();
    this.calendarApi.importIcs(file).subscribe({
      next: result => {
        this.importing.set(false);
        const parts = [
          t('{n} added', { n: result.imported }),
          result.updated ? t('{n} updated', { n: result.updated }) : '',
          result.skipped ? t('{n} skipped', { n: result.skipped }) : ''
        ];
        this.lastImport.set(listText(parts.filter(Boolean)));
        this.toasts.show(t('Calendar file imported: {summary}', { summary: this.lastImport() }));
        this.status.saved();
        this.calendarData.reload();
      },
      error: err => {
        this.importing.set(false);
        this.status.failed(apiErrorMessage(err, t('That file could not be imported.')));
      }
    });
  }

  protected exportFile(): void {
    if (this.exporting()) return;

    this.exporting.set(true);
    this.calendarApi.exportIcs().subscribe({
      next: blob => {
        this.exporting.set(false);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'miqat-calendar.ics';
        link.click();
        URL.revokeObjectURL(link.href);
      },
      error: err => {
        this.exporting.set(false);
        this.status.failed(apiErrorMessage(err, t('Your events could not be exported.')));
      }
    });
  }
}
