import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { CalendarDataService } from '../../../core/services/calendar-data.service';
import { CalendarService } from '../../../core/services/calendar.service';
import { LocalPrefsService } from '../../../core/services/local-prefs.service';
import { t } from '../../../core/i18n/i18n';
import { TCountPipe, TPipe } from '../../../core/i18n/t.pipe';
import { clockHours, formatClock } from '../../profile/day-overlap';
import { SettingsStatus } from '../settings-status';

const CAP_HOURS = [4, 5, 6];

/**
 * Settings → Planning and focus: the guardrails "Plan my day" works inside. The
 * API has no fields for them, so they are kept in this browser (LocalPrefsService).
 */
@Component({
  selector: 'app-settings-planning',
  standalone: true,
  imports: [TPipe, TCountPipe],
  styleUrl: './section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="group">
      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Miqat suggestions' | t }}</span>
          <span class="line-hint">{{ 'Miqat suggests a plan when you open Plan my day. The other modes are not available yet.' | t }}</span>
        </span>
        <div class="seg" role="group" [attr.aria-label]="'Miqat suggestions' | t">
          <button type="button" aria-pressed="false" disabled [title]="'Switching suggestions off is not available yet' | t">{{ 'Off' | t }}</button>
          <button type="button" aria-pressed="true">{{ 'Suggest' | t }}</button>
          <button type="button" aria-pressed="false" disabled [title]="'Planning each morning is not available yet' | t">{{ 'Plan each morning' | t }}</button>
        </div>
      </div>

      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Default task estimate' | t }}</span>
          <span class="line-hint">{{ 'Used when a task has no estimate. Not available yet: set an estimate on the task itself.' | t }}</span>
        </span>
        <label class="pick off">
          <select [attr.aria-label]="'Default task estimate' | t" disabled [title]="'A default estimate is not available yet' | t">
            <option selected>{{ 'Not set' | t }}</option>
          </select>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9l5-5 5 5M7 15l5 5 5-5"></path></svg>
        </label>
      </div>

      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Buffer after meetings' | t }}</span>
          <span class="line-hint">{{ 'Time to reset before the next thing' | t }}</span>
        </span>
        <label class="pick">
          <select [attr.aria-label]="'Buffer after meetings' | t" (change)="setBuffer($any($event.target).value === 'on')">
            <option value="off" [selected]="!prefs.bufferAfterMeetings()">{{ 'None@@option' | t }}</option>
            <option value="on" [selected]="prefs.bufferAfterMeetings()">{{ 10 | tCount: '{n} minute' : '{n} minutes' }}</option>
          </select>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9l5-5 5 5M7 15l5 5 5-5"></path></svg>
        </label>
      </div>

      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Protect lunch' | t }}</span>
          <span class="line-hint">{{ lunchHint() }}</span>
        </span>
        <button type="button" role="switch" class="switch" [attr.aria-checked]="prefs.protectLunch()" [attr.aria-label]="'Protect lunch' | t"
                (click)="toggle('protectLunch')"><span></span></button>
      </div>

      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Cap meetings' | t }}</span>
          <span class="line-hint">{{ 'Miqat warns you before you go over' | t }}</span>
        </span>
        <label class="pick">
          <select [attr.aria-label]="'Cap meetings' | t" (change)="setCap($any($event.target).value)">
            <option value="" [selected]="!prefs.capMeetings()">{{ 'No cap' | t }}</option>
            @for (hours of capChoices(); track hours) {
              <option [value]="hours" [selected]="prefs.capMeetings() && prefs.meetingCapHours() === hours">{{ hours | tCount: '{n} hour a day' : '{n} hours a day' }}</option>
            }
          </select>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9l5-5 5 5M7 15l5 5 5-5"></path></svg>
        </label>
      </div>

      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Plan around prayer times' | t }}</span>
          <span class="line-hint">{{ 'Suggestions never place work across a prayer time' | t }}</span>
        </span>
        <button type="button" role="switch" class="switch" [attr.aria-checked]="prefs.planAroundPrayer()"
                [attr.aria-label]="'Plan around prayer times' | t" (click)="toggle('planAroundPrayer')"><span></span></button>
      </div>

      <div class="line">
        <span class="line-text">
          <span class="line-label">{{ 'Protect my weekend' | t }}</span>
          <span class="line-hint">{{ 'Invites on your weekend show a gentle warning. Not available yet.' | t }}</span>
        </span>
        <button type="button" role="switch" class="switch" aria-checked="false" [attr.aria-label]="'Protect my weekend' | t"
                disabled [title]="'Weekend warnings are not available yet' | t"><span></span></button>
      </div>
    </div>
  `
})
export class PlanningSection {
  protected prefs = inject(LocalPrefsService);
  private status = inject(SettingsStatus);
  private calendarData = inject(CalendarDataService);

  /** The usual caps, plus the stored one when it is another number. */
  protected readonly capChoices = computed(() => {
    const stored = this.prefs.meetingCapHours();
    return CAP_HOURS.includes(stored) ? CAP_HOURS : [...CAP_HOURS, stored].sort((a, b) => a - b);
  });

  protected readonly lunchHint = computed(() => {
    const hour24 = this.calendarData.use24HourClock();
    const from = formatClock(clockHours(this.prefs.lunchStart(), 13), hour24);
    const to = formatClock(clockHours(this.prefs.lunchEnd(), 14), hour24);
    return t('{from} – {to} stays free when Miqat plans your day', { from, to });
  });

  constructor() {
    // The lunch hour is written on the user's clock (12 or 24 hours).
    if (!this.calendarData.settings()) {
      inject(CalendarService).getSettings().subscribe({
        next: settings => this.calendarData.settings.set(settings),
        error: () => { /* the 12-hour default */ }
      });
    }
  }

  protected toggle(key: 'protectLunch' | 'planAroundPrayer'): void {
    this.prefs[key].update(on => !on);
    this.status.saved();
  }

  protected setBuffer(on: boolean): void {
    this.prefs.bufferAfterMeetings.set(on);
    this.status.saved();
  }

  protected setCap(value: string): void {
    if (value) this.prefs.meetingCapHours.set(Number(value));
    this.prefs.capMeetings.set(!!value);
    this.status.saved();
  }
}
