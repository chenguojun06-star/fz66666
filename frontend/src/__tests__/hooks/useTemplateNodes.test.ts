import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTemplateNodes } from '../../modules/production/pages/Production/ProgressDetail/hooks/useTemplateNodes';

const mockGetById = vi.hoisted(() => vi.fn());

vi.mock('@/services/template/templateLibraryApi', () => ({
  templateLibraryApi: {
    getById: mockGetById,
  },
}));

describe('useTemplateNodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该是一个函数', () => {
    expect(typeof useTemplateNodes).toBe('function');
  });

  describe('fetchTemplateNodes', () => {
    it('应该正确处理空templateId', async () => {
      const { result } = renderHook(() => useTemplateNodes({
        setNodes: vi.fn(),
        setProgressNodesByStyleNo: vi.fn(),
      }));
      
      const nodes = await result.current.fetchTemplateNodes('');
      expect(nodes).toEqual([]);
      expect(mockGetById).not.toHaveBeenCalled();
    });

    it('应该正确处理空白templateId', async () => {
      const { result } = renderHook(() => useTemplateNodes({
        setNodes: vi.fn(),
        setProgressNodesByStyleNo: vi.fn(),
      }));
      
      const nodes = await result.current.fetchTemplateNodes('  ');
      expect(nodes).toEqual([]);
      expect(mockGetById).not.toHaveBeenCalled();
    });

    it('应该正确获取模板节点', async () => {
      mockGetById.mockResolvedValue({
        code: 200,
        data: {
          id: 'tpl-001',
          templateContent: JSON.stringify({
            nodes: [
              { id: '1', name: '裁剪', unitPrice: 10 },
              { id: '2', name: '车缝', unitPrice: 20 },
            ],
          }),
        },
      });
      
      const { result } = renderHook(() => useTemplateNodes({
        setNodes: vi.fn(),
        setProgressNodesByStyleNo: vi.fn(),
      }));
      
      const nodes = await result.current.fetchTemplateNodes('tpl-001');
      
      expect(mockGetById).toHaveBeenCalledWith('tpl-001');
      expect(nodes).toHaveLength(2);
      expect(nodes[0].name).toBe('裁剪');
      expect(nodes[1].name).toBe('车缝');
    });

    it('应该处理API返回非200状态码', async () => {
      mockGetById.mockResolvedValue({ code: 500, message: 'Internal Error' });
      
      const { result } = renderHook(() => useTemplateNodes({
        setNodes: vi.fn(),
        setProgressNodesByStyleNo: vi.fn(),
      }));
      
      const nodes = await result.current.fetchTemplateNodes('tpl-001');
      
      expect(nodes).toEqual([]);
    });

    it('应该处理模板内容解析失败', async () => {
      mockGetById.mockResolvedValue({
        code: 200,
        data: {
          id: 'tpl-001',
          templateContent: 'invalid json',
        },
      });
      
      const { result } = renderHook(() => useTemplateNodes({
        setNodes: vi.fn(),
        setProgressNodesByStyleNo: vi.fn(),
      }));
      
      const nodes = await result.current.fetchTemplateNodes('tpl-001');
      
      expect(nodes).toEqual([]);
    });

    it('应该过滤入库节点', async () => {
      mockGetById.mockResolvedValue({
        code: 200,
        data: {
          id: 'tpl-001',
          templateContent: JSON.stringify({
            nodes: [
              { id: '1', name: '裁剪', unitPrice: 10 },
              { id: '2', name: '车缝', unitPrice: 20 },
              { id: '3', name: '出货', unitPrice: 5 },
              { id: '4', name: '发货', unitPrice: 8 },
            ],
          }),
        },
      });
      
      const { result } = renderHook(() => useTemplateNodes({
        setNodes: vi.fn(),
        setProgressNodesByStyleNo: vi.fn(),
      }));
      
      const nodes = await result.current.fetchTemplateNodes('tpl-001');
      
      expect(nodes).toHaveLength(2);
      expect(nodes).not.toContainEqual(expect.objectContaining({ name: '出货' }));
      expect(nodes).not.toContainEqual(expect.objectContaining({ name: '发货' }));
    });
  });

  describe('ensureNodesFromTemplateIfNeeded', () => {
    it('应该正确处理空订单', async () => {
      const setNodes = vi.fn();
      const setProgressNodesByStyleNo = vi.fn();
      
      const { result } = renderHook(() => useTemplateNodes({
        setNodes,
        setProgressNodesByStyleNo,
      }));
      
      await result.current.ensureNodesFromTemplateIfNeeded(null as any);
      
      expect(mockGetById).not.toHaveBeenCalled();
      expect(setNodes).not.toHaveBeenCalled();
      expect(setProgressNodesByStyleNo).not.toHaveBeenCalled();
    });

    it('应该正确处理没有templateId的订单', async () => {
      const setNodes = vi.fn();
      const setProgressNodesByStyleNo = vi.fn();
      
      const { result } = renderHook(() => useTemplateNodes({
        setNodes,
        setProgressNodesByStyleNo,
      }));
      
      await result.current.ensureNodesFromTemplateIfNeeded({
        styleNo: 'STYLE001',
      } as any);
      
      expect(mockGetById).not.toHaveBeenCalled();
      expect(setNodes).not.toHaveBeenCalled();
      expect(setProgressNodesByStyleNo).not.toHaveBeenCalled();
    });

    it('应该正确获取模板节点并更新状态', async () => {
      mockGetById.mockResolvedValue({
        code: 200,
        data: {
          id: 'tpl-001',
          templateContent: JSON.stringify({
            nodes: [
              { id: '1', name: '裁剪', unitPrice: 10 },
            ],
          }),
        },
      });
      
      const setNodes = vi.fn();
      const setProgressNodesByStyleNo = vi.fn();
      
      const { result } = renderHook(() => useTemplateNodes({
        setNodes,
        setProgressNodesByStyleNo,
      }));
      
      await result.current.ensureNodesFromTemplateIfNeeded({
        styleNo: 'STYLE001',
        progressTemplateId: 'tpl-001',
      } as any);
      
      expect(mockGetById).toHaveBeenCalledWith('tpl-001');
      expect(setNodes).toHaveBeenCalled();
      expect(setProgressNodesByStyleNo).toHaveBeenCalled();
    });

    it('应该正确更新progressNodesByStyleNo当order有styleNo', async () => {
      mockGetById.mockResolvedValue({
        code: 200,
        data: {
          id: 'tpl-001',
          templateContent: JSON.stringify({
            nodes: [
              { id: '1', name: '裁剪', unitPrice: 10 },
            ],
          }),
        },
      });
      
      const setNodes = vi.fn();
      const setProgressNodesByStyleNo = vi.fn();
      
      const { result } = renderHook(() => useTemplateNodes({
        setNodes,
        setProgressNodesByStyleNo,
      }));
      
      await result.current.ensureNodesFromTemplateIfNeeded({
        styleNo: 'STYLE001',
        progressTemplateId: 'tpl-001',
      } as any);
      
      expect(setProgressNodesByStyleNo).toHaveBeenCalledWith(expect.any(Function));
    });

    it('应该处理API错误而不抛出异常', async () => {
      mockGetById.mockRejectedValue(new Error('API Error'));
      
      const setNodes = vi.fn();
      const setProgressNodesByStyleNo = vi.fn();
      
      const { result } = renderHook(() => useTemplateNodes({
        setNodes,
        setProgressNodesByStyleNo,
      }));
      
      await expect(result.current.ensureNodesFromTemplateIfNeeded({
        styleNo: 'STYLE001',
        progressTemplateId: 'tpl-001',
      } as any)).resolves.not.toThrow();
      
      expect(setNodes).not.toHaveBeenCalled();
      expect(setProgressNodesByStyleNo).not.toHaveBeenCalled();
    });
  });

  describe('返回值稳定性', () => {
    it('应该保持返回值引用稳定（useMemo效果）', () => {
      const mockSetNodes = vi.fn();
      const mockSetProgressNodesByStyleNo = vi.fn();
      const { result, rerender } = renderHook(() => useTemplateNodes({
        setNodes: mockSetNodes,
        setProgressNodesByStyleNo: mockSetProgressNodesByStyleNo,
      }));
      
      const firstResult = result.current;
      rerender();
      
      expect(result.current.fetchTemplateNodes).toBe(firstResult.fetchTemplateNodes);
      expect(result.current.ensureNodesFromTemplateIfNeeded).toBe(firstResult.ensureNodesFromTemplateIfNeeded);
    });
  });
});