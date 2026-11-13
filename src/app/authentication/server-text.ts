import { apiErrorMessage } from '../core/http/api-error';
import { t } from '../core/i18n/i18n';

/**
 * What went wrong with a request, for the notice above a sign-in form, in the
 * interface language. `fallback` is the English sentence for when the API said
 * nothing of its own; a sentence of the API that the Arabic dictionary does not
 * list stays English (core/http/api-error).
 */
export function authError(err: unknown, fallback: string): string {
  return apiErrorMessage(err, t(fallback));
}

/**
 * What the API itself wrote, in its own English: for the few places that must
 * recognise an answer ("Account is not verified…") whatever the interface language.
 */
export function rawServerAnswer(err: unknown): string {
  const body = (err as { error?: unknown } | null)?.error;
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body ?? '');
  } catch {
    return '';
  }
}
