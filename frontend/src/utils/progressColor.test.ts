import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProgressColorStatus, getRemainingDaysDisplay } from './progressColor';

describe('progressColor utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-15T12:00:00'));
  });

  describe('getProgressColorStatus', () => {
    it('should return normal when no plannedEndDate', () => {
      expect(getProgressColorStatus(null)).toBe('normal');
      expect(getProgressColorStatus(undefined)).toBe('normal');
      expect(getProgressColorStatus('')).toBe('normal');
    });

    it('should return normal for closed/completed/scrapped/cancelled/archived orders', () => {
      const futureDate = '2024-12-31';
      expect(getProgressColorStatus(futureDate, 'SCRAPPED')).toBe('normal');
      expect(getProgressColorStatus(futureDate, 'scrapped')).toBe('normal');
      expect(getProgressColorStatus(futureDate, 'CLOSED')).toBe('normal');
      expect(getProgressColorStatus(futureDate, 'closed')).toBe('normal');
      expect(getProgressColorStatus(futureDate, 'ARCHIVED')).toBe('normal');
      expect(getProgressColorStatus(futureDate, 'archived')).toBe('normal');
      expect(getProgressColorStatus(futureDate, 'CANCELLED')).toBe('normal');
      expect(getProgressColorStatus(futureDate, 'cancelled')).toBe('normal');
      expect(getProgressColorStatus(futureDate, 'COMPLETED')).toBe('normal');
      expect(getProgressColorStatus(futureDate, 'completed')).toBe('normal');
    });

    it('should return danger when overdue more than 3 days', () => {
      expect(getProgressColorStatus('2024-05-10')).toBe('danger'); // 5 days ago
      expect(getProgressColorStatus('2024-05-11')).toBe('danger'); // 4 days ago
    });

    it('should return danger when overdue 1-3 days', () => {
      expect(getProgressColorStatus('2024-05-12')).toBe('danger'); // 3 days ago
      expect(getProgressColorStatus('2024-05-13')).toBe('danger'); // 2 days ago
      expect(getProgressColorStatus('2024-05-14')).toBe('danger'); // 1 day ago
    });

    it('should return warning when today or within 1 day', () => {
      expect(getProgressColorStatus('2024-05-15')).toBe('warning'); // today
      expect(getProgressColorStatus('2024-05-16')).toBe('warning'); // 1 day
    });

    it('should return warning when within 2-3 days', () => {
      expect(getProgressColorStatus('2024-05-17')).toBe('warning'); // 2 days
      expect(getProgressColorStatus('2024-05-18')).toBe('warning'); // 3 days
    });

    it('should return normal when more than 3 days away', () => {
      expect(getProgressColorStatus('2024-05-19')).toBe('normal'); // 4 days
      expect(getProgressColorStatus('2024-06-01')).toBe('normal'); // 17 days
    });
  });

  describe('getRemainingDaysDisplay', () => {
    it('should return dash when no endDate', () => {
      expect(getRemainingDaysDisplay(null)).toEqual({ text: '-', color: 'var(--color-text-tertiary)' });
      expect(getRemainingDaysDisplay(undefined)).toEqual({ text: '-', color: 'var(--color-text-tertiary)' });
    });

    it('should return status text for terminal states', () => {
      const endDate = '2024-12-31';
      expect(getRemainingDaysDisplay(endDate, null, null, 'scrapped')).toEqual({
        text: '已报废',
        color: 'var(--color-text-tertiary)',
      });
      expect(getRemainingDaysDisplay(endDate, null, null, 'SCRAPPED')).toEqual({
        text: '已报废',
        color: 'var(--color-text-tertiary)',
      });
      expect(getRemainingDaysDisplay(endDate, null, null, 'closed')).toEqual({
        text: '已关单',
        color: 'var(--color-text-tertiary)',
      });
      expect(getRemainingDaysDisplay(endDate, null, null, 'archived')).toEqual({
        text: '已关单',
        color: 'var(--color-text-tertiary)',
      });
      expect(getRemainingDaysDisplay(endDate, null, null, 'completed')).toEqual({
        text: '已完成',
        color: 'var(--color-success)',
      });
      expect(getRemainingDaysDisplay(endDate, null, null, 'cancelled')).toEqual({
        text: '已取消',
        color: 'var(--color-text-tertiary)',
      });
    });

    it('should show overdue text when past deadline', () => {
      expect(getRemainingDaysDisplay('2024-05-10')).toEqual({
        text: '逾5天',
        color: 'var(--color-danger)',
      });
      expect(getRemainingDaysDisplay('2024-05-14')).toEqual({
        text: '逾1天',
        color: 'var(--color-danger)',
      });
    });

    it('should show 今天 when deadline is today', () => {
      expect(getRemainingDaysDisplay('2024-05-15')).toEqual({
        text: '今天',
        color: 'var(--color-danger)',
      });
    });

    it('should use ratio-based colors when createTime is provided', () => {
      // Total 10 days (5/10 to 5/20), remaining 5 days (50%) - yellow
      expect(getRemainingDaysDisplay('2024-05-20', '2024-05-10')).toEqual({
        text: '5天',
        color: 'var(--color-warning)',
      });
    });

    it('should use fixed thresholds when createTime is not provided', () => {
      // <= 3 days - red
      expect(getRemainingDaysDisplay('2024-05-16')).toEqual({ text: '1天', color: 'var(--color-danger)' });
      expect(getRemainingDaysDisplay('2024-05-17')).toEqual({ text: '2天', color: 'var(--color-danger)' });
      expect(getRemainingDaysDisplay('2024-05-18')).toEqual({ text: '3天', color: 'var(--color-danger)' });

      // 4-7 days - yellow
      expect(getRemainingDaysDisplay('2024-05-19')).toEqual({ text: '4天', color: 'var(--color-warning)' });
      expect(getRemainingDaysDisplay('2024-05-22')).toEqual({ text: '7天', color: 'var(--color-warning)' });

      // >7 days - green
      expect(getRemainingDaysDisplay('2024-05-23')).toEqual({ text: '8天', color: 'var(--color-success)' });
    });
  });
});
