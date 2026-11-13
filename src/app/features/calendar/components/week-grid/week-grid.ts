import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, afterNextRender, computed, effect, inject, input,
  signal, untracked
} from '@angular/core';

import { CalendarDataService } from '../../../../core/services/calendar-data.service';
import { CalendarStateService } from '../../../../core/services/calendar-state.service';
import { UserService } from '../../../../core/services/user.service';
import { t } from '../../../../core/i18n/i18n';
import { NumPipe, TPipe } from '../../../../core/i18n/t.pipe';
import { Occasion } from '../../../../core/utils/occasions';
import { browserTimeZone, formatShortTimeInZone, timeZoneLabel } from '../../../../core/utils/time-zone';
import { estimateMinutes } from '../../../../core/utils/task-estimate';
import { BoardDay, CalendarBoard, DEFAULT_BLOCK_MINUTES, DayPrayer } from '../../calendar-board.service';
import { CalendarChip } from '../../calendar-chips';
import { HOUR_PX, PlacedChip, hourLabel, placeDay, zoneCode } from '../../calendar-layout';
import { EventActions } from '../../event-actions.service';
import { OccasionMark } from '../occasion-mark/occasion-mark';

interface GridBlock extends PlacedChip {
  /** One line: the block is too short for a title above a time. */
  compact: boolean;
  /** Room for a two-line title. */
  clamp: boolean;
  /** Room for the time under the title. */
  roomy: boolean;
  /** Planned blocks arrive one after the other. */
  delay: number | null;
  label: string;
}

interface GridColumn {
  day: BoardDay;
  blocks: GridBlock[];
  prayers: (DayPrayer & { top: number })[];
}

/** An all-day item across the days it covers. */
interface DayBar {
  chip: CalendarChip;
  /** 1-based grid column and how many days it spans. */
  column: number;
  span: number;
}

/** A public holiday or an occasion across the days it covers. */
interface OccasionBar {
  occasion: Occasion;
  column: number;
  span: number;
  /** Which of its days the first column shows. */
  dayNumber: number;
}

interface ZoneOption {
  /** null = follow the profile. */
  value: string | null;
  label: string;
  hint: string;
}

const DAY_MINUTES = 24 * 60;
const GRID_HEIGHT = 24 * HOUR_PX;
/** Tasks are dropped on the quarter hour; a new event starts on the half hour. */
const DROP_STEP = 15;
const NEW_EVENT_STEP = 30;

/**
 * The week on a time grid, or one day of it (design/miqat-2.0: Main). A column per
 * day with a Hijri date under it, an all-day row, event blocks, the hatched blocks
 * of planned tasks, prayer times and the now line, and a second column of hours for
 * another time zone.
 */
@Component({
  selector: 'app-week-grid',
  standalone: true,
  imports: [OccasionMark, TPipe, NumPipe],
  templateUrl: './week-grid.html',
  styleUrl: './week-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.single]': 'single()' }
})
export class WeekGrid {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private users = inject(UserService);
  private actions = inject(EventActions);
  readonly state = inject(CalendarStateService);
  readonly data = inject(CalendarDataService);
  readonly board = inject(CalendarBoard);

  /** One day instead of seven. */
  readonly single = input(false);

  readonly gridHeight = GRID_HEIGHT;
  readonly zoneMenuOpen = signal(false);

  /** Where a dragged task would land: shown as a faint block. */
  readonly ghost = signal<{ key: string; top: number; height: number; label: string } | null>(null);

  readonly days = computed<BoardDay[]>(() => this.single() ? [this.board.focusedDay()] : this.board.week());

  readonly columns = computed<GridColumn[]>(() => {
    let planned = 0;
    return this.days().map(day => ({
      day,
      blocks: placeDay(day.chips).map(placed => {
        const { chip, height } = placed;
        return {
          ...placed,
          compact: height < 40,
          clamp: height >= 50,
          roomy: height >= 64 && chip.endMin > chip.startMin,
          delay: chip.planned ? planned++ * 120 + 200 : null,
          label: this.describe(chip, day)
        };
      }),
      prayers: this.board.prayerOn()
        ? this.board.prayersOn(day.date).map(prayer => ({ ...prayer, top: prayer.minute / 60 * HOUR_PX }))
        : []
    }));
  });

  /** All-day items, each as one bar over the days it covers. */
  readonly bars = computed<DayBar[]>(() => {
    const bars = new Map<string, DayBar>();
    this.days().forEach((day, index) => {
      for (const chip of day.chips) {
        if (!chip.allDay) continue;
        const id = `${chip.kind}:${chip.id}:${chip.item.occurrenceStart ?? ''}:${chip.item.start}`;
        const bar = bars.get(id);
        if (bar && bar.column + bar.span === index + 1) bar.span++;
        else if (!bar) bars.set(id, { chip, column: index + 1, span: 1 });
      }
    });
    return [...bars.values()].sort((a, b) => a.column - b.column || b.span - a.span);
  });

  /** Public holidays and occasions, each as one mark over the days of it that are on show. */
  readonly occasionBars = computed<OccasionBar[]>(() => {
    const bars = new Map<string, OccasionBar>();
    this.days().forEach((day, index) => {
      for (const { occasion, dayNumber } of day.occasions) {
        const bar = bars.get(occasion.id);
        if (bar) bar.span++;
        else bars.set(occasion.id, { occasion, column: index + 1, span: 1, dayNumber });
      }
    });
    return [...bars.values()];
  });

  // ── The hour column ────────────────────────────────────────────────────────

  readonly zoneTag = computed(() => zoneCode(this.board.zone()));
  readonly secondTag = computed(() => {
    const zone = this.board.secondZone();
    return zone ? zoneCode(zone) : '';
  });
  /** Width of the hour column: one zone, or two. */
  readonly gutter = computed(() => this.board.secondZone() ? 88 : 52);

  readonly hours = computed(() => {
    const hour24 = this.board.hour24();
    const second = this.board.secondZone();
    const day = this.days()[0].date;

    return Array.from({ length: 23 }, (_, index) => {
      const hour = index + 1;
      return {
        top: hour * HOUR_PX - 7,
        first: hourLabel(hour, hour24),
        second: second ? formatShortTimeInZone(this.board.instantOn(day, hour * 60), second, hour24) : ''
      };
    });
  });

  /** Hour lines, and a dashed one on every half hour. */
  readonly lines = Array.from({ length: 47 }, (_, index) => ({
    half: index % 2 === 0,
    top: (index + 1) * HOUR_PX / 2
  }));

  /** The names at the end of the prayer lines, from today's times when today is on show. */
  readonly prayerTags = computed(() => {
    if (!this.board.prayerOn()) return [];
    const columns = this.columns();
    const reference = columns.find(column => column.day.isToday) ?? columns[0];
    return reference.prayers;
  });

  readonly nowTop = computed(() => this.board.nowMinute() / 60 * HOUR_PX - 4);
  readonly nowLabel = computed(() => t('Now, {time}', { time: this.board.time(this.board.now()) }));

  /** Choices for the zone tag: the profile's zone, this device's, and UTC. */
  readonly zoneOptions = computed<ZoneOption[]>(() => {
    const profile = this.users.timeZone();
    const device = browserTimeZone();
    const options: ZoneOption[] = [{ value: null, label: timeZoneLabel(profile), hint: t('From your profile') }];
    if (device !== profile) options.push({ value: device, label: timeZoneLabel(device), hint: t('This device') });
    if (profile !== 'UTC' && device !== 'UTC') {
      options.push({ value: 'UTC', label: 'UTC', hint: t('Coordinated Universal Time') });
    }
    return options;
  });

  constructor() {
    // Opens an hour before the working day starts, as the design does (08:00 for a 09:00 start).
    afterNextRender(() => this.scrollToWorkDay());
    effect(() => {
      this.single();
      this.board.workStart();
      untracked(() => this.scrollToWorkDay());
    });
  }

  private scrollToWorkDay() {
    const startHour = Math.max(0, Math.floor(this.board.workStart() / 60) - 1);
    this.host.nativeElement.scrollTop = startHour * HOUR_PX;
  }

  /** "Planned: Write the brief, Thursday, 12 November 2026, 10:00 – 11:00, invitation not answered" */
  private describe(chip: CalendarChip, day: BoardDay): string {
    const words = { title: chip.title, day: day.label, time: chip.timeRange };
    const label = chip.planned ? t('Planned: {title}, {day}, {time}', words)
      : chip.kind === 'Task' ? t('Due: {title}, {day}, {time}', words)
      : t('{title}, {day}, {time}', words);
    if (chip.pending) return t('{label}, invitation not answered', { label });
    return chip.declined ? t('{label}, declined', { label }) : label;
  }

  // ── Picking ────────────────────────────────────────────────────────────────

  pick(chip: CalendarChip) {
    this.board.pick(chip);
  }

  /** The day number opens that day on its own. */
  openDay(day: BoardDay) {
    this.state.showDay(day.date, 'day');
  }

  /** A double click on an empty part of a day starts an event there. */
  newEventAt(event: MouseEvent, day: BoardDay) {
    if (event.target !== event.currentTarget || !this.data.eventsAvailable()) return;
    const minute = Math.min(DAY_MINUTES - NEW_EVENT_STEP, this.minuteAt(event, NEW_EVENT_STEP));
    const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    this.actions.newEvent(day.date, time);
  }

  private minuteAt(event: MouseEvent, step: number): number {
    const column = event.currentTarget as HTMLElement;
    const offset = event.clientY - column.getBoundingClientRect().top;
    return Math.max(0, Math.floor(offset / HOUR_PX * 60 / step) * step);
  }

  // ── Dropping a task on a time or a day ─────────────────────────────────────

  /** A planned block can be dragged to another time, like a card from "To plan". */
  dragBlock(event: DragEvent, chip: CalendarChip) {
    const task = chip.planned ? this.board.taskOf(chip.id) : null;
    if (!task) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData('text/plain', task.title);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.board.dragging.set(task);
  }

  endDrag() {
    this.board.dragging.set(null);
    this.ghost.set(null);
  }

  overColumn(event: DragEvent, day: BoardDay) {
    const task = this.board.dragging();
    if (!task) return;
    event.preventDefault();

    const length = estimateMinutes(task) ?? DEFAULT_BLOCK_MINUTES;
    const minute = Math.min(DAY_MINUTES - length, this.minuteAt(event, DROP_STEP));
    const top = minute / 60 * HOUR_PX + 1;
    const current = this.ghost();
    if (current?.key === day.key && current.top === top) return;

    this.ghost.set({
      key: day.key,
      top,
      height: Math.max(24, length / 60 * HOUR_PX - 3),
      label: this.board.time(this.board.instantOn(day.date, minute))
    });
  }

  leaveColumn(event: DragEvent, day: BoardDay) {
    const next = event.relatedTarget as Node | null;
    if (next && (event.currentTarget as HTMLElement).contains(next)) return;
    if (this.ghost()?.key === day.key) this.ghost.set(null);
  }

  dropOnColumn(event: DragEvent, day: BoardDay) {
    const task = this.board.dragging();
    if (!task) return;
    event.preventDefault();

    const length = estimateMinutes(task) ?? DEFAULT_BLOCK_MINUTES;
    const minute = Math.min(DAY_MINUTES - length, this.minuteAt(event, DROP_STEP));
    this.endDrag();
    this.board.planTask(task, this.board.instantOn(day.date, minute));
  }

  /** Over a day's heading: the day is given, the hour is not. */
  overDay(event: DragEvent) {
    if (this.board.dragging()) event.preventDefault();
  }

  dropOnDay(event: DragEvent, day: BoardDay) {
    const task = this.board.dragging();
    if (!task) return;
    event.preventDefault();
    this.endDrag();
    this.board.planTaskOnDay(task, day.date);
  }

  // ── The zone the grid is shown in ──────────────────────────────────────────

  toggleZoneMenu(event: Event) {
    event.stopPropagation();
    this.zoneMenuOpen.update(open => !open);
  }

  chooseZone(option: ZoneOption) {
    this.state.displayZone.set(option.value);
    this.zoneMenuOpen.set(false);
  }

  isZoneActive(option: ZoneOption): boolean {
    return this.state.displayZone() === option.value;
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  closeZoneMenu() {
    if (this.zoneMenuOpen()) this.zoneMenuOpen.set(false);
  }
}
