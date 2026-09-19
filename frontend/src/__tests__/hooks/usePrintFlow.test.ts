import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePrintFlow } from '../../modules/production/pages/Production/ProgressDetail/hooks/usePrintFlow';
import type { ProductionOrder } from '@/types/production';

describe('usePrintFlow', () => {
  it('应该是一个函数', () => {
    expect(typeof usePrintFlow).toBe('function');
  });

  it('应该返回包含所有必要属性和方法的对象', () => {
    const { result } = renderHook(() => usePrintFlow());
    
    expect(result.current.printingRecord).toBeDefined();
    expect(result.current.printModalVisible).toBeDefined();
    expect(result.current.setPrintingRecord).toBeDefined();
    expect(result.current.closePrintModal).toBeDefined();
  });

  describe('初始状态', () => {
    it('初始 printingRecord 应该为 null', () => {
      const { result } = renderHook(() => usePrintFlow());
      expect(result.current.printingRecord).toBe(null);
    });

    it('初始 printModalVisible 应该为 false', () => {
      const { result } = renderHook(() => usePrintFlow());
      expect(result.current.printModalVisible).toBe(false);
    });
  });

  describe('setPrintingRecord 方法', () => {
    it('应该设置 printingRecord 并打开打印模态框', () => {
      const testOrder = {
        id: 'order-001',
        orderNo: 'PO202605270001',
        styleNo: 'STYLE001',
        status: 'in_progress' as const,
      } as unknown as ProductionOrder;
      
      const { result } = renderHook(() => usePrintFlow());
      
      act(() => {
        result.current.setPrintingRecord(testOrder);
      });
      
      expect(result.current.printingRecord).toEqual(testOrder);
      expect(result.current.printModalVisible).toBe(true);
    });

    it('应该处理 null 值', () => {
      const { result } = renderHook(() => usePrintFlow());
      
      act(() => {
        result.current.setPrintingRecord(null);
      });
      
      expect(result.current.printingRecord).toBe(null);
      expect(result.current.printModalVisible).toBe(false);
    });

    it('应该处理 undefined 值', () => {
      const { result } = renderHook(() => usePrintFlow());
      
      act(() => {
        result.current.setPrintingRecord(undefined as any);
      });
      
      expect(result.current.printingRecord).toBe(undefined);
      expect(result.current.printModalVisible).toBe(false);
    });
  });

  describe('closePrintModal 方法', () => {
    it('应该关闭打印模态框并清空 printingRecord', () => {
      const testOrder = {
        id: 'order-001',
        orderNo: 'PO202605270001',
      } as unknown as ProductionOrder;
      
      const { result } = renderHook(() => usePrintFlow());
      
      act(() => {
        result.current.setPrintingRecord(testOrder);
      });
      
      expect(result.current.printingRecord).toEqual(testOrder);
      expect(result.current.printModalVisible).toBe(true);
      
      act(() => {
        result.current.closePrintModal();
      });
      
      expect(result.current.printingRecord).toBe(null);
      expect(result.current.printModalVisible).toBe(false);
    });

    it('应该处理已经关闭的状态', () => {
      const { result } = renderHook(() => usePrintFlow());
      
      act(() => {
        result.current.closePrintModal();
      });
      
      expect(result.current.printingRecord).toBe(null);
      expect(result.current.printModalVisible).toBe(false);
    });
  });

  describe('返回值稳定性', () => {
    it('返回对象应该保持引用稳定（useMemo效果）', () => {
      const { result, rerender } = renderHook(() => usePrintFlow());
      const firstResult = result.current;
      
      rerender();
      
      expect(result.current).toBe(firstResult);
    });

    it('setPrintingRecord 方法应该保持引用稳定', () => {
      const { result, rerender } = renderHook(() => usePrintFlow());
      const firstSetPrintingRecord = result.current.setPrintingRecord;
      
      rerender();
      
      expect(result.current.setPrintingRecord).toBe(firstSetPrintingRecord);
    });

    it('closePrintModal 方法应该保持引用稳定', () => {
      const { result, rerender } = renderHook(() => usePrintFlow());
      const firstClosePrintModal = result.current.closePrintModal;
      
      rerender();
      
      expect(result.current.closePrintModal).toBe(firstClosePrintModal);
    });
  });

  describe('边界条件', () => {
    it('应该正确处理空对象订单', () => {
      const { result } = renderHook(() => usePrintFlow());
      
      act(() => {
        result.current.setPrintingRecord({} as unknown as ProductionOrder);
      });
      
      expect(result.current.printingRecord).toEqual({});
      expect(result.current.printModalVisible).toBe(true);
    });

    it('应该正确处理连续设置不同订单', () => {
      const order1 = { id: '1', orderNo: 'PO001' } as unknown as ProductionOrder;
      const order2 = { id: '2', orderNo: 'PO002' } as unknown as ProductionOrder;
      
      const { result } = renderHook(() => usePrintFlow());
      
      act(() => {
        result.current.setPrintingRecord(order1);
      });
      
      expect(result.current.printingRecord).toEqual(order1);
      
      act(() => {
        result.current.setPrintingRecord(order2);
      });
      
      expect(result.current.printingRecord).toEqual(order2);
      expect(result.current.printModalVisible).toBe(true);
    });

    it('应该正确处理关闭后重新打开', () => {
      const order1 = { id: '1', orderNo: 'PO001' } as unknown as ProductionOrder;
      const order2 = { id: '2', orderNo: 'PO002' } as unknown as ProductionOrder;
      
      const { result } = renderHook(() => usePrintFlow());
      
      act(() => {
        result.current.setPrintingRecord(order1);
      });
      
      expect(result.current.printingRecord).toEqual(order1);
      
      act(() => {
        result.current.closePrintModal();
      });
      
      expect(result.current.printingRecord).toBe(null);
      expect(result.current.printModalVisible).toBe(false);
      
      act(() => {
        result.current.setPrintingRecord(order2);
      });
      
      expect(result.current.printingRecord).toEqual(order2);
      expect(result.current.printModalVisible).toBe(true);
    });
  });
});