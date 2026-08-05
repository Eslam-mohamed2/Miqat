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
 */
export function apiErrorMessage(err: any, fallback = 'Something went wrong. Please try again.'): string {
  if (typeof err === 'string') return err;

  const body = parseErrorBody(err?.error);

  const fieldMessage = firstFieldError(body?.errors);
  if (fieldMessage) return fieldMessage;

  if (typeof body?.message === 'string' && body.message) return body.message;
  if (typeof body?.title === 'string' && body.title) return body.title;

  if (typeof err?.error === 'string' && err.error.trim() && !err.error.trim().startsWith('<')) {
    return err.error.trim();
  }

  if (err?.status === 0) return 'Cannot reach the server. Check your connection and try again.';
  if (err?.status === 401) return 'Your session has expired. Please sign in again.';
  if (err?.status === 403) return 'You do not have permission to do that.';
  if (err?.status === 404) return 'That item no longer exists.';
  if (err?.status === 409) return 'That conflicts with something that already exists.';
  if (err?.status >= 500) return 'The server is currently unavailable. Please try again later.';

  return fallback;
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
