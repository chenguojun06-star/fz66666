import { describe, it, expect } from 'vitest';
import { getProgressColorStatus, getRemainingDaysDisplay } from '../../utils/progressColor';

describe('getProgressColorStatus', () => {
  it('已完成订单返回normal', () => {
    expect(getProgressColorStatus(undefined, 'completed')).toBe('normal');
  });

  it('null输入有返回值', () => {
    const result = getProgressColorStatus(null, null);
    expect(['normal', 'warning', 'danger']).toContain(result);
  });

  it('空字符串有返回值', () => {
    const result = getProgressColorStatus('', '');
    expect(['normal', 'warning', 'danger']).toContain(result);
  });
});

describe('getRemainingDaysDisplay', () => {
  it('null日期有返回值', () => {
    const result = getRemainingDaysDisplay(null);
    expect(result).toBeDefined();
  });

  it('未来日期有返回值', () => {
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const result = getRemainingDaysDisplay(future);
    expect(result).toBeDefined();
  });

  it('过去日期有返回值', () => {
    const past = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const result = getRemainingDaysDisplay(past);
    expect(result).toBeDefined();
  });
});
