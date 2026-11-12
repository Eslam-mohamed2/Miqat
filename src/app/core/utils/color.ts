/** Dark and light text colours used on top of arbitrary (user-chosen) backgrounds. */
const DARK_TEXT = '#111827';
const LIGHT_TEXT = '#ffffff';

/** Relative luminance of a `#rgb` / `#rrggbb` colour (WCAG definition), or null if it cannot be parsed. */
function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;

  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map(i => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The text colour (dark or white) that reads better on the given background.
 * Projects have user-chosen colours, so text placed on them cannot assume either.
 */
export function readableTextOn(background: string): string {
  const l = luminance(background);
  if (l === null) return LIGHT_TEXT;

  const contrastWithWhite = 1.05 / (l + 0.05);
  const contrastWithDark = (l + 0.05) / (luminance(DARK_TEXT)! + 0.05);
  return contrastWithDark >= contrastWithWhite ? DARK_TEXT : LIGHT_TEXT;
}
