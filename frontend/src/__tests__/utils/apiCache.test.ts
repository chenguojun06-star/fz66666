import { describe, expect, it, beforeEach } from 'vitest';
import { clearApiCache } from '../../utils/api/core';

describe('API Cache Functions', () => {
  beforeEach(() => {
    clearApiCache();
  });

  describe('clearApiCache', () => {
    it('应该存在且可调用', () => {
      expect(typeof clearApiCache).toBe('function');
      expect(() => clearApiCache()).not.toThrow();
    });

    it('应该接受可选的模式参数', () => {
      expect(() => clearApiCache('/system/')).not.toThrow();
    });
  });

  // 注意：其他内部函数（isCacheable, getCacheKey, CACHEABLE_PATTERNS）未导出
  // 这些功能通过实际 API 请求在集成测试中测试更合适
});