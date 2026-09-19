import { describe, it, expect } from 'vitest';
import { toMoney, toMoneyLocale, toPercent, toPercentRaw, formatMoney } from '../../utils/format';

describe('format工具函数', () => {
  describe('toMoney', () => {
    it('正常数字格式化', () => {
      expect(toMoney(100)).toBe('100.00');
      expect(toMoney(100.5)).toBe('100.50');
      expect(toMoney(100.123)).toBe('100.12');
    });

    it('字符串数字格式化', () => {
      expect(toMoney('100')).toBe('100.00');
      expect(toMoney('100.5')).toBe('100.50');
    });

    it('无效值返回0.00', () => {
      expect(toMoney(null)).toBe('0.00');
      expect(toMoney(undefined)).toBe('0.00');
      expect(toMoney(NaN)).toBe('0.00');
      expect(toMoney('abc')).toBe('0.00');
    });
  });

  describe('toMoneyLocale', () => {
    it('中文本地化格式化', () => {
      expect(toMoneyLocale(1000)).toBe('1,000.00');
      expect(toMoneyLocale(1234567.89)).toBe('1,234,567.89');
    });

    it('无效值返回0.00', () => {
      expect(toMoneyLocale(null)).toBe('0.00');
      expect(toMoneyLocale(undefined)).toBe('0.00');
      expect(toMoneyLocale(NaN)).toBe('0.00');
    });
  });

  describe('toPercent', () => {
    it('乘以100的百分比格式化', () => {
      expect(toPercent(0.1234)).toBe('12.3%');
      expect(toPercent(0.5)).toBe('50.0%');
      expect(toPercent(1)).toBe('100.0%');
    });

    it('自定义小数位数', () => {
      expect(toPercent(0.1234, 2)).toBe('12.34%');
      expect(toPercent(0.1234, 0)).toBe('12%');
    });

    it('无效值返回0%', () => {
      expect(toPercent(null)).toBe('0.0%');
      expect(toPercent(undefined)).toBe('0%');
    });
  });

  describe('toPercentRaw', () => {
    it('直接数字转为百分比（不乘以100）', () => {
      expect(toPercentRaw(12.34)).toBe('12.3%');
      expect(toPercentRaw(50)).toBe('50.0%');
    });

    it('自定义小数位数', () => {
      expect(toPercentRaw(12.34, 2)).toBe('12.34%');
    });

    it('无效值返回0%', () => {
      expect(toPercentRaw(null)).toBe('0.0%');
      expect(toPercentRaw(undefined)).toBe('0%');
    });
  });

  describe('formatMoney', () => {
    it('带人民币符号格式化', () => {
      expect(formatMoney(100)).toBe('¥100.00');
      expect(formatMoney('100.5')).toBe('¥100.50');
    });

    it('无效值返回¥0.00', () => {
      expect(formatMoney(null)).toBe('¥0.00');
      expect(formatMoney(undefined)).toBe('¥0.00');
    });
  });
});
