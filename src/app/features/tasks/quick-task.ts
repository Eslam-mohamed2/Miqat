import { latinDigits, locale, t } from '../../core/i18n/i18n';
import { parseEstimate } from '../../core/utils/task-estimate';

/**
 * Reads the shorthand of the "Add a task" row:
 *
 *   Review PR tomorrow ~30m #Backend !high
 *   مراجعة التقرير غدًا ~٣٠د #التسويق !عالية
 *
 * `~30m` is the estimate, `#Backend` the project (the start of its name is enough),
 * `!high` / `!low` the priority, and `today`, `tomorrow` or a weekday the due date.
 * The same words are read in Arabic, with either kind of digits, whatever the
 * interface language is. Whatever is not understood stays in the title.
 */

export type QuickPart = 'due' | 'estimate' | 'project' | 'priority';

export interface QuickProject {
  id: string;
  name: string;
  color?: string | null;
}

export interface QuickTask {
  title: string;
  /** Minutes. */
  estimate: number | null;
  /** The API's value ("High"), not its label. */
  priority: string | null;
  project: QuickProject | null;
  /** Days from today: 0 is today, 1 tomorrow. */
  dueInDays: number | null;
  /** "Today", "Tomorrow" or the weekday's full name, in the interface language. */
  dueLabel: string | null;
  /** A "#name" that matches no project; it stays in the title. */
  unknownProject: string | null;
}

/** Keys are written as `plain()` leaves them: lower case, no tashkeel, one form of alef and of the final letters. */
const PRIORITY_WORDS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium', med: 'Medium', normal: 'Medium',
  high: 'High',
  critical: 'Critical', urgent: 'Critical',

  'منخفضه': 'Low', 'منخفض': 'Low',
  'متوسطه': 'Medium', 'متوسط': 'Medium', 'عاديه': 'Medium', 'عادي': 'Medium',
  'عاليه': 'High', 'عالي': 'High', 'مرتفعه': 'High', 'مرتفع': 'High',
  'عاجله': 'Critical', 'عاجل': 'Critical', 'حرجه': 'Critical', 'حرج': 'Critical'
};

const TODAY_WORDS = new Set(['today', 'اليوم']);
const TOMORROW_WORDS = new Set(['tomorrow', 'غدا', 'بكره']);

/**
 * Arabic weekdays are read only with their article ("الأحد"): without it several
 * of them are everyday words ("أحد" is "anyone").
 */
const WEEKDAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,

  'الاحد': 0,
  'الاثنين': 1,
  'الثلاثاء': 2,
  'الاربعاء': 3,
  'الخميس': 4,
  'الجمعه': 5,
  'السبت': 6
};

/** 1 January 2023 was a Sunday: the days after it give each weekday its name. */
function weekdayName(weekday: number): string {
  return new Intl.DateTimeFormat(locale(), { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2023, 0, 1 + weekday)));
}

/**
 * A word as the tables above list it: lower case, and for Arabic without tashkeel
 * or tatweel, with one form of alef, of teh marbuta and of the final yeh, so that
 * "غدًا", "غداً" and "غدا" are one word.
 */
function plain(word: string): string {
  return word
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

/**
 * @param todayWeekday 0 (Sunday) to 6, in the user's time zone.
 * @param ignore parts the user asked to be read as plain words.
 */
export function parseQuickTask(
  text: string, projects: QuickProject[], todayWeekday: number, ignore: ReadonlySet<QuickPart> = new Set()
): QuickTask {
  const result: QuickTask = {
    title: '', estimate: null, priority: null, project: null,
    dueInDays: null, dueLabel: null, unknownProject: null
  };

  const words = text.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];

  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const lower = plain(word);

    if (word.startsWith('~') && !ignore.has('estimate') && result.estimate === null) {
      // The estimate helper reads Arabic digits and unit letters as well ("~٣٠د", "~١س٣٠د").
      const minutes = parseEstimate(latinDigits(word));
      if (minutes) { result.estimate = minutes; continue; }
    }

    if (word.startsWith('!') && !ignore.has('priority') && !result.priority) {
      // Own keys only: a plain object also answers to "constructor" and the like.
      const typed = lower.slice(1);
      if (Object.hasOwn(PRIORITY_WORDS, typed)) { result.priority = PRIORITY_WORDS[typed]; continue; }
    }

    if (word.startsWith('#') && word.length > 1 && !ignore.has('project') && !result.project) {
      const match = matchProject(words, index, projects);
      if (match) {
        result.project = match.project;
        index += match.extraWords;
        continue;
      }
      result.unknownProject = word.slice(1);
    }

    if (!ignore.has('due') && result.dueInDays === null) {
      if (TODAY_WORDS.has(lower)) { result.dueInDays = 0; result.dueLabel = t('Today'); continue; }
      if (TOMORROW_WORDS.has(lower)) { result.dueInDays = 1; result.dueLabel = t('Tomorrow'); continue; }

      const weekday = Object.hasOwn(WEEKDAY_WORDS, lower) ? WEEKDAY_WORDS[lower] : undefined;
      if (weekday !== undefined) {
        // The next such day; naming today's weekday means a week from now.
        result.dueInDays = ((weekday - todayWeekday + 7) % 7) || 7;
        result.dueLabel = weekdayName(weekday);
        continue;
      }
    }

    kept.push(word);
  }

  result.title = kept.join(' ');
  return result;
}

/**
 * The project a "#name" means. A name of several words can be typed in full
 * ("#Miqat Launch"): the following words are taken while they still fit a name.
 */
function matchProject(
  words: string[], at: number, projects: QuickProject[]
): { project: QuickProject; extraWords: number } | null {
  const fits = (typed: string) => {
    const wanted = plain(typed);
    return projects.filter(project => {
      const name = plain(project.name);
      return name.startsWith(wanted) || name.replace(/\s+/g, '').startsWith(wanted);
    });
  };

  let typed = words[at].slice(1);
  let found = fits(typed);
  if (!found.length) return null;

  let extraWords = 0;
  while (at + extraWords + 1 < words.length) {
    const longer = typed + ' ' + words[at + extraWords + 1];
    const stillFits = fits(longer);
    if (!stillFits.length) break;
    typed = longer;
    found = stillFits;
    extraWords++;
  }

  const exact = found.find(project => plain(project.name) === plain(typed));
  return { project: exact ?? found[0], extraWords };
}
