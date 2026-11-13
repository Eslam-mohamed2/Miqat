/**
 * The interface language: English or Arabic, and how digits are drawn in Arabic.
 *
 * English is the source. A sentence is written in English where it is used and
 * looked up in the Arabic dictionary (core/i18n/ar) when the interface is Arabic:
 *
 *   t('Nothing coming up')
 *   t('In {n} min', { n: minutes })              // numbers follow the digit choice
 *   tCount(count, '{n} task', '{n} tasks')       // Arabic has six plural forms
 *   t('Open@@verb')                              // "@@…" tells two meanings apart; it is never shown
 *
 * In a template the same through the pipes of ./t.pipe:
 *
 *   {{ 'Theme' | t }}   [attr.aria-label]="'Close' | t"   {{ count | num }}
 *
 * Dates and numbers go through `Intl` with `locale()`, never with a fixed 'en-US'
 * and never with `undefined` (that follows the device, not the choice made here).
 *
 * The choice is read once, before the app starts (main.ts), and changing it reloads
 * the page. So `t()` may be called anywhere at any time, including in constants,
 * and nothing has to listen for a language change.
 *
 * Plain functions on purpose: utilities and models use them too, not only components.
 */

export type Language = 'en' | 'ar';
/** 'latn' draws 123, 'arab' draws ١٢٣. Only Arabic has the choice. */
export type Numerals = 'latn' | 'arab';

export type Dictionary = Record<string, string>;
/** The forms of one counted phrase, by CLDR plural category. `other` is required. */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}
export type PluralDictionary = Record<string, PluralForms>;
export type Params = Record<string, string | number | null | undefined>;

const STORAGE_PREFIX = 'miqat.pref.';
const LANGUAGE_KEY = 'language';
const NUMERALS_KEY = 'numerals';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const CONTEXT_MARK = '@@';

let language: Language = 'en';
let numerals: Numerals = 'arab';
let dictionary: Dictionary = {};
let plurals: PluralDictionary = {};
let pluralRules: Intl.PluralRules | null = null;

/** English sentences asked for in Arabic that the dictionary does not have. Read by the audit scripts. */
const missing = new Set<string>();

// ── Reading the choice ───────────────────────────────────────────────────────

export function currentLanguage(): Language {
  return language;
}

export function isArabic(): boolean {
  return language === 'ar';
}

export function isRtl(): boolean {
  return language === 'ar';
}

export function direction(): 'ltr' | 'rtl' {
  return language === 'ar' ? 'rtl' : 'ltr';
}

/** The digits in use: always 'latn' in English. */
export function currentNumerals(): Numerals {
  return language === 'ar' ? numerals : 'latn';
}

/** The digit choice as saved, whatever the language (Settings shows it). */
export function savedNumerals(): Numerals {
  return numerals;
}

/**
 * The locale for every `Intl` call and `toLocale…String`.
 * Arabic keeps the Gregorian calendar (Hijri dates are a layer of their own) and
 * carries the digit choice.
 */
export function locale(): string {
  return language === 'ar' ? `ar-u-ca-gregory-nu-${numerals}` : 'en-US';
}

// ── Translating ──────────────────────────────────────────────────────────────

/** The sentence in the interface language. Without a translation the English is shown. */
export function t(text: string, params?: Params): string {
  let out: string;
  if (language === 'en') {
    out = withoutContext(text);
  } else {
    const hit = dictionary[text];
    if (hit === undefined) {
      missing.add(text);
      out = withoutContext(text);
    } else {
      out = hit;
    }
  }
  return params ? fill(out, params) : out;
}

/**
 * A counted phrase. English picks `one` for exactly 1 and `other` for the rest;
 * Arabic picks among its forms, which are listed in the dictionary under `other`.
 * `{n}` is the count in the chosen digits.
 */
export function tCount(count: number, one: string, other: string, params?: Params): string {
  const all: Params = { ...params, n: count };
  if (language === 'en') return fill(count === 1 ? one : other, all);

  const forms = plurals[other];
  if (!forms) {
    missing.add(other);
    return fill(count === 1 ? one : other, all);
  }
  pluralRules ??= new Intl.PluralRules('ar');
  const category = pluralRules.select(count) as keyof PluralForms;
  return fill(forms[category] ?? forms.other, all);
}

/** A whole number or a ready-made string ("09:30", "2026") in the chosen digits. No grouping. */
export function num(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return currentNumerals() === 'arab' ? text.replace(/[0-9]/g, digit => ARABIC_DIGITS[+digit]) : text;
}

/** A number through `Intl.NumberFormat`: grouping, decimals, percent and the like. */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale(), options).format(value);
}

/** Arabic-Indic digits typed by the user back to 0-9, for parsing what was typed. */
export function latinDigits(text: string): string {
  return text.replace(/[٠-٩]/g, digit => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function withoutContext(text: string): string {
  const at = text.indexOf(CONTEXT_MARK);
  return at === -1 ? text : text.slice(0, at);
}

function fill(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    if (!(name in params)) return whole;
    const value = params[name];
    return typeof value === 'number' ? num(value) : isolate(String(value ?? ''));
  });
}

const FIRST_STRONG_ISOLATE = '⁨';
const POP_ISOLATE = '⁩';

/**
 * Latin text (a name, a title, an address) that stands inside an Arabic sentence,
 * kept in its own direction with Unicode isolates. Without them the punctuation
 * and numbers next to it change sides: "Trip 2027!" is drawn as "!Trip 2027".
 * `t()` does this for every text it puts into a gap; English, Arabic text and text
 * that is already isolated come back as they are.
 */
export function isolate(text: string | null | undefined): string {
  const value = text ?? '';
  if (language !== 'ar' || !/[A-Za-z]/.test(value) || value.startsWith(FIRST_STRONG_ISOLATE)) return value;
  return FIRST_STRONG_ISOLATE + value + POP_ISOLATE;
}

// ── Starting and changing ────────────────────────────────────────────────────

/**
 * Reads the saved choice, loads the Arabic dictionary when it is needed and marks
 * the page (`<html lang dir>`). Called once, before the app is loaded.
 */
export async function initI18n(): Promise<void> {
  language = readPref<string>(LANGUAGE_KEY, 'en') === 'ar' ? 'ar' : 'en';
  numerals = readPref<string>(NUMERALS_KEY, 'arab') === 'latn' ? 'latn' : 'arab';

  if (language === 'ar') {
    try {
      const arabic = await import('./ar');
      dictionary = arabic.AR;
      plurals = arabic.AR_PLURALS;
    } catch {
      // The dictionary could not be fetched: English is better than a blank page.
      language = 'en';
    }
  }
  markDocument();
}

/** Saves the language and reloads the page in it. */
export function setLanguage(next: Language): void {
  if (next === language) return;
  writePref(LANGUAGE_KEY, next);
  location.reload();
}

/** Saves the digit style. The page reloads only when it changes what is on screen. */
export function setNumerals(next: Numerals): void {
  if (next === numerals) return;
  writePref(NUMERALS_KEY, next);
  if (language === 'ar') location.reload();
  else numerals = next;
}

function markDocument(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = language;
  root.dir = direction();
  root.dataset['numerals'] = currentNumerals();
}

function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* Private browsing: the choice cannot be kept. */
  }
}

// ── For checks ───────────────────────────────────────────────────────────────

/** English sentences shown untranslated since the page loaded. */
export function missingTranslations(): string[] {
  return [...missing].sort();
}

if (typeof window !== 'undefined') {
  (window as unknown as { __mqMissingTranslations?: () => string[] }).__mqMissingTranslations = missingTranslations;
}

/** Unit tests only: switch language without storage or a reload. */
export function useLanguageForTests(
  next: Language,
  options: { dictionary?: Dictionary; plurals?: PluralDictionary; numerals?: Numerals } = {}
): void {
  language = next;
  numerals = options.numerals ?? 'arab';
  dictionary = options.dictionary ?? {};
  plurals = options.plurals ?? {};
  missing.clear();
}
