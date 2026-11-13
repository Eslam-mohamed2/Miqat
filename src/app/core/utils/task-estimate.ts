/**
 * How long a task is expected to take ("45m", "1h 15m" in the design).
 *
 * The API has no field for it, so the estimate is kept among the task's tags as
 * `est:<minutes>` (for example `est:45`). It is saved with the task like any tag,
 * follows it to every device, and is never shown as a tag: use `visibleTags()`
 * wherever tags are listed.
 *
 * What is shown follows the interface language ("45m", in Arabic "٤٥ د"); the tag
 * itself never does.
 */
import { latinDigits, t } from '../i18n/i18n';

const ESTIMATE_TAG = /^est:(\d{1,4})$/i;

function split(tags: string | null | undefined): string[] {
  return (tags ?? '').split(',').map(tag => tag.trim()).filter(Boolean);
}

/** The task's estimate in minutes, or null when none was given. */
export function estimateMinutes(task: { tags?: string | null } | null | undefined): number | null {
  for (const tag of split(task?.tags)) {
    const match = ESTIMATE_TAG.exec(tag);
    if (match) {
      const minutes = Number(match[1]);
      return minutes > 0 ? minutes : null;
    }
  }
  return null;
}

/** The tags to show: everything except the estimate. */
export function visibleTags(tags: string | null | undefined): string[] {
  return split(tags).filter(tag => !ESTIMATE_TAG.test(tag));
}

/** The tag string to save: the given tags with the estimate set, replaced or removed. */
export function withEstimate(tags: string | null | undefined, minutes: number | null): string {
  const kept = visibleTags(tags);
  if (minutes && minutes > 0) kept.push(`est:${Math.round(minutes)}`);
  return kept.join(', ');
}

/** 45 -> "45m", 75 -> "1h 15m", 120 -> "2h". In Arabic "٤٥ د", "١ س ١٥ د", "٢ س". */
export function formatEstimate(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return t('{m}m', { m: rest });
  return rest ? t('{h}h {m}m', { h: hours, m: rest }) : t('{h}h', { h: hours });
}

/** 285 -> "4 h 45 min", 120 -> "2 h" (the spaced form the design uses in sentences and totals). */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return t('{m} min', { m: 0 });
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return t('{m} min', { m: rest });
  return rest ? t('{h} h {m} min', { h: hours, m: rest }) : t('{h} h', { h: hours });
}

/**
 * Reads "30m", "1h", "1h 30m", "1.5h" or "90" (minutes) as minutes; null when it is none of those.
 * The same written in Arabic is read too: "٣٠ د", "ساعة ونصف", "ساعتين", "١ س ٣٠ د", "٩٠".
 */
export function parseEstimate(text: string): number | null {
  const value = latinDigits(text).trim().toLowerCase().replace(/^~/, '').replace(/٫/g, '.');
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value) || null;

  const match = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/.exec(value);
  if (!match || (!match[1] && !match[2])) return parseArabicDuration(value);
  const minutes = Math.round(Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0));
  return minutes > 0 ? minutes : null;
}

// "ة" is also typed "ه", and quick add hands the text over in that spelling.
const ARABIC_ESTIMATE = new RegExp(
  '^(?:(\\d+(?:\\.\\d+)?) ?(?:ساع[ةه]|ساعات|س)|(ساع[ةه])|(ساعتين|ساعتان))?'
  + '(?: ?(?:و ?)?(?:(\\d+) ?(?:دقيق[ةه]|دقائق|دقايق|د)|(نصف|نص|ربع|ثلث)))?$', 'u');

/**
 * A length of time written in Arabic, as minutes: "٣٠ دقيقة", "ساعة", "ساعتين", "٣ ساعات",
 * "ساعة ونصف", "ساعة و٢٠ دقيقة", "نصف ساعة". The digits must already be 0-9. Null for anything else.
 */
export function parseArabicDuration(text: string): number | null {
  // Without tashkeel and tatweel, and with one space between words.
  const value = text.replace(/[ً-ْـ]/g, '').replace(/\s+/g, ' ');
  if (/^(?:نصف|نص) ساع[ةه]$/u.test(value)) return 30;
  if (/^ربع ساع[ةه]$/u.test(value)) return 15;
  if (/^ثلث ساع[ةه]$/u.test(value)) return 20;

  const match = ARABIC_ESTIMATE.exec(value);
  if (!match) return null;
  const hasHours = !!(match[1] || match[2] || match[3]);
  const hours = match[1] ? Number(match[1]) : match[2] ? 1 : match[3] ? 2 : 0;

  let rest = 0;
  if (match[4]) {
    rest = Number(match[4]);
  } else if (match[5]) {
    // "and a half" means something only after the hours.
    if (!hasHours) return null;
    rest = match[5] === 'ربع' ? 15 : match[5] === 'ثلث' ? 20 : 30;
  } else if (!hasHours) {
    return null;
  }

  const minutes = Math.round(hours * 60 + rest);
  return minutes > 0 ? minutes : null;
}
