import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { progressNodeCache, useProgressNodeCache } from '../../hooks/useProgressNodeCache';

vi.mock('@/services/template/templateLibraryApi', () => ({
  templateLibraryApi: {
    progressNodeUnitPrices: vi.fn(),
  },
}));

const mockProgressNodeUnitPrices = vi.hoisted(() => vi.fn());

vi.mock('@/services/template/templateLibraryApi', () => ({
  templateLibraryApi: {
    progressNodeUnitPrices: mockProgressNodeUnitPrices,
  },
}));

describe('useProgressNodeCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    progressNodeCache.invalidate();
  });

  describe('progressNodeCache 全局缓存', () => {
    it('应该正确清除缓存', () => {
      expect(() => progressNodeCache.invalidate()).not.toThrow();
      expect(() => progressNodeCache.invalidate('STYLE001')).not.toThrow();
    });

    it('应该提供 get 方法', () => {
      expect(typeof progressNodeCache.get).toBe('function');
    });

    it('get 应该返回缓存的节点或 undefined', () => {
      expect(progressNodeCache.get('STYLE001')).toBeUndefined();
    });
  });

  describe('useProgressNodeCache hook', () => {
    it('应该是一个函数', () => {
      expect(typeof useProgressNodeCache).toBe('function');
    });

    it('应该返回包含所有必要方法的对象', () => {
      const { result } = renderHook(() => useProgressNodeCache());
      expect(result.current.fetchBatch).toBeDefined();
      expect(result.current.get).toBeDefined();
      expect(result.current.invalidate).toBeDefined();
      expect(result.current.fetchOne).toBeDefined();
    });

    it('返回值应该保持引用稳定（useMemo效果）', () => {
      const { result, rerender } = renderHook(() => useProgressNodeCache());
      const firstResult = result.current;
      rerender();
      expect(result.current).toBe(firstResult);
      expect(result.current.fetchBatch).toBe(firstResult.fetchBatch);
      expect(result.current.get).toBe(firstResult.get);
      expect(result.current.invalidate).toBe(firstResult.invalidate);
    });
  });

  describe('fetchBatch 批量获取', () => {
    it('应该正确处理空数组输入', async () => {
      const { result } = renderHook(() => useProgressNodeCache());
      const resultData = await result.current.fetchBatch([]);
      expect(resultData).toEqual({});
      expect(mockProgressNodeUnitPrices).not.toHaveBeenCalled();
    });

    it('应该正确处理无效styleNo', async () => {
      const { result } = renderHook(() => useProgressNodeCache());
      const resultData = await result.current.fetchBatch(['', '  ', undefined as any, null as any]);
      expect(resultData).toEqual({});
      expect(mockProgressNodeUnitPrices).not.toHaveBeenCalled();
    });

    it('应该正确去重相同的styleNo', async () => {
      mockProgressNodeUnitPrices.mockResolvedValue({ code: 200, data: [{ id: '1', name: '裁剪', unitPrice: 10 }] });
      const { result } = renderHook(() => useProgressNodeCache());
      await result.current.fetchBatch(['STYLE001', 'STYLE001', 'STYLE001']);
      expect(mockProgressNodeUnitPrices).toHaveBeenCalledTimes(1);
    });

    it('应该正确批量获取多个styleNo的数据', async () => {
      mockProgressNodeUnitPrices
        .mockResolvedValueOnce({ code: 200, data: [{ id: '1', name: '裁剪', unitPrice: 10 }] })
        .mockResolvedValueOnce({ code: 200, data: [{ id: '2', name: '车缝', unitPrice: 20 }] });
      
      const { result } = renderHook(() => useProgressNodeCache());
      const resultData = await result.current.fetchBatch(['STYLE001', 'STYLE002']);
      
      expect(mockProgressNodeUnitPrices).toHaveBeenCalledTimes(2);
      expect(mockProgressNodeUnitPrices).toHaveBeenCalledWith('STYLE001');
      expect(mockProgressNodeUnitPrices).toHaveBeenCalledWith('STYLE002');
      expect(resultData['STYLE001']).toBeDefined();
      expect(resultData['STYLE002']).toBeDefined();
    });

    it('应该处理API错误并返回空数组', async () => {
      mockProgressNodeUnitPrices.mockRejectedValue(new Error('API Error'));
      const { result } = renderHook(() => useProgressNodeCache());
      const resultData = await result.current.fetchBatch(['STYLE001']);
      expect(resultData).toEqual({});
    });

    it('应该过滤入库节点', async () => {
      mockProgressNodeUnitPrices.mockResolvedValue({
        code: 200,
        data: [
          { id: '1', name: '裁剪', unitPrice: 10 },
          { id: '2', name: '车缝', unitPrice: 20 },
          { id: '3', name: '入库', unitPrice: 5 },
          { id: '4', name: '成品入库', unitPrice: 8 },
        ],
      });
      
      const { result } = renderHook(() => useProgressNodeCache());
      const resultData = await result.current.fetchBatch(['STYLE001']);
      
      expect(resultData['STYLE001']).toHaveLength(2);
      expect(resultData['STYLE001']).not.toContainEqual(expect.objectContaining({ name: '入库' }));
      expect(resultData['STYLE001']).not.toContainEqual(expect.objectContaining({ name: '成品入库' }));
    });

    it('应该正确规范化节点数据', async () => {
      mockProgressNodeUnitPrices.mockResolvedValue({
        code: 200,
        data: [
          { id: '1', name: ' 裁剪 ', unitPrice: '10', progressStage: ' 01 ' },
          { id: '', name: '车缝', unitPrice: 'abc', progressStage: '' },
          { id: null, name: null, unitPrice: -5 },
        ],
      });
      
      const { result } = renderHook(() => useProgressNodeCache());
      const resultData = await result.current.fetchBatch(['STYLE001']);
      
      expect(resultData['STYLE001']).toHaveLength(2);
      expect(resultData['STYLE001'][0]).toEqual({ id: '1', name: '裁剪', unitPrice: 10, progressStage: '01' });
      expect(resultData['STYLE001'][1]).toEqual({ id: '车缝', name: '车缝', unitPrice: 0, progressStage: undefined });
    });
  });

  describe('get 获取缓存', () => {
    it('应该返回缓存中的节点', async () => {
      mockProgressNodeUnitPrices.mockResolvedValue({ code: 200, data: [{ id: '1', name: '裁剪', unitPrice: 10 }] });
      
      const { result } = renderHook(() => useProgressNodeCache());
      await result.current.fetchBatch(['STYLE001']);
      
      const cached = result.current.get('STYLE001');
      expect(cached).toBeDefined();
      expect(cached).toHaveLength(1);
      expect(cached![0].name).toBe('裁剪');
    });

    it('应该返回undefined当缓存不存在', () => {
      const { result } = renderHook(() => useProgressNodeCache());
      expect(result.current.get('NON_EXISTENT')).toBeUndefined();
    });
  });

  describe('invalidate 清除缓存', () => {
    it('应该清除指定styleNo的缓存', async () => {
      mockProgressNodeUnitPrices.mockResolvedValue({ code: 200, data: [{ id: '1', name: '裁剪', unitPrice: 10 }] });
      
      const { result } = renderHook(() => useProgressNodeCache());
      await result.current.fetchBatch(['STYLE001', 'STYLE002']);
      
      expect(result.current.get('STYLE001')).toBeDefined();
      expect(result.current.get('STYLE002')).toBeDefined();
      
      result.current.invalidate('STYLE001');
      
      expect(result.current.get('STYLE001')).toBeUndefined();
      expect(result.current.get('STYLE002')).toBeDefined();
    });

    it('应该清除所有缓存当不传参数', async () => {
      mockProgressNodeUnitPrices.mockResolvedValue({ code: 200, data: [{ id: '1', name: '裁剪', unitPrice: 10 }] });
      
      const { result } = renderHook(() => useProgressNodeCache());
      await result.current.fetchBatch(['STYLE001', 'STYLE002']);
      
      expect(result.current.get('STYLE001')).toBeDefined();
      expect(result.current.get('STYLE002')).toBeDefined();
      
      result.current.invalidate();
      
      expect(result.current.get('STYLE001')).toBeUndefined();
      expect(result.current.get('STYLE002')).toBeUndefined();
    });
  });

  describe('缓存TTL机制', () => {
    it('应该在TTL内返回缓存数据', async () => {
      mockProgressNodeUnitPrices.mockResolvedValue({ code: 200, data: [{ id: '1', name: '裁剪', unitPrice: 10 }] });
      
      const { result } = renderHook(() => useProgressNodeCache());
      
      await result.current.fetchBatch(['STYLE001']);
      await result.current.fetchBatch(['STYLE001']);
      
      expect(mockProgressNodeUnitPrices).toHaveBeenCalledTimes(1);
    });
  });

  describe('并发请求去重', () => {
    it('应该避免重复请求相同的styleNo', async () => {
      const promise = Promise.resolve({ code: 200, data: [{ id: '1', name: '裁剪', unitPrice: 10 }] });
      mockProgressNodeUnitPrices.mockReturnValue(promise);
      
      const { result } = renderHook(() => useProgressNodeCache());
      
      const [r1, r2] = await Promise.all([
        result.current.fetchBatch(['STYLE001']),
        result.current.fetchBatch(['STYLE001']),
      ]);
      
      expect(mockProgressNodeUnitPrices).toHaveBeenCalledTimes(1);
      expect(r1).toBeDefined();
      expect(r2).toBeDefined();
    });
  });
});