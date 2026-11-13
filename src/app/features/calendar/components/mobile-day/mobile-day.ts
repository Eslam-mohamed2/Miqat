import {
  ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, effect, inject, output, untracked,
  viewChild
} from '@angular/core';

import { CalendarStateService } from '../../../../core/services/calendar-state.service';
import { t, tCount } from '../../../../core/i18n/i18n';
import { NumPipe, TPipe } from '../../../../core/i18n/t.pipe';
import { UserMenu } from '../../../../layout/user-menu/user-menu';
import { BoardDay, CalendarBoard } from '../../calendar-board.service';
import { CalendarChip } from '../../calendar-chips';
import {
  PHONE_DAY, PHONE_HOUR_PX, countdownLabel, dateWords, dayAndMonth, hourLabel, isolate, joinLink, listOf, placeDay,
  weekdayName
} from '../../calendar-layout';
import { OccasionMark } from '../occasion-mark/occasion-mark';

/**
 * The day at phone width (design/miqat-2.0: V2-MobileDay): the date, the week as
 * a strip of days, what is next, and the day's hours with events, planned blocks,
 * prayer times and the now line.
 */
@Component({
  selector: 'app-mobile-day',
  standalone: true,
  imports: [UserMenu, OccasionMark, TPipe, NumPipe],
  templateUrl: './mobile-day.html',
  styleUrl: './mobile-day.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileDay {
  readonly state = inject(CalendarStateService);
  readonly board = inject(CalendarBoard);

  /** The date was pressed: views, calendars and layers. */
  readonly options = output<void>();

  private readonly timeline = viewChild<ElementRef<HTMLElement>>('timeline');

  readonly gridHeight = 24 * PHONE_HOUR_PX;
  readonly day = computed(() => this.board.focusedDay());

  readonly dayName = computed(() => dateWords(this.state.selectedDate(), { weekday: 'long' })['weekday']);
  readonly dateTitle = computed(() => dayAndMonth(this.state.selectedDate()));

  /** "2 Jumada II 1448 · 4 events, 2 planned tasks" */
  readonly summary = computed(() => {
    const chips = this.day().chips.filter(chip => !chip.declined);
    const events = chips.filter(chip => chip.kind === 'Event').length;
    const planned = chips.filter(chip => chip.planned).length;
    const due = chips.filter(chip => chip.kind === 'Task' && !chip.planned).length;

    const counts = listOf([
      events ? tCount(events, '{n} event', '{n} events') : '',
      planned ? tCount(planned, '{n} planned task', '{n} planned tasks') : '',
      due ? tCount(due, '{n} due', '{n} due') : ''
    ]) || t('Nothing planned');

    return this.board.hijriOn() ? `${this.board.hijriFull(this.state.selectedDate())} · ${counts}` : counts;
  });

  /** The week the day is in, one button per day with how full it is. */
  readonly strip = computed(() => this.board.week().map(day => ({
    day,
    letter: weekdayName(day.date.getDay(), 'narrow'),
    load: Math.min(5, day.count) * 3
  })));

  readonly hours = computed(() => {
    const hour24 = this.board.hour24();
    return Array.from({ length: 24 }, (_, hour) => ({
      top: hour * PHONE_HOUR_PX,
      label: hourLabel(hour, hour24)
    }));
  });

  readonly blocks = computed(() => placeDay(this.day().chips, PHONE_DAY).map(placed => ({
    ...placed,
    compact: (placed.chip.endMin - placed.chip.startMin) / 60 * PHONE_HOUR_PX < 44,
    label: this.describe(placed.chip)
  })));

  readonly allDay = computed(() => this.day().chips.filter(chip => chip.allDay));

  readonly prayers = computed(() => this.board.prayerOn()
    ? this.board.prayersOn(this.day().date).map(prayer => ({ ...prayer, top: prayer.minute / 60 * PHONE_HOUR_PX }))
    : []);

  readonly nowTop = computed(() => this.board.nowMinute() / 60 * PHONE_HOUR_PX - 4);
  readonly nowLabel = computed(() => t('Now, {time}', { time: this.board.time(this.board.now()) }));

  /** What is going on or coming next today, while today is the day on show. */
  readonly next = computed(() => {
    const entry = this.board.nextUp();
    if (!entry || !this.day().isToday) return null;
    const chip = this.day().chips.find(candidate =>
      candidate.kind === 'Event' && candidate.id === entry.id && candidate.item.start === entry.start);
    if (!chip) return null;

    const start = new Date(entry.start).getTime();
    const now = this.board.now().getTime();
    const link = joinLink(entry.location);
    const people = entry.attendeeCount ? tCount(entry.attendeeCount + 1, '{n} person', '{n} people') : '';

    return {
      chip,
      title: start <= now
        ? t('{title} now', { title: isolate(entry.title) })
        : t('{title} in {time}', { title: isolate(entry.title), time: countdownLabel(start - now) }),
      detail: [chip.time, link?.label ?? isolate(entry.location), people].filter(Boolean).join(' · '),
      link
    };
  });

  constructor() {
    // Opens on the current hour today, on the start of the working day otherwise.
    afterNextRender(() => this.scrollToDay());
    effect(() => {
      void this.day().key;
      untracked(() => this.scrollToDay());
    });
  }

  private scrollToDay() {
    const element = this.timeline()?.nativeElement;
    if (!element) return;
    const minute = this.day().isToday ? this.board.nowMinute() : this.board.workStart();
    // The hour's own line sits just above the edge, as in the design.
    element.scrollTop = Math.max(0, Math.floor(minute / 60)) * PHONE_HOUR_PX + 20;
  }

  /** "Planned: Write the brief, 10:00 – 11:00" */
  private describe(chip: CalendarChip): string {
    const words = { title: chip.title, time: chip.timeRange };
    if (chip.planned) return t('Planned: {title}, {time}', words);
    return chip.kind === 'Task' ? t('Due: {title}, {time}', words) : t('{title}, {time}', words);
  }

  selectDay(day: BoardDay) {
    this.state.selectDate(day.date);
  }

  pick(chip: CalendarChip) {
    this.board.pick(chip);
  }
}
