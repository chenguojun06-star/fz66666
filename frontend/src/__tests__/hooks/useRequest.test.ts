import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRequest } from '../../hooks/useRequest';
import { checkPermissionRequirement } from '@/utils/api/permissionGuard';

vi.mock('antd', () => ({
  App: {
    useApp: () => ({ message: { success: vi.fn(), error: vi.fn() } }),
  },
}));

vi.mock('@/utils/AuthContext', () => ({
  useUser: () => ({ user: { tenantId: 1, permissions: ['all'] } }),
}));

vi.mock('@/utils/api/permissionGuard', () => ({
  checkPermissionRequirement: vi.fn(() => ({ allowed: true })),
}));

describe('useRequest', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('应该返回正确的初始状态', () => {
    const mockFn = vi.fn().mockResolvedValue({ data: 'test' });
    const { result } = renderHook(() => useRequest(mockFn, { manual: true }));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
    expect(typeof result.current.run).toBe('function');
    expect(typeof result.current.refresh).toBe('function');
  });

  it('应该在非手动模式下自动执行请求', async () => {
    const mockFn = vi.fn().mockResolvedValue({ data: 'test' });
    const { result } = renderHook(() => useRequest(mockFn));

    expect(result.current.loading).toBe(true);
    
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('应该在手动模式下不自动执行', () => {
    const mockFn = vi.fn().mockResolvedValue({ data: 'test' });
    renderHook(() => useRequest(mockFn, { manual: true }));

    expect(mockFn).not.toHaveBeenCalled();
  });

  it('应该正确处理成功响应', async () => {
    const mockFn = vi.fn().mockResolvedValue({ id: 1, name: 'test' });
    const { result } = renderHook(() => useRequest(mockFn, { manual: true }));

    await act(async () => {
      await result.current.run();
    });

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual({ id: 1, name: 'test' });
    expect(result.current.error).toBeUndefined();
  });

  it('应该正确处理错误响应', async () => {
    const errorMsg = '请求失败';
    const mockFn = vi.fn().mockRejectedValue(new Error(errorMsg));
    const { result } = renderHook(() => useRequest(mockFn, { manual: true }));

    await act(async () => {
      try {
        await result.current.run();
      } catch {
        // 预期会抛出错误
      }
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeDefined();
    expect(result.current.error?.message).toBe(errorMsg);
  });

  it('应该正确处理字符串响应（成功消息）', async () => {
    const successMsg = '操作成功';
    const mockFn = vi.fn().mockResolvedValue(successMsg);
    const { result } = renderHook(() => useRequest(mockFn, { manual: true }));

    await act(async () => {
      await result.current.run();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  describe('缓存功能', () => {
    it('应该在缓存命中时返回缓存数据', async () => {
      const mockFn = vi.fn().mockResolvedValue({ id: 1, name: 'test' });
      const { result, rerender } = renderHook((props) => 
        useRequest(mockFn, { manual: true, cache: true, cacheKey: 'test-cache', ...(props as Record<string, unknown>) })
      );

      await act(async () => {
        await result.current.run();
      });
      expect(mockFn).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.run();
      });
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('应该在缓存过期后重新请求', async () => {
      const mockFn = vi.fn().mockResolvedValue({ id: 1, name: 'test' });
      const { result } = renderHook(() => 
        useRequest(mockFn, { manual: true, cache: true, cacheKey: 'test-cache-expire', cacheTTL: 100 })
      );

      await act(async () => {
        await result.current.run();
      });
      expect(mockFn).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(150);
        await result.current.run();
      });
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('refresh方法应该清除缓存', async () => {
      const mockFn = vi.fn().mockResolvedValue({ id: 1, name: 'test' });
      const { result } = renderHook(() => 
        useRequest(mockFn, { manual: true, cache: true, cacheKey: 'test-cache-refresh' })
      );

      await act(async () => {
        await result.current.run();
      });
      expect(mockFn).toHaveBeenCalledTimes(1);

      await act(async () => {
        await result.current.refresh();
      });
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('权限校验', () => {
    it('应该在设置权限参数时进行权限校验', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: 'test' });
      const checkPermissionMock = vi.fn(() => ({ allowed: true }));
      
      const { result } = renderHook(() => {
        vi.mocked(checkPermissionRequirement).mockImplementation(checkPermissionMock);
        return useRequest(mockFn, { manual: true, permission: 'TEST_PERMISSION' });
      });

      await act(async () => {
        await result.current.run();
      });

      expect(checkPermissionMock).toHaveBeenCalled();
      expect(mockFn).toHaveBeenCalled();
    });
  });

  describe('回调函数', () => {
    it('应该在成功时调用onSuccess', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: 'test' });
      const onSuccess = vi.fn();
      
      const { result } = renderHook(() => 
        useRequest(mockFn, { manual: true, onSuccess })
      );

      await act(async () => {
        await result.current.run();
      });

      expect(onSuccess).toHaveBeenCalledWith({ data: 'test' });
    });

    it('应该在失败时调用onError', async () => {
      const error = new Error('test error');
      const mockFn = vi.fn().mockRejectedValue(error);
      const onError = vi.fn();
      
      const { result } = renderHook(() => 
        useRequest(mockFn, { manual: true, onError })
      );

      await act(async () => {
        try {
          await result.current.run();
        } catch {
          // 预期会抛出错误
        }
      });

      expect(onError).toHaveBeenCalledWith(error);
    });
  });
});
