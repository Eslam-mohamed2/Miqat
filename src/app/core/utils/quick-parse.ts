/**
 * Reads a sentence typed into quick add ("Sprint review with Omar tomorrow at 3pm
 * for 45 min #Miqat Launch on Meet") in English or Arabic, in the browser.
 *
 * Plain rules, no guessing: a word becomes a coloured part only when it is one of
 * the forms listed here, a person only when the name is one of the user's contacts,
 * and `#Name` only when it is one of their projects or calendars. Everything else
 * stays the title.
 */
import { RecurrencePattern } from '../../models/api.models';
import { t } from '../i18n/i18n';
import { parseArabicDuration, parseEstimate } from './task-estimate';
import { zonedParts } from './time-zone';

/** A calendar day. `month` is 1-12. */
export interface DayRef { year: number; month: number; day: number; }
export interface ClockTime { hour: number; minute: number; }

export interface QuickPerson { id: string; name: string; }
export interface QuickTarget { id: string; name: string; color?: string | null; }

export interface ParseContext {
  /** The moment the sentence is read at. */
  now: Date;
  /** The zone "today" is meant in. */
  zone: string;
  people: QuickPerson[];
  projects: QuickTarget[];
  calendars: QuickTarget[];
}

/**
 * What a stretch of the sentence was understood as. `text` is a title word and
 * `link` a joining word in front of a name ("with"): both are drawn plain.
 */
export type PieceKind = 'text' | 'link' | 'who' | 'when' | 'len' | 'rep' | 'proj' | 'where' | 'prio' | 'cmd';

export interface SentencePiece {
  kind: PieceKind;
  /** Offsets into the typed text. */
  start: number;
  end: number;
  text: string;
  /** For `when`: whether it names the day or the clock time. For `len`: a task estimate (`~30m`). */
  part?: 'day' | 'time' | 'estimate';
}

export type QuickPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface ParsedSentence {
  text: string;
  /** The words and understood parts in order, without the spaces between them. */
  pieces: SentencePiece[];
  title: string;
  people: QuickPerson[];
  /** The person a task is handed to: the one named after "to", "for" or "@". "With Omar" hands nothing over. */
  assignee: QuickPerson | null;
  day: DayRef | null;
  /** "by Sunday": the day is a deadline, so this is a task. */
  deadline: boolean;
  time: ClockTime | null;
  /** "for 45 min", or the length of "3-4pm". */
  minutes: number | null;
  /** `~30m` */
  estimate: number | null;
  priority: QuickPriority | null;
  repeat: { pattern: RecurrencePattern; interval: number } | null;
  project: QuickTarget | null;
  calendar: QuickTarget | null;
  /** "Google Meet", "Zooba" */
  place: string | null;
  /** True when the place is a call rather than somewhere to go. */
  online: boolean;
  /** "g friday", "go to 15 nov": open the calendar on that day instead of creating something. */
  goTo: boolean;
  /**
   * True when something besides plain words was understood and it is enough to
   * act on. A lone "at <place>" does not count: "look at this" is not an event.
   */
  structured: boolean;
}

// ── Text folding ─────────────────────────────────────────────────────────────

/**
 * Lower case, Western digits and one spelling of alef and ya, character for
 * character, so an offset in the folded text is the same offset in the typed one.
 */
function fold(text: string): string {
  let out = '';
  for (const unit of text.split('')) {
    const code = unit.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0);
    else if (unit === 'أ' || unit === 'إ' || unit === 'آ' || unit === 'ٱ') out += 'ا';
    else if (unit === 'ى') out += 'ي';
    else if (unit === 'ة') out += 'ه';
    else {
      const lower = unit.toLowerCase();
      out += lower.length === 1 ? lower : unit;
    }
  }
  return out;
}

const B0 = '(?<![\\p{L}\\p{N}_])';
const B1 = '(?![\\p{L}\\p{N}_])';
const word = (source: string) => new RegExp(`${B0}(?:${source})${B1}`, 'giu');
/** For parts that start with a sign (`#`, `~`, `!`): only after a space or at the start. */
const sign = (source: string) => new RegExp(`(?<!\\S)(?:${source})`, 'giu');

// ── Vocabulary ───────────────────────────────────────────────────────────────

const WEEKDAYS: [RegExp, number][] = [
  [/^(sun|sunday|الاحد|احد|الحد)$/u, 0],
  [/^(mon|monday|الاثنين|الاتنين|اثنين|اتنين)$/u, 1],
  [/^(tue|tues|tuesday|الثلاثاء|الثلاثا|التلات|ثلاثاء|تلات)$/u, 2],
  [/^(wed|weds|wednesday|الاربعاء|الاربع|اربعاء|اربع)$/u, 3],
  [/^(thu|thur|thurs|thursday|الخميس|خميس)$/u, 4],
  [/^(fri|friday|الجمعه|جمعه)$/u, 5],
  [/^(sat|saturday|السبت|سبت)$/u, 6]
];
const WEEKDAY_WORDS =
  'sunday|sun|monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat';
const WEEKDAY_WORDS_AR =
  'الاحد|الحد|الاثنين|الاتنين|الثلاثاء|الثلاثا|التلات|الاربعاء|الاربع|الخميس|الجمعه|السبت';
const WEEKDAY_BARE_AR = 'احد|اثنين|اتنين|ثلاثاء|تلات|اربعاء|اربع|خميس|جمعه|سبت';

// The months as Egypt and the Gulf name them, and as the Levant and Iraq do.
const MONTHS: [RegExp, number][] = [
  [/^(jan|january|يناير|كانون الثاني)$/u, 1], [/^(feb|february|فبراير|شباط)$/u, 2], [/^(mar|march|مارس|اذار)$/u, 3],
  [/^(apr|april|ابريل|نيسان)$/u, 4], [/^(may|مايو|ايار)$/u, 5], [/^(jun|june|يونيو|يونيه|حزيران)$/u, 6],
  [/^(jul|july|يوليو|يوليه|تموز)$/u, 7], [/^(aug|august|اغسطس|اب)$/u, 8],
  [/^(sep|sept|september|سبتمبر|ايلول)$/u, 9], [/^(oct|october|اكتوبر|تشرين الاول)$/u, 10],
  [/^(nov|november|نوفمبر|تشرين الثاني)$/u, 11], [/^(dec|december|ديسمبر|كانون الاول)$/u, 12]
];
const MONTH_WORDS =
  'january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec';
const MONTH_WORDS_AR = 'يناير|فبراير|مارس|ابريل|مايو|يونيو|يونيه|يوليو|يوليه|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر'
  + '|كانون الثاني|كانون الاول|شباط|اذار|نيسان|ايار|حزيران|تموز|اب|ايلول|تشرين الاول|تشرين الثاني';

/** "by", "due", "before" and their Arabic forms make the day a deadline. */
const DEADLINE = 'by|due|before|until|till|قبل|لحد|لغايه|حتي|بحلول';
const DAY_LEAD = `${DEADLINE}|on|this|next|coming|يوم|في`;

/**
 * The tanween of "غدًا", "صباحًا", "مساءً": it is typed before the alef, after it, or
 * not at all. (Folding keeps every character, so the patterns allow for it.)
 */
const TN = '\\u064b?';
/** Any vowel mark left on a word's last letter: "غدٍ", "غدٌ". */
const MARK = '[\u064b-\u0652]';
/** "ًا" at the end of a word, with or without the tanween: "صباحًا", "صباحا". */
const AN = `${TN}ا${TN}`;

const AM_WORDS = `am|a\\.m\\.|الصبح|صباح(?:${AN})?|الفجر|فجر${AN}|ص`;
const PM_WORDS = `pm|p\\.m\\.|بعد الظهر|العصر|عصر${AN}|المغرب|العشاء|العشا|المساء|مساء${TN}|بالليل|الليل|ليل${AN}|م`;
const NOON_WORDS = `الظهر|ظهر${AN}`;

/** "ونصف", "وربع", "وثلث" after an hour, and "إلا ربع", "إلا ثلث" before the next one. */
const PAST_HOUR = 'النصف|نصف|نص|الربع|ربع|الثلث|ثلث';
const TO_HOUR = 'الربع|ربع|الثلث|ثلث';
const HOUR_PART = `(?:\\s+و\\s?(${PAST_HOUR})|\\s+الا\\s+(${TO_HOUR})(?:${AN})?)?`;

const ONLINE: [RegExp, string][] = [
  [/^(google meet|meet|جوجل ميت|قوقل ميت|غوغل ميت|ميت)$/u, 'Google Meet'],
  [/^(zoom|زوم)$/u, 'Zoom'],
  [/^(microsoft teams|ms teams|teams|مايكروسوفت تيمز|تيمز)$/u, 'Microsoft Teams'],
  [/^(skype|سكايب)$/u, 'Skype'],
  [/^(whatsapp|واتساب|واتس اب|واتس)$/u, 'WhatsApp'],
  [/^(facetime|فيس تايم)$/u, 'FaceTime'],
  [/^(the phone|phone|a call|call|التليفون|الهاتف|الموبايل|الجوال|مكالمه هاتفيه|مكالمه)$/u, 'Phone call']
];
const ONLINE_WORDS =
  'google meet|meet|zoom|microsoft teams|ms teams|teams|skype|whatsapp|facetime|the phone|phone|a call|call';
const ONLINE_WORDS_AR = 'جوجل ميت|قوقل ميت|غوغل ميت|ميت|زوم|مايكروسوفت تيمز|تيمز|سكايب|واتساب|واتس اب|واتس|فيس تايم'
  + '|التليفون|الهاتف|الموبايل|الجوال|مكالمه هاتفيه|مكالمه';

/** Places people name without a capital letter. */
const COMMON_PLACES = 'home|work|the office|office|school|the gym|gym|the mosque|mosque|the airport|airport|the club|my place';

/** Joining words in front of a name. They are part of the sentence, not of the title. */
const PERSON_LINKS = new Set(['with', 'and', '&', '+', 'to', 'for', 'cc', 'مع', 'و', 'ل', 'الي']);

/** The joining words that hand a task to the person named. */
const HANDOVER_LINKS = new Set(['to', 'for', 'ل', 'الي']);

// The Arabic words are folded ("ة" reads "ه"): "عاليه" is "عالية", the label the task screens show.
const PRIORITIES: [RegExp, QuickPriority][] = [
  [/^(low|منخفض|منخفضه|بسيط|بسيطه)$/u, 'Low'],
  [/^(medium|med|normal|عادي|عاديه|متوسط|متوسطه)$/u, 'Medium'],
  [/^(high|important|مهم|مهمه|عالي|عاليه)$/u, 'High'],
  [/^(urgent|critical|asap|!+|عاجل|عاجله|ضروري|ضروريه|حرج|حرجه)$/u, 'Critical']
];
const PRIORITY_WORDS_AR =
  'منخفضه|منخفض|بسيطه|بسيط|عاديه|عادي|متوسطه|متوسط|مهمه|مهم|عاليه|عالي|عاجله|عاجل|ضروريه|ضروري|حرجه|حرج';

const SMALL_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/** "يومين", "أسبوعين": two of a unit, in one word (folded). */
const PAIRS: Record<string, RecurrencePattern> = {
  'يومين': 'Daily', 'اسبوعين': 'Weekly', 'شهرين': 'Monthly', 'سنتين': 'Yearly', 'عامين': 'Yearly'
};

/** The unit a repeat is counted in, from its Arabic word in any number ("يوم", "أيام"), folded. */
function arabicUnit(word: string): RecurrencePattern {
  if (/^(يوم|ايام)/u.test(word)) return 'Daily';
  if (/^(اسبوع|اسابيع)/u.test(word)) return 'Weekly';
  if (/^(شهر|شهور|اشهر)/u.test(word)) return 'Monthly';
  return 'Yearly';
}

// ── Days ─────────────────────────────────────────────────────────────────────

export function todayIn(now: Date, zone: string): DayRef {
  const parts = zonedParts(now, zone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function addDays(day: DayRef, count: number): DayRef {
  const date = new Date(Date.UTC(day.year, day.month - 1, day.day + count));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** 0 (Sunday) to 6 (Saturday). */
export function weekdayOf(day: DayRef): number {
  return new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
}

export function sameDay(a: DayRef | null, b: DayRef | null): boolean {
  return !!a && !!b && a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Days from `a` to `b`: positive when `b` is later. */
export function daysBetween(a: DayRef, b: DayRef): number {
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

function lookup<T>(table: [RegExp, T][], text: string): T | null {
  for (const [pattern, value] of table) if (pattern.test(text)) return value;
  return null;
}

/** The next day with that weekday. Today itself only when `allowToday`. */
function upcoming(weekday: number, today: DayRef, allowToday: boolean): DayRef {
  const ahead = (weekday - weekdayOf(today) + 7) % 7;
  return addDays(today, ahead === 0 && !allowToday ? 7 : ahead);
}

/** A day and month with no year: this year, or next year when it has passed. */
function dated(day: number, month: number, year: number | null, today: DayRef): DayRef | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const pick = (y: number) => {
    const date = new Date(Date.UTC(y, month - 1, day));
    return date.getUTCMonth() === month - 1 ? { year: y, month, day } : null;
  };
  if (year !== null) return pick(year < 100 ? 2000 + year : year);
  const thisYear = pick(today.year);
  return thisYear && daysBetween(today, thisYear) >= 0 ? thisYear : pick(today.year + 1);
}

// ── Lengths ──────────────────────────────────────────────────────────────────

/** "45 min", "1h 30m", "an hour and a half", "ساعه ونص" (folded) as minutes. */
function readDuration(text: string): number | null {
  const value = text.trim();
  let m: RegExpExecArray | null;

  if ((m = /^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)(?:\s*(?:and\s+)?(\d+)\s*(?:m|min|mins|minute|minutes))?$/u.exec(value))) {
    return Math.round(Number(m[1]) * 60) + Number(m[2] ?? 0);
  }
  if ((m = /^(\d+)\s*(?:m|min|mins|minute|minutes)$/u.exec(value))) return Number(m[1]);
  if ((m = /^(an?|one|two|three|four|five|six)\s+hours?$/u.exec(value))) return SMALL_NUMBERS[m[1]] * 60;
  if (/^half\s+an?\s+hour$/u.test(value)) return 30;
  if ((m = /^(an?|one|two|three|four|\d+)\s+(?:hours?\s+and\s+a\s+half|and\s+a\s+half\s+hours?)$/u.exec(value))) {
    return (SMALL_NUMBERS[m[1]] ?? Number(m[1])) * 60 + 30;
  }

  // "٤٥ دقيقة", "ساعة ونصف", "ساعتين", "ساعة و٢٠ دقيقة", "نصف ساعة".
  return parseArabicDuration(value);
}

/** Ends of the next few words after `from`, for trying the longest reading first. */
function wordEnds(text: string, from: number, count: number): number[] {
  const ends: number[] = [];
  const pattern = /\S+/gu;
  pattern.lastIndex = from;
  let m: RegExpExecArray | null;
  while (ends.length < count && (m = pattern.exec(text))) ends.push(m.index + m[0].length);
  return ends;
}

// ── Clock times ──────────────────────────────────────────────────────────────

function clock(hourText: string, minuteText: string | undefined, half: string | undefined): ClockTime | null {
  let hour = Number(hourText);
  const minute = Number(minuteText ?? 0);
  if (hour > 23 || minute > 59) return null;

  const period = (half ?? '').replace(/\./g, '');
  if (new RegExp(`^(?:${AM_WORDS})$`, 'u').test(period)) {
    if (hour > 12) return null;
    if (hour === 12) hour = 0;
  } else if (new RegExp(`^(?:${PM_WORDS})$`, 'u').test(period)) {
    if (hour > 12) return null;
    // "12 at night" is midnight; "12 pm" is noon.
    if (hour === 12) hour = /ليل/u.test(period) ? 0 : 12;
    else hour += 12;
  } else if (new RegExp(`^(?:${NOON_WORDS})$`, 'u').test(period)) {
    if (hour >= 1 && hour <= 5) hour += 12;
  } else if (hour >= 1 && hour <= 6) {
    // "at 3" with nothing after it: the afternoon, as people mean it.
    hour += 12;
  }
  return { hour, minute };
}

/** "٣ ونصف" is 3:30 and "٤ إلا ربع" is 3:45: the part of an hour said after it, added to a time on the hour. */
function withHourPart(time: ClockTime | null, past: string | undefined, to: string | undefined): ClockTime | null {
  if (!time || (!past && !to)) return time;
  if (time.minute) return null;
  if (past) return { hour: time.hour, minute: past.endsWith('ربع') ? 15 : past.endsWith('ثلث') ? 20 : 30 };
  return { hour: (time.hour + 23) % 24, minute: to?.endsWith('ربع') ? 45 : 40 };
}

// ── The parser ───────────────────────────────────────────────────────────────

interface Claim { start: number; end: number; kind: PieceKind; part?: SentencePiece['part']; }

export function parseSentence(text: string, context: ParseContext): ParsedSentence {
  const folded = fold(text);
  const today = todayIn(context.now, context.zone);
  const claims: Claim[] = [];
  const taken = new Array<boolean>(text.length).fill(false);

  const result: ParsedSentence = {
    text, pieces: [], title: '', people: [], assignee: null, day: null, deadline: false, time: null, minutes: null,
    estimate: null, priority: null, repeat: null, project: null, calendar: null, place: null,
    online: false, goTo: false, structured: false
  };

  const free = (start: number, end: number) => {
    for (let i = start; i < end; i++) if (taken[i]) return false;
    return end > start;
  };
  const claim = (start: number, end: number, kind: PieceKind, part?: SentencePiece['part']) => {
    for (let i = start; i < end; i++) taken[i] = true;
    claims.push({ start, end, kind, part });
  };
  /** Runs a pattern over the folded text and offers each free match to `take`; a true answer claims it. */
  const scan = (pattern: RegExp, kind: PieceKind, part: SentencePiece['part'] | undefined,
                take: (m: RegExpExecArray) => boolean | number) => {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(folded))) {
      if (!m[0].length) { pattern.lastIndex++; continue; }
      if (!free(m.index, m.index + m[0].length)) continue;
      const answer = take(m);
      if (answer === false) continue;
      // A number answer is where the part really ends (it may run past the match).
      claim(m.index, typeof answer === 'number' ? answer : m.index + m[0].length, kind, part);
    }
  };

  // 1. "g friday", "go to 15 nov": a command, not something to create.
  const go = /^\s*(g|go to|goto|go|اذهب الي|انتقل الي)(?=\s|$)/u.exec(folded);
  if (go && (go[1] !== 'go' || /^\s*go\s*$/u.test(folded))) {
    const start = go[0].length - go[1].length;
    claim(start, go[0].length, 'cmd');
    result.goTo = true;
  }

  // 2. #Project or #Calendar, matched against the real ones.
  const targets = [
    ...context.projects.map(target => ({ target, isProject: true })),
    ...context.calendars.map(target => ({ target, isProject: false }))
  ].map(entry => ({ ...entry, name: fold(entry.target.name).trim() })).filter(entry => entry.name);

  scan(sign('#'), 'proj', undefined, m => {
    if (result.project || result.calendar) return false;
    const from = m.index + 1;
    const typed = folded.slice(from).replace(/_/g, ' ');
    let best: { entry: (typeof targets)[number]; length: number; full: boolean } | null = null;

    for (const entry of targets) {
      let shared = 0;
      while (shared < entry.name.length && shared < typed.length && typed[shared] === entry.name[shared]) shared++;
      const next = typed[shared];
      const stops = next === undefined || /\s/u.test(next);
      const full = shared === entry.name.length && (stops || !/[\p{L}\p{N}]/u.test(next));
      // A shorter spelling counts when the user stopped typing the name there ("#mar").
      const partial = !full && shared >= 2 && stops;
      if (!full && !partial) continue;

      const better = !best
        || (full && !best.full)
        || (full === best.full && shared > best.length)
        || (full === best.full && shared === best.length && entry.name.length < best.entry.name.length);
      if (better) best = { entry, length: shared, full };
    }

    if (!best) return false;
    const end = from + typed.slice(0, best.length).trimEnd().length;
    if (!free(from, end)) return false;
    if (best.entry.isProject) result.project = best.entry.target;
    else result.calendar = best.entry.target;
    return end;
  });

  // 3. Task shorthand: ~30m and !high, in Arabic "~٣٠د", "~ساعة ونصف" and "!عالية".
  const estimateAr = '\\d+(?:\\.\\d+)?\\s?(?:ساعات|ساعه|س)(?:\\s?و?\\s?\\d+\\s?(?:دقيقه|دقائق|دقايق|د))?|\\d+\\s?(?:دقيقه|دقائق|دقايق|د)'
    + '|(?:ساعتين|ساعتان|ساعه)(?:\\s?و\\s?(?:نصف|نص|ربع|ثلث))?|(?:نصف|نص|ربع)\\s+ساعه';
  scan(sign(`~\\s?(\\d+(?:\\.\\d+)?\\s?h(?:\\s?\\d+\\s?m)?|\\d+\\s?m(?:in)?|${estimateAr}|\\d+)(?![\\p{L}\\p{N}])`), 'len', 'estimate', m => {
    const minutes = parseEstimate(m[1].replace(/\s+/g, ' '));
    if (!minutes || result.estimate !== null) return false;
    result.estimate = minutes;
    return true;
  });
  scan(sign(`!(low|medium|med|normal|high|important|urgent|critical|asap|!+|${PRIORITY_WORDS_AR})(?![\\p{L}\\p{N}])`), 'prio', undefined, m => {
    const priority = lookup(PRIORITIES, m[1]);
    if (!priority || result.priority) return false;
    result.priority = priority;
    return true;
  });

  // 4. Repeats: "every Friday", "weekly", "كل جمعه".
  const setRepeat = (pattern: RecurrencePattern, interval = 1) => {
    if (result.repeat) return false;
    result.repeat = { pattern, interval };
    return true;
  };
  scan(word(`every\\s+(?:(\\d+)\\s+)?(days?|weeks?|months?|years?|${WEEKDAY_WORDS})|(daily|weekly|monthly|yearly|annually)`), 'rep', undefined, m => {
    if (m[3]) {
      return setRepeat(m[3] === 'daily' ? 'Daily' : m[3] === 'weekly' ? 'Weekly' : m[3] === 'monthly' ? 'Monthly' : 'Yearly');
    }
    const unit = m[2];
    const weekday = lookup(WEEKDAYS, unit);
    if (weekday !== null) {
      if (!setRepeat('Weekly')) return false;
      if (!result.day) result.day = upcoming(weekday, today, true);
      return true;
    }
    const interval = Math.max(1, Number(m[1] ?? 1));
    return setRepeat(unit.startsWith('day') ? 'Daily' : unit.startsWith('week') ? 'Weekly' : unit.startsWith('month') ? 'Monthly' : 'Yearly', interval);
  });
  // "كل ٣ أيام", "كل أسبوعين": every so many.
  scan(word(`كل\\s+(\\d+)\\s+(ايام|يوم|اسابيع|اسبوع|شهور|اشهر|شهر|سنوات|سنين|سنه|اعوام|عام)|كل\\s+(${Object.keys(PAIRS).join('|')})`), 'rep', undefined, m =>
    m[3] ? setRepeat(PAIRS[m[3]], 2) : setRepeat(arabicUnit(m[2]), Math.max(1, Number(m[1]))));
  scan(word(`كل\\s+(?:يوم\\s+)?(${WEEKDAY_WORDS_AR}|${WEEKDAY_BARE_AR})|كل\\s+(يوم|اسبوع|شهر|سنه|عام)|(يومي|اسبوعي|شهري|سنوي)[\\u064b\\u0651]*ا${TN}`), 'rep', undefined, m => {
    if (m[1]) {
      const weekday = lookup(WEEKDAYS, m[1]);
      if (weekday === null || !setRepeat('Weekly')) return false;
      if (!result.day) result.day = upcoming(weekday, today, true);
      return true;
    }
    return setRepeat(arabicUnit(m[2] ?? m[3]));
  });

  // 5. Days. Written dates first, so "15 nov" is not read as a clock time.
  // "every Friday" names a day too; a day written out replaces it.
  let dayWritten = false;
  const setDay = (day: DayRef | null, lead: string | undefined) => {
    if (!day || dayWritten) return false;
    dayWritten = true;
    result.day = day;
    if (lead && new RegExp(`^(?:${DEADLINE})$`, 'u').test(lead)) result.deadline = true;
    return true;
  };
  const lead = `(?:(${DAY_LEAD})\\s+)?`;

  scan(word(`${lead}(\\d{4})-(\\d{1,2})-(\\d{1,2})`), 'when', 'day', m =>
    setDay(dated(Number(m[4]), Number(m[3]), Number(m[2]), today), m[1]));
  scan(word(`${lead}(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_WORDS}|${MONTH_WORDS_AR})(?:\\s+(\\d{4}))?`), 'when', 'day', m =>
    setDay(dated(Number(m[2]), lookup(MONTHS, m[3]) ?? 0, m[4] ? Number(m[4]) : null, today), m[1]));
  scan(word(`${lead}(${MONTH_WORDS})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`), 'when', 'day', m =>
    setDay(dated(Number(m[3]), lookup(MONTHS, m[2]) ?? 0, m[4] ? Number(m[4]) : null, today), m[1]));
  scan(word(`${lead}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?`), 'when', 'day', m => {
    const first = Number(m[2]);
    const second = Number(m[3]);
    // Day first, as it is written in most of the world; month first only when it cannot be otherwise.
    const [day, month] = second > 12 && first <= 12 ? [second, first] : [first, second];
    return setDay(dated(day, month, m[4] ? Number(m[4]) : null, today), m[1]);
  });

  // 6. Clock times: "at 3pm", "15:00", "3-4pm", "الساعه 3 العصر", "noon".
  const setTime = (time: ClockTime | null) => {
    if (!time || result.time) return false;
    result.time = time;
    return true;
  };
  const half = `(${AM_WORDS}|${PM_WORDS}|${NOON_WORDS})`;
  const untilPart = `(?:\\s*(?:-|–|to|until|till|الي|حتي|ل)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*${half}?)?`;
  // What may stand in front of a time: "at 3pm", "الساعة ٣ م", "من ٣ إلى ٤ م".
  const timeLead = '(?:(?:at|@|from|الساعه|س|من)\\s*)?';

  // "3-4pm": the half of the day is written once, after the end.
  scan(word(`${timeLead}(\\d{1,2})(?::(\\d{2}))?\\s*(?:-|–|to|الي|حتي)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*${half}`), 'when', 'time', m => {
    const end = clock(m[3], m[4], m[5]);
    let start = clock(m[1], m[2], m[5]);
    // "11-1pm" starts in the morning.
    if (start && end && start.hour * 60 + start.minute >= end.hour * 60 + end.minute) start = clock(m[1], m[2], 'am');
    if (!end || !setTime(start)) return false;
    const length = end.hour * 60 + end.minute - (start!.hour * 60 + start!.minute);
    if (length > 0 && result.minutes === null) result.minutes = length;
    return true;
  });
  scan(word(`${timeLead}(\\d{1,2})(?::(\\d{2}))?${HOUR_PART}\\s*${half}${untilPart}`), 'when', 'time', m => {
    const start = withHourPart(clock(m[1], m[2], m[5]), m[3], m[4]);
    if (!setTime(start)) return false;
    readRangeEnd(start!, m[6], m[7], m[8] ?? m[5]);
    return true;
  });
  scan(word(`${timeLead}([01]?\\d|2[0-3]):([0-5]\\d)${untilPart}`), 'when', 'time', m => {
    // "03:30" is written on the 24-hour clock; "3:30" is the afternoon, as people mean it.
    const start = clock(m[1], m[2], m[1].length === 2 && m[1][0] === '0' ? 'am' : undefined);
    if (!setTime(start)) return false;
    readRangeEnd(start!, m[3], m[4], m[5]);
    return true;
  });
  scan(word(`(?:at|@|الساعه)\\s*(\\d{1,2})${HOUR_PART}`), 'when', 'time', m => {
    // "at 3 nov" and "at 3 people" are not times.
    const rest = folded.slice(m.index + m[0].length);
    if (/^\s*(?:\/|\.\d|:)/u.test(rest)) return false;
    return setTime(withHourPart(clock(m[1], undefined, undefined), m[2], m[3]));
  });
  scan(word('(?:at\\s+)?(noon|midday|midnight)'), 'when', 'time', m =>
    setTime(m[1] === 'midnight' ? { hour: 0, minute: 0 } : { hour: 12, minute: 0 }));
  scan(word('منتصف\\s+(الليل|النهار)'), 'when', 'time', m =>
    setTime(m[1] === 'الليل' ? { hour: 0, minute: 0 } : { hour: 12, minute: 0 }));

  function readRangeEnd(start: ClockTime, hour: string | undefined, minute: string | undefined, period: string | undefined) {
    if (!hour || result.minutes !== null) return;
    const end = clock(hour, minute, period);
    if (!end) return;
    const length = end.hour * 60 + end.minute - (start.hour * 60 + start.minute);
    if (length > 0) result.minutes = length;
  }

  // 7. Lengths: "for 45 min", "لمده ساعه", or a bare "45 min".
  scan(word('for|لمده|مده'), 'len', undefined, m => {
    if (result.minutes !== null) return false;
    const after = m.index + m[0].length;
    const gap = /^\s+/u.exec(folded.slice(after));
    if (!gap) return false;
    const from = after + gap[0].length;
    const ends = wordEnds(folded, from, 6);
    for (let count = ends.length; count >= 1; count--) {
      const minutes = readDuration(folded.slice(from, ends[count - 1]));
      if (minutes && free(from, ends[count - 1])) {
        result.minutes = minutes;
        return ends[count - 1];
      }
    }
    return false;
  });
  scan(word('\\d+(?:\\.\\d+)?\\s*(?:hours?|hrs?|h)(?:\\s?\\d+\\s?(?:minutes?|mins?|m))?|\\d+\\s*(?:minutes?|mins?|m)|\\d+\\s*(?:دقيقه|دقايق|دقائق|ساعات|ساعه)'), 'len', undefined, m => {
    const minutes = readDuration(m[0]);
    if (!minutes || result.minutes !== null) return false;
    result.minutes = minutes;
    return true;
  });

  // 8. Day words: today, tomorrow, weekday names, "next week", "in 3 days".
  scan(word(`${lead}(day after tomorrow|today|tonight|tomorrow|tmrw|tmw)`), 'when', 'day', m =>
    setDay(addDays(today, m[2] === 'day after tomorrow' ? 2 : m[2] === 'today' || m[2] === 'tonight' ? 0 : 1), m[1]));
  scan(word(`(?:(${DEADLINE})\\s+)?(?:في\\s+)?(بعد بكره|بعد بكرا|بعد غد(?:${AN}|${MARK})?|اليوم|النهارده|الليله|بكره|بكرا|الغد|غد(?:${AN}|${MARK})?)`), 'when', 'day', m =>
    setDay(addDays(today, m[2].startsWith('بعد') ? 2 : m[2] === 'اليوم' || m[2] === 'النهارده' || m[2] === 'الليله' ? 0 : 1), m[1]));
  scan(word(`(?:(${DEADLINE}|on)\\s+)?(?:(this|next|coming)\\s+)?(${WEEKDAY_WORDS})`), 'when', 'day', m => {
    const weekday = lookup(WEEKDAYS, m[3]);
    // "sat" and "sun" are also words: a short name counts only with "on", "next" or a time beside it.
    if (m[3].length <= 5 && !/day$/u.test(m[3]) && !m[1] && !m[2] && !result.time && !result.goTo) return false;
    return weekday === null ? false : setDay(upcoming(weekday, today, m[2] === 'this' || result.goTo), m[1]);
  });
  scan(word(`(?:(${DEADLINE})\\s+)?(?:في\\s+)?(?:يوم\\s+)?(${WEEKDAY_WORDS_AR})(?:\\s+(?:الجاي|الجايه|القادم|القادمه|المقبل|المقبله))?`), 'when', 'day', m => {
    const weekday = lookup(WEEKDAYS, m[2]);
    return weekday === null ? false : setDay(upcoming(weekday, today, result.goTo), m[1]);
  });
  scan(word(`(?:(${DEADLINE})\\s+)?next week|الاسبوع (?:الجاي|القادم|المقبل)`), 'when', 'day', m =>
    setDay(addDays(today, 7), m[1]));
  scan(word('in\\s+(\\d+|an?|one|two|three|four|five|six)\\s+(days?|weeks?)'), 'when', 'day', m => {
    const count = SMALL_NUMBERS[m[1]] ?? Number(m[1]);
    return setDay(addDays(today, m[2].startsWith('week') ? count * 7 : count), undefined);
  });
  // "بعد ٣ أيام", "بعد يومين", "بعد أسبوع".
  scan(word('بعد\\s+(\\d+)\\s+(ايام|يوم|اسابيع|اسبوع)|بعد\\s+(يومين|اسبوعين|اسبوع)'), 'when', 'day', m => {
    if (m[3]) return setDay(addDays(today, m[3] === 'يومين' ? 2 : m[3] === 'اسبوعين' ? 14 : 7), undefined);
    return setDay(addDays(today, Number(m[1]) * (arabicUnit(m[2]) === 'Weekly' ? 7 : 1)), undefined);
  });

  // 9. Calls: "on Meet", "via Zoom", "علي زوم".
  scan(word(`(?:on|via|over|in)\\s+(${ONLINE_WORDS})|(?:علي|عبر)\\s+(${ONLINE_WORDS_AR})`), 'where', undefined, m => {
    const name = lookup(ONLINE, m[1] ?? m[2]);
    if (!name || result.place) return false;
    // The names of the services are their own; "Phone call" is a sentence of ours.
    result.place = name === 'Phone call' ? t('Phone call') : name;
    result.online = true;
    return true;
  });

  // 10. People, from the user's own contacts.
  const names: { person: QuickPerson; name: string; full: boolean }[] = [];
  for (const person of context.people) {
    const name = fold(person.name).trim().replace(/\s+/g, ' ');
    if (!name) continue;
    names.push({ person, name, full: true });
    const first = name.split(' ')[0];
    if (first !== name && first.length >= 2) names.push({ person, name: first, full: false });
  }
  // Whole names before first names, and longer before shorter.
  names.sort((a, b) => Number(b.full) - Number(a.full) || b.name.length - a.name.length);

  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const entry of names) {
    if (result.people.some(person => person.id === entry.person.id)) continue;
    // Arabic writes "to", "and" and "with" onto the name itself: "لعمر", "وسارة", "بعمر".
    const joined = /^\p{Script=Arabic}/u.test(entry.name) ? '|ل|و|ب' : '';
    const pattern = word(`(@${joined})?${escape(entry.name).replace(/ /g, '\\s+')}`);
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(folded))) {
      const start = m.index;
      const end = start + m[0].length;
      if (!free(start, end)) continue;

      const before = /(\S+)\s+$/u.exec(folded.slice(0, start))?.[1] ?? '';
      const link = m[1] && m[1] !== '@' ? m[1] : before.replace(/[,،]$/u, '');
      const linked = !!m[1] || PERSON_LINKS.has(link);
      const typed = text[start + (m[1] ? 1 : 0)];
      const isFirstWord = !folded.slice(0, start).trim();
      const marked = !isFirstWord && (typed !== typed.toLowerCase() || !/[a-z]/u.test(fold(typed)));
      // After a name already found ("with Omar, Sara"), the next name needs nothing in front.
      const follows = claims.some(c => c.kind === 'who' && /^[\s,،]*(?:and|و|&)?\s*$/u.test(folded.slice(c.end, start)));
      if (!linked && !marked && !follows) continue;

      claim(start, end, 'who');
      result.people.push(entry.person);
      if (!result.assignee && (m[1] === '@' || HANDOVER_LINKS.has(link))) result.assignee = entry.person;
      break;
    }
  }

  // 11. Somewhere to go: "at Zooba", "at the office", "في المكتب".
  if (!result.place) {
    scan(word(`at\\s+(${COMMON_PLACES})`), 'where', undefined, m => {
      if (result.place) return false;
      const name = text.slice(m.index + m[0].length - m[1].length, m.index + m[0].length);
      result.place = name.charAt(0).toUpperCase() + name.slice(1);
      return true;
    });
    scan(word('at|@'), 'where', undefined, m => {
      if (result.place) return false;
      const after = m.index + m[0].length;
      const gap = /^\s+/u.exec(text.slice(after));
      if (!gap) return false;
      const from = after + gap[0].length;
      // Names of places start with a capital; "the" and the like may sit between them.
      let end = from;
      let sawName = false;
      for (const stop of wordEnds(text, from, 5)) {
        const piece = text.slice(end, stop).trim();
        if (!free(end, stop)) break;
        const capital = /^\p{Lu}/u.test(piece);
        const joiner = /^(the|of|al|el|de|&)$/iu.test(piece);
        if (!capital && !(joiner && !sawName)) break;
        if (capital) sawName = true;
        end = stop;
        if (/[,.;]$/u.test(piece)) break;
      }
      if (!sawName) return false;
      result.place = text.slice(from, end).replace(/[,.;]$/u, '');
      return from + result.place.length;
    });
    scan(word('في'), 'where', undefined, m => {
      if (result.place) return false;
      const after = m.index + m[0].length;
      const gap = /^\s+/u.exec(text.slice(after));
      if (!gap) return false;
      const from = after + gap[0].length;
      let end = from;
      for (const stop of wordEnds(text, from, 3)) {
        if (!free(end, stop)) break;
        // "في المكتب مع الفريق": the place ends where the company begins.
        if (end > from && fold(text.slice(end, stop)).trim() === 'مع') break;
        end = stop;
      }
      if (end === from) return false;
      result.place = text.slice(from, end);
      return end;
    });
  }

  // ── Pieces and the title ───────────────────────────────────────────────────
  claims.sort((a, b) => a.start - b.start);
  const pieces: SentencePiece[] = [];
  const addWords = (from: number, to: number) => {
    const pattern = /\S+/gu;
    const stretch = text.slice(from, to);
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(stretch))) {
      pieces.push({ kind: 'text', start: from + m.index, end: from + m.index + m[0].length, text: m[0] });
    }
  };

  let cursor = 0;
  for (const part of claims) {
    addWords(cursor, part.start);
    pieces.push({ kind: part.kind, start: part.start, end: part.end, text: text.slice(part.start, part.end), part: part.part });
    cursor = part.end;
  }
  addWords(cursor, text.length);

  // A joining word right before a name, or between two names, is not part of the title.
  pieces.forEach((piece, index) => {
    if (piece.kind !== 'text') return;
    const next = pieces[index + 1];
    const bare = fold(piece.text).replace(/[,،]$/u, '');
    if (next?.kind === 'who' && PERSON_LINKS.has(bare)) piece.kind = 'link';
  });

  result.pieces = pieces;
  const title = pieces.filter(piece => piece.kind === 'text').map(piece => piece.text).join(' ')
    .replace(/^[\s,،:;-]+|[\s,،:;-]+$/gu, '');
  result.title = /^[a-z]/u.test(title) ? title.charAt(0).toUpperCase() + title.slice(1) : title;

  const strong = result.people.length > 0 || !!result.day || !!result.time || result.minutes !== null
    || result.estimate !== null || !!result.priority || !!result.repeat || !!result.project || !!result.calendar
    || result.online;
  result.structured = strong;
  return result;
}

/** True when the text reads right to left (it has Arabic or Hebrew letters). */
export function isRightToLeft(text: string): boolean {
  return /[֐-׿؀-ۿݐ-ݿࢠ-ࣿ]/u.test(text);
}
