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

  /**
   * 幂等性：service 层解包后，调用方多包的那层必须变成空操作。
   *
   * <p>不幂等的话，两种约定并存期间任何一侧改动都会造成双重解包，
   * 而双重解包的表现是「恒抛异常 → 被 catch 吞掉 → 数据静默为空」，
   * 线上查起来极其痛苦（这正是收银台白屏那类问题的同款症状）。
   */
  it('幂等：传入已是业务数据时原样返回，不抛错（双重解包为空操作）', () => {
    expect(unwrapApiData({ a: 1 }, 'fallback')).toEqual({ a: 1 });
    expect(unwrapApiData([1, 2, 3], 'fallback')).toEqual([1, 2, 3]);
    expect(unwrapApiData('文本', 'fallback')).toBe('文本');
    expect(unwrapApiData(null, 'fallback')).toBeNull();
    expect(unwrapApiData(0, 'fallback')).toBe(0);
  });

  it('**失败信封仍然必须抛错**（幂等不能削弱错误可见性）', () => {
    expect(() => unwrapApiData({ code: 500, message: '余额不足' }, 'fallback')).toThrow('余额不足');
    expect(() => unwrapApiData({ code: 401, message: 'token已过期' }, 'fallback')).toThrow('token已过期');
  });
});

