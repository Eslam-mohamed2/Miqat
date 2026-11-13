import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { CalendarDataService } from '../../../../core/services/calendar-data.service';
import { ChatService } from '../../../../core/services/chat.service';
import { CalendarStateService } from '../../../../core/services/calendar-state.service';
import { LocalPrefsService } from '../../../../core/services/local-prefs.service';
import { formatNumber, isArabic, num, t, tCount } from '../../../../core/i18n/i18n';
import { NumPipe, TCountPipe, TPipe } from '../../../../core/i18n/t.pipe';
import { OccasionDay, occasionDetail, occasionSummary } from '../../../../core/utils/occasions';
import { BoardDay, CalendarBoard } from '../../calendar-board.service';
import { CalendarChip } from '../../calendar-chips';
import { listOf, longDate, monthName, weekNumberOfRow, weekdayName } from '../../calendar-layout';
import { EventActions } from '../../event-actions.service';
import { EventDetails } from '../event-details/event-details';

/** Lines a cell lists before "+N more", and rows of bars a week draws above them. */
const CELL_LINES = 3;
const BAR_ROWS = 2;
/** Occasions a cell names before they are counted with "+N more". */
const OCCASION_LINES = 2;

interface MonthCell {
  day: BoardDay;
  /** "21 Jum. I" on the first cell and on the first of a Hijri month, otherwise the day number. */
  hijri: string;
  hijriStart: boolean;
  /** 0 to 4: the mark at the end of the date line. */
  load: number;
  /** The public holidays and occasions the cell names, above its items. */
  occasions: OccasionDay[];
  lines: CalendarChip[];
  more: number;
  label: string;
}

/** An all-day event across the days of a week. */
interface MonthBar {
  chip: CalendarChip;
  /** First day (0 to 6) and how many days. */
  from: number;
  span: number;
  row: number;
}

interface MonthWeek {
  cells: MonthCell[];
  bars: MonthBar[];
  /** Room the cells leave for the bars above their lines. */
  barSpace: number;
  /** Lines every cell of the week keeps for occasions (0 to 2), and how far that pushes the bars down. */
  occasionRows: number;
  barOffset: number;
}

/**
 * The month (design/miqat-2.0: V2-Month): a cell per day with its first few items
 * and how full it is, bars for what runs all day, and beside it the day that was
 * picked and the month at a glance.
 */
@Component({
  selector: 'app-month-view',
  standalone: true,
  imports: [EventDetails, TPipe, TCountPipe, NumPipe],
  templateUrl: './month-view.html',
  styleUrl: './month-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthView {
  private actions = inject(EventActions);
  /** The chat button floats over the side panel's bottom corner. */
  protected readonly chat = inject(ChatService);
  private prefs = inject(LocalPrefsService);
  readonly state = inject(CalendarStateService);
  readonly data = inject(CalendarDataService);
  readonly board = inject(CalendarBoard);

  /** True when the aside is wide enough to show an event's details in place. */
  readonly inlineDetails = input(true);

  readonly dayLabels = computed(() => {
    const start = this.data.weekStart();
    const workDays = this.board.workDays();
    return Array.from({ length: 7 }, (_, index) => {
      const day = (start + index) % 7;
      return { label: weekdayName(day), off: !workDays.has(day) };
    });
  });

  readonly weeks = computed<MonthWeek[]>(() => {
    const hijriOn = this.board.hijriOn();
    let first = true;

    return this.board.monthWeeks().map(days => {
      const bars = this.barsOf(days);
      const shown = bars.filter(bar => bar.row < BAR_ROWS);
      const rows = shown.reduce((most, bar) => Math.max(most, bar.row + 1), 0);

      const cells = days.map((day, index) => {
        // Bars that found no row are counted with the lines that do not fit.
        const unshown = bars.filter(bar => bar.row >= BAR_ROWS && bar.from <= index && index < bar.from + bar.span).length;
        const lines = day.chips.filter(chip => !this.isBar(chip) && !chip.declined);

        let hijri = '';
        let hijriStart = false;
        if (hijriOn) {
          const date = this.board.hijri(day.date);
          hijriStart = date.day === 1;
          hijri = first || hijriStart ? `${num(date.day)} ${this.shortMonth(date.month)}` : num(date.day);
          first = false;
        }

        // Occasions come first; a second one takes the place of an item's line.
        const occasions = day.occasions.slice(0, OCCASION_LINES);
        const room = CELL_LINES - Math.max(0, occasions.length - 1);

        return {
          day,
          hijri,
          hijriStart,
          load: Math.min(4, day.count),
          occasions,
          lines: lines.slice(0, room),
          more: Math.max(0, lines.length - room) + unshown + day.occasions.length - occasions.length,
          label: listOf([
            day.label, ...day.occasions.map(mark => mark.occasion.name), tCount(day.count, '{n} item', '{n} items')
          ])
        };
      });

      const occasionRows = cells.reduce((most, cell) => Math.max(most, cell.occasions.length), 0);
      return {
        cells, bars: shown, barSpace: rows ? 26 + (rows - 1) * 24 : 0,
        occasionRows, barOffset: occasionRows ? occasionRows * 19 + 3 : 0
      };
    });
  });

  /** What runs all day is a bar across the week; a task due on a date stays a line in its cell. */
  private isBar(chip: CalendarChip): boolean {
    return chip.allDay && chip.kind === 'Event';
  }

  private barsOf(days: BoardDay[]): MonthBar[] {
    const bars = new Map<string, MonthBar>();
    days.forEach((day, index) => {
      for (const chip of day.chips) {
        if (!this.isBar(chip) || chip.declined) continue;
        const id = `${chip.id}:${chip.item.start}`;
        const bar = bars.get(id);
        if (bar && bar.from + bar.span === index) bar.span++;
        else if (!bar) bars.set(id, { chip, from: index, span: 1, row: 0 });
      }
    });

    // Each bar takes the first row that is free on all of its days.
    const taken: boolean[][] = [];
    const list = [...bars.values()].sort((a, b) => a.from - b.from || b.span - a.span);
    for (const bar of list) {
      let row = 0;
      while (taken[row]?.slice(bar.from, bar.from + bar.span).some(Boolean)) row++;
      taken[row] ??= new Array(7).fill(false);
      taken[row].fill(true, bar.from, bar.from + bar.span);
      bar.row = row;
    }
    return list;
  }

  /** "Jumada II" -> "Jum. II"; a short name stays as it is, and so does an Arabic one (Arabic does not abbreviate). */
  private shortMonth(month: string): string {
    if (isArabic()) return month;
    const [name, ...rest] = month.split(' ');
    const short = name.length > 5 ? `${name.slice(0, 3)}.` : name;
    return [short, ...rest].join(' ');
  }

  // ── The day that was picked ────────────────────────────────────────────────

  readonly selected = computed(() => this.board.focusedDay());

  readonly selectedTitle = computed(() => longDate(this.state.selectedDate()));

  readonly selectedHijri = computed(() =>
    this.board.hijriOn() ? this.board.hijriFull(this.state.selectedDate()) : '');

  /** "Eid al-Fitr · Public holiday in Egypt · Islamic calendar · Day 2 of 3 · Date may vary" */
  summaryOf(mark: OccasionDay): string {
    return occasionSummary(mark.occasion, mark.dayNumber);
  }

  /** The same without the name, for under it. */
  detailOf(mark: OccasionDay): string {
    return occasionDetail(mark.occasion, mark.dayNumber);
  }

  // ── The month at a glance ──────────────────────────────────────────────────

  readonly monthName = computed(() => monthName(this.state.currentMonth()));

  readonly glance = computed(() => {
    const minutes = (day: BoardDay, pick: (chip: CalendarChip) => boolean) => day.chips
      .filter(chip => !chip.allDay && !chip.declined && pick(chip))
      .reduce((sum, chip) => sum + Math.max(0, chip.endMin - chip.startMin), 0);
    const isMeeting = (chip: CalendarChip) => chip.kind === 'Event';
    const isFocus = (chip: CalendarChip) => chip.planned;

    const weeks = this.board.monthWeeks().map(days => ({
      number: weekNumberOfRow(days[0].date),
      meetings: days.reduce((sum, day) => sum + minutes(day, isMeeting), 0),
      focus: days.reduce((sum, day) => sum + minutes(day, isFocus), 0)
    }));
    const inMonth = this.board.monthWeeks().flat().filter(day => day.inMonth);
    const most = Math.max(0, ...weeks.map(week => week.meetings));
    const heaviest = most > 0 ? weeks.find(week => week.meetings === most)! : null;

    let note = t('No meetings this month.');
    if (heaviest) {
      const words = { n: heaviest.number, meetings: this.hours(heaviest.meetings), focus: this.hours(heaviest.focus) };
      note = heaviest.focus
        ? t('Week {n} is your heaviest: {meetings} of meetings. {focus} of focus time is planned in it.', words)
        : t('Week {n} is your heaviest: {meetings} of meetings. No focus time is planned in it yet.', words);
    }

    return {
      meetings: this.hours(inMonth.reduce((sum, day) => sum + minutes(day, isMeeting), 0)),
      focus: this.hours(inMonth.reduce((sum, day) => sum + minutes(day, isFocus), 0)),
      bars: weeks.map(week => ({
        label: t('W{n}', { n: week.number }),
        height: week.meetings ? Math.max(6, Math.round(week.meetings / most * 64)) : 2,
        heaviest: week === heaviest
      })),
      barsLabel: t('Meeting hours per week: {hours}', { hours: listOf(weeks.map(week => this.hours(week.meetings))) }),
      note
    };
  });

  /** 2790 -> "46 h", 90 -> "1.5 h". */
  private hours(minutes: number): string {
    const hours = minutes / 60;
    const shown = hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10;
    return t('{h} h', { h: formatNumber(shown, { maximumFractionDigits: 1, useGrouping: false }) });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  /** A cell shows its day beside the grid. */
  pickDay(day: BoardDay) {
    this.state.clearSelection();
    this.state.selectDate(day.date);
  }

  newEventOn(day: BoardDay) {
    if (this.data.eventsAvailable()) this.actions.newEvent(day.date);
  }

  pick(chip: CalendarChip) {
    this.board.pick(chip);
  }

  openWeek() {
    this.state.chooseView('week');
  }

  toggleHijri() {
    this.prefs.hijriDates.set(!this.prefs.hijriDates());
  }

  /** Bars are placed by the day they start on and the days they cover. */
  barLeft(bar: MonthBar): string {
    return `calc(${bar.from / 7 * 100}% + 6px)`;
  }

  barWidth(bar: MonthBar): string {
    return `calc(${bar.span / 7 * 100}% - 12px)`;
  }
}
