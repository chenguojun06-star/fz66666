import { describe, expect, it } from 'vitest';

import { generateRequestId, getApiMessage, isApiSuccess, unwrapApiData } from './api';

describe('api utils', () => {
  it('generateRequestId returns non-empty string', () => {
    const id = generateRequestId();
    expect(typeof id).toBe('string');
    expect(id.trim().length).toBeGreaterThan(0);
  });

  it('isApiSuccess matches code=200', () => {
    expect(isApiSuccess({ code: 200 })).toBe(true);
    expect(isApiSuccess({ code: 500 })).toBe(false);
    expect(isApiSuccess({ code: '200' })).toBe(true);
  });

  it('getApiMessage falls back when message blank', () => {
    expect(getApiMessage({ message: '' }, 'fallback')).toBe('fallback');
    expect(getApiMessage({ message: ' ok ' }, 'fallback')).toBe('ok');
  });

  it('unwrapApiData returns data on success and throws on failure', () => {
    expect(unwrapApiData({ code: 200, data: { a: 1 } }, 'fallback')).toEqual({ a: 1 });
    expect(() => unwrapApiData({ code: 500, message: 'bad' }, 'fallback')).toThrow('bad');
  });
});

