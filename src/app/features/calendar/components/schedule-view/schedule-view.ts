import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject } from '@angular/core';

import { CalendarStateService } from '../../../../core/services/calendar-state.service';
import { t } from '../../../../core/i18n/i18n';
import { NumPipe, TPipe } from '../../../../core/i18n/t.pipe';
import { OccasionDay, countryName, occasionSummary } from '../../../../core/utils/occasions';
import { BoardDay, CalendarBoard } from '../../calendar-board.service';
import { CalendarChip } from '../../calendar-chips';
import { joinLink, monthAndYear } from '../../calendar-layout';

/**
 * "Schedule": the month on screen as a list, a day at a time. The design has no
 * file for it, so it is built from the month view's day list (V2-Month).
 */
@Component({
  selector: 'app-schedule-view',
  standalone: true,
  imports: [TPipe, NumPipe],
  templateUrl: './schedule-view.html',
  styleUrl: './schedule-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScheduleView {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly state = inject(CalendarStateService);
  readonly board = inject(CalendarBoard);

  /** The days of the month on screen that have something on them: an item, a holiday or an occasion. */
  readonly days = computed<BoardDay[]>(() =>
    this.board.monthWeeks().flat().filter(day => day.inMonth && (day.chips.length || day.occasions.length)));

  /** True once the list was brought to today, so later reloads leave the scroll alone. */
  private opened = false;

  constructor() {
    // Opens on today (or what comes next) when the month on screen has it, not on the 1st.
    afterRenderEffect(() => {
      const days = this.days();
      if (this.opened || !days.length) return;
      this.opened = true;

      const index = days.findIndex(day => day.key >= this.board.todayKey());
      const host = this.host.nativeElement;
      const section = host.querySelectorAll<HTMLElement>('.day')[index];
      if (index > 0 && section) {
        host.scrollTop += section.getBoundingClientRect().top - host.getBoundingClientRect().top;
      }
    });
  }

  readonly monthLabel = computed(() => monthAndYear(this.state.currentMonth()));

  /** The day number opens that day on its own. */
  openDay(day: BoardDay) {
    this.state.showDay(day.date, 'day');
  }

  pick(chip: CalendarChip) {
    this.board.pick(chip);
  }

  summaryOf(mark: OccasionDay): string {
    return occasionSummary(mark.occasion, mark.dayNumber);
  }

  /** "Egypt · Day 2 of 3 · Date may vary": where it is kept and what else there is to say. */
  noteOf(mark: OccasionDay): string {
    const { occasion, dayNumber } = mark;
    return [
      occasion.country === 'Islamic'
        ? (occasion.holidayIn ? countryName(occasion.holidayIn) : t('Islamic calendar'))
        : countryName(occasion.country),
      occasion.days > 1 ? t('Day {n} of {total}', { n: dayNumber, total: occasion.days }) : '',
      occasion.mayVary ? t('Date may vary') : ''
    ].filter(Boolean).join(' · ');
  }

  /** "Invitation", a place, a calendar or a project: what there is to say beside the title. */
  note(chip: CalendarChip): string {
    if (chip.planned) return t('Planned');
    if (chip.kind === 'Task') return chip.item.groupName || t('Personal task');
    if (chip.pending) return t('Invitation · not answered');
    if (chip.declined) return t('Declined@@invitation');
    // A meeting link is named, not spelled out.
    return joinLink(chip.item.location)?.label ?? (chip.item.location || chip.item.calendarName || '');
  }
}
