import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { syncManager, useSync } from '../../utils/syncManager';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../utils/logger', () => ({
  default: {
    trace: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('SyncManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    syncManager.stopAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    syncManager.stopAll();
    vi.clearAllMocks();
  });

  describe('startSync', () => {
    it('应该成功启动同步任务', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });
      const onDataChange = vi.fn();

      const result = syncManager.startSync({
        taskId: 'test-task',
        fetchFn,
        onDataChange,
        interval: 5000,
      });

      expect(result).toBe(true);
      
      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('重复启动同一任务应该先停止旧任务，再启动新任务（携带干净状态）', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });
      
      const r1 = syncManager.startSync({
        taskId: 'duplicate-task',
        fetchFn,
        interval: 5000,
        maxErrors: 1,
      });
      expect(r1).toBe(true);

      await act(async () => { vi.advanceTimersByTime(0); });
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // 模拟旧任务累积了错误计数（脏状态）
      const statusBefore = syncManager.getTaskStatus('duplicate-task');
      expect(statusBefore).not.toBe(null);

      const r2 = syncManager.startSync({
        taskId: 'duplicate-task',
        fetchFn,
        interval: 5000,
      });

      // ★ 新行为：重复启动返回 true（先 stop 旧任务，再 start 新任务，避免脏状态）
      expect(r2).toBe(true);
      const statusAfter = syncManager.getTaskStatus('duplicate-task');
      expect(statusAfter).not.toBe(null);
      // 新任务 errorCount 应该是干净的 0
      expect(statusAfter?.errorCount).toBe(0);
    });

    it('应该拒绝缺少taskId或fetchFn的任务', () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });
      
      const result1 = syncManager.startSync({
        taskId: '',
        fetchFn,
      } as any);
      expect(result1).toBe(false);

      const result2 = syncManager.startSync({
        taskId: 'test',
        fetchFn: undefined,
      } as any);
      expect(result2).toBe(false);
    });
  });

  describe('stopSync', () => {
    it('应该成功停止同步任务', () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });
      
      syncManager.startSync({
        taskId: 'stop-task',
        fetchFn,
        interval: 5000,
      });

      const result = syncManager.stopSync('stop-task');
      expect(result).toBe(true);

      const status = syncManager.getTaskStatus('stop-task');
      expect(status).toBe(null);
    });

    it('应该返回false当任务不存在时', () => {
      const result = syncManager.stopSync('non-existent-task');
      expect(result).toBe(false);
    });
  });

  describe('pauseSync & resumeSync', () => {
    it('应该暂停和恢复同步任务', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });
      
      syncManager.startSync({
        taskId: 'pause-resume-task',
        fetchFn,
        interval: 1000,
      });

      await act(async () => {
        vi.advanceTimersByTime(0);
      });
      expect(fetchFn).toHaveBeenCalledTimes(1);

      syncManager.pauseSync('pause-resume-task');
      
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(fetchFn).toHaveBeenCalledTimes(1);

      syncManager.resumeSync('pause-resume-task');
      
      await act(async () => {
        vi.advanceTimersByTime(0);
      });
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('数据变化检测', () => {
    it('应该在首次同步时调用onDataChange', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 1 });
      const onDataChange = vi.fn();

      syncManager.startSync({
        taskId: 'data-change-task-first',
        fetchFn,
        onDataChange,
        interval: 1000,
      });

      await act(async () => {
        vi.advanceTimersByTime(0);
      });
      expect(onDataChange).toHaveBeenCalledTimes(1);
      expect(onDataChange).toHaveBeenCalledWith({ data: 1 }, null);
    });

    it('应该在数据未变化时不调用onDataChange', async () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'same' });
      const onDataChange = vi.fn();

      syncManager.startSync({
        taskId: 'no-change-task',
        fetchFn,
        onDataChange,
        interval: 1000,
      });

      await act(async () => {
        vi.advanceTimersByTime(0);
      });
      expect(onDataChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('错误处理', () => {
    it('应该在错误时调用onError', async () => {
      const error = new Error('test error');
      const fetchFn = vi.fn().mockRejectedValue(error);
      const onError = vi.fn();

      syncManager.startSync({
        taskId: 'error-task',
        fetchFn,
        onError,
        interval: 1000,
        maxErrors: 3,
      });

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      expect(onError).toHaveBeenCalledWith(error);
    });

    it('应该在认证错误时立即停止', async () => {
      const authError = { status: 401, message: 'Unauthorized' };
      const fetchFn = vi.fn().mockRejectedValue(authError);

      syncManager.startSync({
        taskId: 'auth-error-task',
        fetchFn,
        interval: 1000,
      });

      await act(async () => {
        vi.advanceTimersByTime(0);
      });

      const status = syncManager.getTaskStatus('auth-error-task');
      expect(status).toBe(null);
    });
  });

  describe('getTaskStatus', () => {
    it('应该返回任务状态', () => {
      const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });
      
      syncManager.startSync({
        taskId: 'status-task',
        fetchFn,
        interval: 5000,
      });

      const status = syncManager.getTaskStatus('status-task');
      expect(status).not.toBe(null);
      expect(status?.taskId).toBe('status-task');
      expect(status?.isRunning).toBe(true);
      expect(status?.isPaused).toBe(false);
      expect(status?.errorCount).toBe(0);
    });

    it('应该返回null当任务不存在时', () => {
      const status = syncManager.getTaskStatus('non-existent');
      expect(status).toBe(null);
    });
  });
});

describe('useSync Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    syncManager.stopAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    syncManager.stopAll();
    vi.clearAllMocks();
  });

  it('应该在组件挂载时启动同步', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: 'hook-test' });
    const onDataChange = vi.fn();

    const { unmount } = renderHook(() => 
      useSync('hook-task', fetchFn, onDataChange, { interval: 5000 })
    );

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);

    unmount();

    const status = syncManager.getTaskStatus('hook-task');
    expect(status).toBe(null);
  });

  it('应该在组件卸载时停止同步', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: 'test' });
    const onDataChange = vi.fn();

    const { unmount } = renderHook(() => 
      useSync('unmount-task', fetchFn, onDataChange, { enabled: true })
    );

    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    unmount();

    const status = syncManager.getTaskStatus('unmount-task');
    expect(status).toBe(null);
  });
});
