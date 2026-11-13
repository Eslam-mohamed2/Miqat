/** Colours offered for a calendar: the design's calendar colours. They are saved with the calendar. */
export const CALENDAR_COLORS = ['#8FBF9F', '#8FB0E0', '#D99AA8', '#B9A7E6', '#D9B26A', '#CDAE72', '#C9C2B4', '#E3907F'];

/** Below this saturation a colour reads as grey, and its hue says little. */
const GREY_BELOW = 0.18;

interface Tone {
  /** 0 to 360. */
  hue: number;
  /** 0 to 1. */
  saturation: number;
}

function toneOf(color: string | null | undefined): Tone | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((color ?? '').trim());
  if (!match) return null;

  const hex = match[1].length === 3 ? match[1].replace(/./g, digit => digit + digit) : match[1];
  const [red, green, blue] = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const spread = max - min;
  if (!spread) return { hue: 0, saturation: 0 };

  const lightness = (max + min) / 2;
  const hue = max === red ? ((green - blue) / spread) % 6
    : max === green ? (blue - red) / spread + 2
    : (red - green) / spread + 4;
  return { hue: (hue * 60 + 360) % 360, saturation: spread / (1 - Math.abs(2 * lightness - 1)) };
}

/**
 * The calendar colour closest to another colour (a Google calendar's, say): the
 * nearest hue, or the palette's neutral for a grey. The first one when the colour
 * cannot be read.
 */
export function nearestCalendarColor(color: string | null | undefined): string {
  const wanted = toneOf(color);
  if (!wanted) return CALENDAR_COLORS[0];

  const palette = CALENDAR_COLORS.map(candidate => ({ candidate, tone: toneOf(candidate)! }));
  if (wanted.saturation < GREY_BELOW) {
    return palette.reduce((best, next) => next.tone.saturation < best.tone.saturation ? next : best).candidate;
  }

  const apart = (hue: number) => Math.min(Math.abs(hue - wanted.hue), 360 - Math.abs(hue - wanted.hue));
  return palette
    .filter(entry => entry.tone.saturation >= GREY_BELOW)
    .reduce((best, next) => apart(next.tone.hue) < apart(best.tone.hue) ? next : best).candidate;
}
