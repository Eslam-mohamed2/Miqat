import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';

import { t } from '../../../../core/i18n/i18n';
import { TPipe } from '../../../../core/i18n/t.pipe';
import { Occasion, occasionKindLabel, occasionSummary } from '../../../../core/utils/occasions';
import { shortDate } from '../../calendar-layout';

const DAY_MS = 86_400_000;

/** Under the mark, or above it where there is no room; aligned to whichever side fits. */
const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 }
];

/**
 * A public holiday or a special occasion in an all-day row: a diamond and a name,
 * with no block around it, so it never reads as one of the user's own events.
 * Hovering names it in full; pressing opens a small card with its kind, country,
 * days and whether the date may still move.
 */
@Component({
  selector: 'app-occasion-mark',
  standalone: true,
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, TPipe],
  templateUrl: './occasion-mark.html',
  styleUrl: './occasion-mark.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.holiday]': 'isHoliday()', '[class.chip]': 'chip()', '[class.stretch]': 'stretch()' }
})
export class OccasionMark {
  readonly occasion = input.required<Occasion>();
  /** Which of its days this mark stands for; 0 when it covers all of them. */
  readonly dayNumber = input(0);
  /** A rounded chip (the phone's all-day row) instead of a line across the days. */
  readonly chip = input(false);
  /** It covers several of the days on show: a hairline runs to the end of the last one. */
  readonly stretch = input(false);

  readonly positions = POSITIONS;
  readonly open = signal(false);

  readonly isHoliday = computed(() => this.occasion().kind === 'holiday');
  readonly summary = computed(() => occasionSummary(this.occasion(), this.dayNumber()));

  /** "Public holiday in Egypt · Islamic calendar" */
  readonly kind = computed(() => {
    const occasion = this.occasion();
    return occasion.country === 'Islamic'
      ? `${occasionKindLabel(occasion)} · ${t('Islamic calendar')}`
      : occasionKindLabel(occasion);
  });

  /** "Tue 9 Mar – Thu 11 Mar 2027 · day 2 of 3", or the one date. */
  readonly dates = computed(() => {
    const occasion = this.occasion();
    const first = new Date(`${occasion.date}T00:00:00Z`).getTime();
    const day = (at: number, withYear: boolean) => shortDate(at, 'UTC', withYear);

    if (occasion.days === 1) return day(first, true);
    const range = `${day(first, false)} – ${day(first + (occasion.days - 1) * DAY_MS, true)}`;
    return this.dayNumber()
      ? `${range} · ${t('day {n} of {total}', { n: this.dayNumber(), total: occasion.days })}`
      : range;
  });

  toggle(event: Event) {
    event.stopPropagation();
    this.open.update(open => !open);
  }

  close() {
    this.open.set(false);
  }

  /** A press on the mark itself is its own toggle, not a press outside the card. */
  pressedOutside(event: MouseEvent, origin: CdkOverlayOrigin) {
    if (!origin.elementRef.nativeElement.contains(event.target as Node)) this.close();
  }

  onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') this.close();
  }
}
