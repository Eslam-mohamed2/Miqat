import { isArabic, num, t } from '../i18n/i18n';

/**
 * Turns an HttpErrorResponse into something worth showing a user.
 *
 * The API answers with two different error shapes, and the auth endpoints use
 * `responseType: 'text'`, so the body may also arrive as an unparsed string:
 *   - envelope:       {"success":false,"message":"...","data":null,"errors":null}
 *   - ProblemDetails: {"title":"One or more validation errors occurred.","errors":{"Email":["..."]}}
 *
 * Field-level messages win over generic titles, because "Email is required."
 * helps and "One or more validation errors occurred." does not.
 *
 * The answer is in the interface language: the sentences written here always, the
 * server's own when the Arabic dictionary lists them (see {@link serverMessage}).
 * `fallback` is best handed over already translated (`t('…')`); an English one is
 * looked up here as a last resort.
 */
export function apiErrorMessage(err: any, fallback = t('Something went wrong. Please try again.')): string {
  if (typeof err === 'string') return err;

  const body = parseErrorBody(err?.error);

  const fieldMessage = firstFieldError(body?.errors);
  if (fieldMessage) return serverMessage(fieldMessage);

  if (typeof body?.message === 'string' && body.message) return serverMessage(body.message);
  if (typeof body?.title === 'string' && body.title) return serverMessage(body.title);

  if (typeof err?.error === 'string' && err.error.trim() && !err.error.trim().startsWith('<')) {
    return serverMessage(err.error.trim());
  }

  if (err?.status === 0) return t('Cannot reach the server. Check your connection and try again.');
  if (err?.status === 401) return t('Your session has expired. Please sign in again.');
  if (err?.status === 403) return t('You do not have permission to do that.');
  if (err?.status === 404) return t('That item no longer exists.');
  if (err?.status === 409) return t('That conflicts with something that already exists.');
  if (err?.status >= 500) return t('The server is currently unavailable. Please try again later.');

  // A caller that handed its fallback over in English still gets it looked up.
  return isArabic() && !/\p{Script=Arabic}/u.test(fallback) ? t(fallback) : fallback;
}

/** Server sentences that carry a name or a list: the pattern, the sentence as the dictionary lists it, its gaps. */
const NAMED_SENTENCES: [RegExp, string, string[]][] = [
  [/^(.+) is not online right now\. They will see a missed call\.$/,
    '{name} is not online right now. They will see a missed call.', ['name']],
  [/^(.+) is on another call\. They will see a missed call\.$/,
    '{name} is on another call. They will see a missed call.', ['name']],
  [/^That kind of file cannot be attached\. Allowed: (.+)\.$/,
    'That kind of file cannot be attached. Allowed: {list}.', ['list']]
];

/**
 * A sentence the server wrote in English ("Email already registered."), in the
 * interface language when the Arabic dictionary lists it; otherwise unchanged.
 *
 * A number in the sentence is a gap in the dictionary: "Title cannot exceed 200
 * characters." is listed as "Title cannot exceed {n} characters." (a second
 * number is {n2}, a third {n3}), so one entry serves every limit and the number is
 * drawn in the digits chosen.
 */
export function serverMessage(text: string): string {
  // English shows the server's words untouched; a sentence already in Arabic needs nothing.
  if (!text || !isArabic() || /\p{Script=Arabic}/u.test(text)) return text;
  // "@@" marks a context in the dictionary's keys: no server sentence is listed with one.
  if (text.includes('@@')) return text;

  for (const [pattern, sentence, gaps] of NAMED_SENTENCES) {
    const match = pattern.exec(text);
    if (!match) continue;
    const said = t(sentence);
    if (said === sentence) return text;
    return gaps.reduce((all, gap, index) => all.replace(`{${gap}}`, () => match[index + 1]), said);
  }

  const numbers: string[] = [];
  const key = text.replace(/\d+/g, digits => {
    numbers.push(digits);
    return numbers.length === 1 ? '{n}' : `{n${numbers.length}}`;
  });

  const said = t(key);
  if (said === key) return text;
  return said.replace(/\{n(\d*)\}/g, (whole, index: string) => {
    const value = numbers[index ? Number(index) - 1 : 0];
    return value === undefined ? whole : num(value);
  });
}

function parseErrorBody(error: unknown): any | null {
  if (!error) return null;
  if (typeof error === 'object') return error;
  if (typeof error !== 'string') return null;

  const trimmed = error.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** Handles both `{Email: ["..."]}` (ProblemDetails) and `["..."]` (envelope). */
function firstFieldError(errors: unknown): string {
  if (!errors) return '';
  if (Array.isArray(errors)) {
    return typeof errors[0] === 'string' ? errors[0] : '';
  }
  if (typeof errors === 'object') {
    for (const value of Object.values(errors as Record<string, unknown>)) {
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
      if (typeof value === 'string') return value;
    }
  }
  return '';
}
