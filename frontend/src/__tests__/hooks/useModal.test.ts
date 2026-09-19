import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModal } from '../../hooks/useModal';

describe('useModal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应该是一个函数', () => {
    expect(typeof useModal).toBe('function');
  });

  it('应该返回包含所有必要属性和方法的对象', () => {
    const { result } = renderHook(() => useModal<{ id: string; name: string }>());
    
    expect(result.current.visible).toBeDefined();
    expect(result.current.data).toBeDefined();
    expect(result.current.open).toBeDefined();
    expect(result.current.close).toBeDefined();
    expect(result.current.setModalData).toBeDefined();
  });

  describe('初始状态', () => {
    it('初始 visible 应该为 false', () => {
      const { result } = renderHook(() => useModal());
      expect(result.current.visible).toBe(false);
    });

    it('初始 data 应该为 null', () => {
      const { result } = renderHook(() => useModal());
      expect(result.current.data).toBe(null);
    });
  });

  describe('open 方法', () => {
    it('应该设置 visible 为 true', () => {
      const { result } = renderHook(() => useModal());
      
      act(() => {
        result.current.open();
      });
      
      expect(result.current.visible).toBe(true);
    });

    it('应该设置 data 为传入的值', () => {
      const testData = { id: '1', name: 'test' };
      const { result } = renderHook(() => useModal<typeof testData>());
      
      act(() => {
        result.current.open(testData);
      });
      
      expect(result.current.data).toEqual(testData);
    });

    it('应该在不传参数时设置 data 为 null', () => {
      const { result } = renderHook(() => useModal<{ id: string }>());
      
      act(() => {
        result.current.open();
      });
      
      expect(result.current.data).toBe(null);
    });

    it('应该在传入 undefined 时设置 data 为 null', () => {
      const { result } = renderHook(() => useModal<{ id: string }>());
      
      act(() => {
        result.current.open(undefined);
      });
      
      expect(result.current.data).toBe(null);
    });
  });

  describe('close 方法', () => {
    it('应该设置 visible 为 false', () => {
      const { result } = renderHook(() => useModal());
      
      act(() => {
        result.current.open();
      });
      
      expect(result.current.visible).toBe(true);
      
      act(() => {
        result.current.close();
      });
      
      expect(result.current.visible).toBe(false);
    });

    it('应该在关闭后设置 data 为 null', () => {
      const testData = { id: '1', name: 'test' };
      const { result } = renderHook(() => useModal<typeof testData>());

      act(() => {
        result.current.open(testData);
      });

      expect(result.current.data).toEqual(testData);

      act(() => {
        result.current.close();
      });

      expect(result.current.data).toBe(null);
    });

    it('应该处理连续调用 close 的情况', () => {
      const { result } = renderHook(() => useModal());
      
      act(() => {
        result.current.open();
        result.current.close();
        result.current.close();
      });
      
      expect(result.current.visible).toBe(false);
    });
  });

  describe('setModalData 方法', () => {
    it('应该更新 data 值', () => {
      const { result } = renderHook(() => useModal<{ id: string; name: string }>());
      
      act(() => {
        result.current.setModalData({ id: '1', name: 'test' });
      });
      
      expect(result.current.data).toEqual({ id: '1', name: 'test' });
    });

    it('应该接受 null 值', () => {
      const { result } = renderHook(() => useModal<{ id: string }>());
      
      act(() => {
        result.current.setModalData({ id: '1' });
      });
      
      expect(result.current.data).toEqual({ id: '1' });
      
      act(() => {
        result.current.setModalData(null);
      });
      
      expect(result.current.data).toBe(null);
    });
  });

  describe('方法引用稳定性', () => {
    it('open 方法应该保持引用稳定', () => {
      const { result, rerender } = renderHook(() => useModal());
      const firstOpen = result.current.open;
      
      rerender();
      
      expect(result.current.open).toBe(firstOpen);
    });

    it('close 方法应该保持引用稳定', () => {
      const { result, rerender } = renderHook(() => useModal());
      const firstClose = result.current.close;
      
      rerender();
      
      expect(result.current.close).toBe(firstClose);
    });

    it('setModalData 方法应该保持引用稳定', () => {
      const { result, rerender } = renderHook(() => useModal());
      const firstSetModalData = result.current.setModalData;
      
      rerender();
      
      expect(result.current.setModalData).toBe(firstSetModalData);
    });

    it('返回对象应该保持引用稳定（useMemo效果）', () => {
      const { result, rerender } = renderHook(() => useModal());
      const firstResult = result.current;
      
      rerender();
      
      expect(result.current).toBe(firstResult);
    });
  });

  describe('泛型支持', () => {
    it('应该正确支持字符串类型', () => {
      const { result } = renderHook(() => useModal<string>());
      
      act(() => {
        result.current.open('test string');
      });
      
      expect(result.current.data).toBe('test string');
    });

    it('应该正确支持数字类型', () => {
      const { result } = renderHook(() => useModal<number>());
      
      act(() => {
        result.current.open(42);
      });
      
      expect(result.current.data).toBe(42);
    });

    it('应该正确支持复杂对象类型', () => {
      const { result } = renderHook(() => useModal<{ id: string; items: string[]; nested: { value: number } }>());
      
      act(() => {
        result.current.open({ id: '1', items: ['a', 'b'], nested: { value: 10 } });
      });
      
      expect(result.current.data).toEqual({ id: '1', items: ['a', 'b'], nested: { value: 10 } });
    });
  });

  describe('边界条件', () => {
    it('应该处理空对象', () => {
      const { result } = renderHook(() => useModal<Record<string, never>>());
      
      act(() => {
        result.current.open({});
      });
      
      expect(result.current.data).toEqual({});
    });

    it('应该处理 undefined 和 null 的混合使用', () => {
      const { result } = renderHook(() => useModal<{ id?: string }>());
      
      act(() => {
        result.current.open({ id: undefined });
      });
      
      expect(result.current.data).toEqual({ id: undefined });
      
      act(() => {
        result.current.close();
      });
      
      act(() => {
        vi.advanceTimersByTime(300);
      });
      
      expect(result.current.data).toBe(null);
    });
  });
});