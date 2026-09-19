import { describe, it, expect } from 'vitest';
import { formatDateTime, formatDateTimeSecond, formatDateTimeCompact, formatDate } from './datetime';

describe('datetime utils', () => {
  describe('formatDateTime', () => {
    it('should format Date object correctly', () => {
      const date = new Date('2024-05-15T14:30:00');
      expect(formatDateTime(date)).toBe('2024-05-15 14:30');
    });

    it('should format date string correctly', () => {
      expect(formatDateTime('2024-05-15 14:30:00')).toBe('2024-05-15 14:30');
      expect(formatDateTime('2024/05/15 09:05')).toBe('2024-05-15 09:05');
    });

    it('should handle null input', () => {
      expect(formatDateTime(null)).toBe('-');
      expect(formatDateTime(undefined)).toBe('-');
    });

    it('should handle empty string', () => {
      expect(formatDateTime('')).toBe('-');
    });

    it('should return raw string for invalid date', () => {
      expect(formatDateTime('invalid-date')).toBe('invalid-date');
    });

    it('should pad single digit month/day/hour/minute', () => {
      const date = new Date('2024-01-05T09:05:00');
      expect(formatDateTime(date)).toBe('2024-01-05 09:05');
    });
  });

  describe('formatDateTimeSecond', () => {
    it('should format with seconds', () => {
      const date = new Date('2024-05-15T14:30:45');
      expect(formatDateTimeSecond(date)).toBe('2024-05-15 14:30:45');
    });

    it('should handle null input', () => {
      expect(formatDateTimeSecond(null)).toBe('-');
    });
  });

  describe('formatDateTimeCompact', () => {
    it('should show month-day when input is date only', () => {
      expect(formatDateTimeCompact('2024-05-15')).toBe('05-15');
      expect(formatDateTimeCompact('2024/05/15')).toBe('05-15');
    });

    it('should show month-day time when input has time', () => {
      const date = new Date('2024-05-15T14:30:00');
      expect(formatDateTimeCompact(date)).toBe('05-15 14:30');
    });

    it('should handle null input', () => {
      expect(formatDateTimeCompact(null)).toBe('-');
    });
  });

  describe('formatDate', () => {
    it('should format date only', () => {
      const date = new Date('2024-05-15T14:30:00');
      expect(formatDate(date)).toBe('2024-05-15');
    });

    it('should parse various date string formats', () => {
      expect(formatDate('2024-05-15')).toBe('2024-05-15');
      expect(formatDate('2024/05/15')).toBe('2024-05-15');
    });

    it('should handle null input', () => {
      expect(formatDate(null)).toBe('-');
    });
  });
});
