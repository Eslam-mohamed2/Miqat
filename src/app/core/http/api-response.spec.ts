import { isApiEnvelope, unwrapApiValue } from './api-response';

/**
 * The API wraps payloads in {success, message, data, errors}. These lock in that
 * both the wrapped and the bare shape are handled, so the services keep working
 * whichever one an endpoint returns.
 */
describe('api-response envelope handling', () => {
  const task = { id: '1', title: 'Ship it' };

  describe('unwrapApiValue', () => {
    it('unwraps a list from the envelope', () => {
      expect(unwrapApiValue({ success: true, message: null, data: [task], errors: null })).toEqual([task]);
    });

    it('unwraps an object from the envelope', () => {
      expect(unwrapApiValue({ success: true, message: 'ok', data: task, errors: null })).toEqual(task);
    });

    it('unwraps a primitive from the envelope', () => {
      expect(unwrapApiValue({ success: true, message: null, data: 7, errors: null })).toBe(7);
    });

    it('returns null for an envelope carrying no data', () => {
      expect(unwrapApiValue({ success: false, message: 'boom', data: null, errors: null })).toBeNull();
    });

    it('passes bare responses through untouched', () => {
      expect(unwrapApiValue([task])).toEqual([task]);
      expect(unwrapApiValue(task)).toEqual(task);
      expect(unwrapApiValue([])).toEqual([]);
    });

    it('does not unwrap a DTO that merely has a data field', () => {
      const dto = { id: '9', data: 'payload' };
      expect(unwrapApiValue(dto)).toEqual(dto);
    });

    it('does not unwrap when success is not a boolean', () => {
      const dto = { success: 'yes', data: 'inner' };
      expect(unwrapApiValue(dto as any)).toEqual(dto as any);
    });
  });

  describe('isApiEnvelope', () => {
    it('detects a real envelope', () => {
      expect(isApiEnvelope({ success: true, message: null, data: [], errors: null })).toBe(true);
    });

    it('rejects arrays, plain DTOs and null', () => {
      expect(isApiEnvelope([1, 2])).toBe(false);
      expect(isApiEnvelope(task)).toBe(false);
      expect(isApiEnvelope(null)).toBe(false);
    });
  });
});
