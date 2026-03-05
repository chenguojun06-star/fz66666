import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTimeCompact,
  formatDateTime,
  formatDateTimeSecond,
} from './datetime';

describe('datetime utils', () => {
  // ─────────────────── 空值 / null / undefined ───────────────────

  describe('null / undefined / empty → "-"', () => {
    it('formatDateTime returns "-" for null', () => {
      expect(formatDateTime(null)).toBe('-');
    });

    it('formatDateTime returns "-" for undefined', () => {
      expect(formatDateTime(undefined)).toBe('-');
    });

    it('formatDateTime returns "-" for empty string', () => {
      expect(formatDateTime('')).toBe('-');
    });

    it('formatDateTimeSecond returns "-" for null', () => {
      expect(formatDateTimeSecond(null)).toBe('-');
    });

    it('formatDateTimeCompact returns "-" for null', () => {
      expect(formatDateTimeCompact(null)).toBe('-');
    });

    it('formatDate returns "-" for null', () => {
      expect(formatDate(null)).toBe('-');
    });
  });

  // ─────────────────── Date 对象输入 ───────────────────

  describe('Date object input', () => {
    const d = new Date(2024, 0, 15, 9, 5, 30); // 2024-01-15 09:05:30 本地时间

    it('formatDateTime → "yyyy-MM-dd HH:mm"', () => {
      expect(formatDateTime(d)).toBe('2024-01-15 09:05');
    });

    it('formatDateTimeSecond → "yyyy-MM-dd HH:mm:ss"', () => {
      expect(formatDateTimeSecond(d)).toBe('2024-01-15 09:05:30');
    });

    it('formatDateTimeCompact → "MM-dd HH:mm"', () => {
      expect(formatDateTimeCompact(d)).toBe('01-15 09:05');
    });

    it('formatDate → "yyyy-MM-dd"', () => {
      expect(formatDate(d)).toBe('2024-01-15');
    });
  });

  // ─────────────────── 字符串输入 ───────────────────

  describe('string input', () => {
    it('formatDateTime parses "yyyy-MM-dd HH:mm:ss"', () => {
      expect(formatDateTime('2024-03-20 14:30:00')).toBe('2024-03-20 14:30');
    });

    it('formatDateTime parses "yyyy-MM-dd" (time defaults to 00:00)', () => {
      expect(formatDateTime('2024-03-20')).toBe('2024-03-20 00:00');
    });

    it('formatDateTimeSecond parses "yyyy-MM-dd HH:mm:ss"', () => {
      expect(formatDateTimeSecond('2024-03-20 14:30:45')).toBe('2024-03-20 14:30:45');
    });

    it('formatDate parses "yyyy-MM-dd"', () => {
      expect(formatDate('2024-06-01')).toBe('2024-06-01');
    });

    it('returns original string when not parseable as date', () => {
      const raw = 'invalid-date-string';
      expect(formatDateTime(raw)).toBe(raw);
      expect(formatDateTimeSecond(raw)).toBe(raw);
      expect(formatDate(raw)).toBe(raw);
    });
  });

  // ─────────────────── 数字（时间戳）输入 ───────────────────

  describe('number (timestamp) input', () => {
    it('formatDate handles timestamp', () => {
      const ts = new Date(2024, 5, 15).getTime(); // 2024-06-15 00:00:00 本地
      expect(formatDate(ts)).toBe('2024-06-15');
    });

    it('formatDateTime handles timestamp', () => {
      const ts = new Date(2024, 0, 1, 12, 0, 0).getTime();
      expect(formatDateTime(ts)).toBe('2024-01-01 12:00');
    });
  });

  // ─────────────────── 月/日零填充 ───────────────────

  describe('zero-padding months and days', () => {
    it('rounds single-digit month to "01"', () => {
      const d = new Date(2024, 0, 5, 8, 3, 7); // Jan 5
      expect(formatDateTime(d)).toBe('2024-01-05 08:03');
      expect(formatDateTimeSecond(d)).toBe('2024-01-05 08:03:07');
    });
  });
});
