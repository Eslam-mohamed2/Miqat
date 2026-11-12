import { OperatorFunction } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../../models/api.models';

/**
 * The API wraps payloads in an ApiResponse envelope: { success, message, data, errors }.
 * Confirmed on error responses; success responses are assumed to use the same shape.
 *
 * This check is deliberately tolerant so the services keep working either way: an
 * envelope is unwrapped to its `data`, anything else is passed through untouched.
 * No DTO in api.models.ts carries both `success` and `data`, so there is no ambiguity.
 */
export function isApiEnvelope<T>(value: unknown): value is ApiResponse<T> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'data' in value &&
    typeof (value as ApiResponse<T>).success === 'boolean'
  );
}

/** Extracts `data` from an ApiResponse envelope, or returns the value as-is. */
export function unwrapApiValue<T>(value: T | ApiResponse<T>): T {
  return isApiEnvelope<T>(value) ? (value.data as T) : (value as T);
}

/** Pipeable form of {@link unwrapApiValue} for HttpClient streams. */
export function unwrapApi<T>(): OperatorFunction<T | ApiResponse<T>, T> {
  return map((value: T | ApiResponse<T>) => unwrapApiValue<T>(value));
}

/**
 * Same as {@link unwrapApi} but guarantees an array, so a null/absent payload
 * renders as "empty" rather than crashing every *ngFor that consumes it.
 */
export function unwrapApiList<T>(): OperatorFunction<T[] | ApiResponse<T[]>, T[]> {
  return map((value: T[] | ApiResponse<T[]>) => {
    const data = unwrapApiValue<T[]>(value);
    return Array.isArray(data) ? data : [];
  });
}

/**
 * Some endpoints do not return a bare array or the standard envelope — they wrap
 * the collection in a single named property:
 *
 *   GET /api/Friends           -> { "friends": [...] }
 *   GET /api/Friends/pending   -> { "pendingRequests": [...] }
 *   GET /api/Friends/sent      -> { "sentRequests": [...] }
 *   GET /api/Mentions          -> { "mentions": [...] }
 *   GET /api/Mentions/unread   -> { "unreadMentions": [...] }
 *
 * Passing those through unwrapApiList yields an empty array every time, because
 * the payload is neither an array nor an envelope — which is why the friends,
 * pending, sent and mentions lists all rendered as permanently empty.
 *
 * Bare arrays and envelopes still pass through, so this is safe to use even if an
 * endpoint's shape is later normalised.
 */
export function unwrapNamedList<T>(key: string): OperatorFunction<unknown, T[]> {
  return map((value: unknown) => {
    const data = unwrapApiValue<unknown>(value);
    if (Array.isArray(data)) return data as T[];

    if (data && typeof data === 'object') {
      const named = (data as Record<string, unknown>)[key];
      if (Array.isArray(named)) return named as T[];
    }

    return [];
  });
}

/** Same idea for a scalar wrapped in one named property, e.g. `{ unreadCount: 3 }`. */
export function unwrapNamedValue<T>(key: string): OperatorFunction<unknown, T | null> {
  return map((value: unknown) => {
    const data = unwrapApiValue<unknown>(value);
    if (data && typeof data === 'object' && key in (data as Record<string, unknown>)) {
      return (data as Record<string, T>)[key];
    }
    return (data ?? null) as T | null;
  });
}
