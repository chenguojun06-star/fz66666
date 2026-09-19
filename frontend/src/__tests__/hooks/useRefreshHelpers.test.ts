import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useDebouncedRefresh, useVisibilityRefresh, createPauseableInterval } from '../../hooks/useRefreshHelpers';

describe('useRefreshHelpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 模拟 document
    (global as any).document = {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('useDebouncedRefresh', () => {
    it('应该是一个函数', () => {
      expect(typeof useDebouncedRefresh).toBe('function');
    });
  });

  describe('useVisibilityRefresh', () => {
    it('应该是一个函数', () => {
      expect(typeof useVisibilityRefresh).toBe('function');
    });
  });

  describe('createPauseableInterval', () => {
    it('应该是一个函数', () => {
      expect(typeof createPauseableInterval).toBe('function');
    });

    it('应该返回包含所需方法的对象', () => {
      const interval = createPauseableInterval(() => {}, 1000);
      expect(typeof interval.start).toBe('function');
      expect(typeof interval.stop).toBe('function');
      expect(typeof interval.pause).toBe('function');
      expect(typeof interval.resume).toBe('function');
      expect(typeof interval.autoPauseOnHidden).toBe('function');
    });
  });
});