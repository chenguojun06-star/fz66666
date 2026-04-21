import logger from './logger';

export type SyncConfig<T = unknown> = {
  taskId: string;
  fetchFn: () => Promise<T>;
  interval?: number;
  onDataChange?: (newData: T, oldData: T | null) => void;
  onError?: (error: Error) => void;
  compareData?: (oldData: T, newData: T) => boolean;
  pauseOnHidden?: boolean;
  maxErrors?: number;
};

type SyncTask<T = unknown> = {
  config: SyncConfig<T>;
  timer: number | null;
  lastData: T | null;
  lastDataHash: string;
  errorCount: number;
  isPaused: boolean;
  isExecuting: boolean;
};

function fastHash(obj: unknown): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj === 'string') return obj;
  try {
    return JSON.stringify(obj);
  } catch {
    return String(Math.random());
  }
}

class SyncManager {
  private tasks = new Map<string, SyncTask<unknown>>();
  private visibilityHandler: (() => void) | null = null;

  constructor() {
    this.setupVisibilityListener();
    this.setupUserLogoutListener();
  }

  startSync<T = unknown>(config: SyncConfig<T>): boolean {
    const { taskId, fetchFn, interval = 30000, maxErrors = 3 } = config;

    if (!taskId || !fetchFn) {
      console.error('[同步管理器] taskId 和 fetchFn 是必需的');
      return false;
    }

    if (this.tasks.has(taskId)) {
      logger.warn(`[同步管理器] 任务 ${taskId} 已在运行中`);
      return false;
    }

    const normalizedInterval = Math.max(interval, 5000);

    const task: SyncTask<T> = {
      config: {
        ...config,
        interval: normalizedInterval,
        maxErrors,
        compareData: config.compareData || this.defaultCompare,
      },
      timer: null,
      lastData: null,
      lastDataHash: '',
      errorCount: 0,
      isPaused: false,
      isExecuting: false,
    };

    this.tasks.set(taskId, task as SyncTask<unknown>);

    this.executeSync(task);

    task.timer = window.setInterval(() => {
      if (!task.isPaused && !task.isExecuting) {
        this.executeSync(task);
      }
    }, normalizedInterval);

    logger.debug(`[同步管理器] 任务 ${taskId} 已启动，间隔 ${normalizedInterval}ms`);

    return true;
  }

  stopSync(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    if (task.timer !== null) {
      window.clearInterval(task.timer);
      task.timer = null;
    }

    this.tasks.delete(taskId);
    logger.debug(`[同步管理器] 任务 ${taskId} 已停止`);

    return true;
  }

  pauseSync(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.isPaused = true;
    logger.debug(`[同步管理器] 任务 ${taskId} 已暂停`);
    return true;
  }

  resumeSync(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.isPaused = false;
    logger.debug(`[同步管理器] 任务 ${taskId} 已恢复`);

    if (!task.isExecuting) {
      this.executeSync(task);
    }

    return true;
  }

  stopAll(): void {
    const taskIds = Array.from(this.tasks.keys());
    taskIds.forEach((taskId) => this.stopSync(taskId));
  }

  getTaskStatus(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    return {
      taskId,
      isRunning: task.timer !== null,
      isPaused: task.isPaused,
      errorCount: task.errorCount,
      lastDataTime: task.lastData ? new Date().toISOString() : null,
    };
  }

  private async executeSync<T>(task: SyncTask<T>): Promise<void> {
    if (task.isExecuting) return;
    task.isExecuting = true;

    const { config } = task;
    const { taskId, fetchFn, onDataChange, onError, compareData, maxErrors = 3 } = config;

    try {
      const newData = await fetchFn();

      const newHash = fastHash(newData);

      if (task.lastData !== null && compareData) {
        if (newHash === task.lastDataHash) {
          logger.debug(`[实时同步] 任务 ${taskId} 数据无变化(hash)`);
        } else {
          const hasChanges = compareData(task.lastData, newData);
          if (hasChanges) {
            logger.debug(`[实时同步] 任务 ${taskId} 检测到数据变化`);
            onDataChange?.(newData, task.lastData);
          } else {
            logger.debug(`[实时同步] 任务 ${taskId} 数据无变化`);
          }
        }
      } else {
        onDataChange?.(newData, null);
      }

      task.lastData = newData;
      task.lastDataHash = newHash;
      task.errorCount = 0;

    } catch (error) {
      task.errorCount++;
      const err = error as { status?: number; message?: string };
      const errorMessage = typeof err?.message === 'string' ? err.message : 'Unknown error';
      const errorObj = error instanceof Error ? error : new Error(errorMessage);

      const isAuthError = err?.status === 401 || err?.status === 403;

      if (isAuthError) {
        logger.warn(`[实时同步] 任务 ${taskId} 认证失败，停止同步`);
        this.stopSync(taskId);
        return;
      }

      console.error(`[实时同步] 任务 ${taskId} 失败 (${task.errorCount}/${maxErrors})`, err);
      onError?.(errorObj);

      if (task.errorCount >= maxErrors) {
        console.error(`[实时同步] 任务 ${taskId} 失败次数过多，自动停止`);
        this.stopSync(taskId);
      }
    } finally {
      task.isExecuting = false;
    }
  }

  private defaultCompare<T>(oldData: T, newData: T): boolean {
    try {
      return JSON.stringify(oldData) !== JSON.stringify(newData);
    } catch {
      return true;
    }
  }

  private setupVisibilityListener(): void {
    if (typeof document === 'undefined') return;

    this.visibilityHandler = () => {
      const isHidden = document.hidden;

      this.tasks.forEach((task, taskId) => {
        if (task.config.pauseOnHidden !== false) {
          if (isHidden) {
            logger.debug(`[同步管理器] 页面隐藏，暂停任务 ${taskId}`);
            this.pauseSync(taskId);
          } else {
            logger.debug(`[同步管理器] 页面可见，恢复任务 ${taskId}`);
            this.resumeSync(taskId);
          }
        }
      });
    };

    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private setupUserLogoutListener(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('user-logout', () => {
      logger.debug('[同步管理器] 检测到用户登出，停止所有同步任务');
      this.stopAll();
    });
  }

  destroy(): void {
    this.stopAll();

    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }
}

export const syncManager = new SyncManager();

import { useEffect, useRef } from 'react';

export function useSync<T = unknown>(
  taskId: string,
  fetchFn: () => Promise<T>,
  onDataChange: (newData: T, oldData: T | null) => void,
  options?: {
    interval?: number;
    enabled?: boolean;
    onError?: (error: Error) => void;
    pauseOnHidden?: boolean;
  }
): void {
  const enabledRef = useRef(options?.enabled ?? true);
  const optionsRef = useRef(options);
  const fetchRef = useRef(fetchFn);
  const onDataChangeRef = useRef(onDataChange);

  useEffect(() => {
    enabledRef.current = options?.enabled ?? true;
    optionsRef.current = options;
    fetchRef.current = fetchFn;
    onDataChangeRef.current = onDataChange;
  }, [options, fetchFn, onDataChange]);

  useEffect(() => {
    if (!enabledRef.current) {
      syncManager.stopSync(taskId);
      return;
    }

    const currentOptions = optionsRef.current;
    const started = syncManager.startSync({
      taskId,
      fetchFn: () => fetchRef.current(),
      onDataChange: (newData, oldData) => onDataChangeRef.current(newData, oldData),
      interval: currentOptions?.interval,
      onError: currentOptions?.onError,
      pauseOnHidden: currentOptions?.pauseOnHidden,
    });

    if (!started) {
      logger.warn(`[useSync] 任务 ${taskId} 启动失败`);
    }

    return () => {
      syncManager.stopSync(taskId);
    };
  }, [taskId]);

  useEffect(() => {
    const task = syncManager['tasks'].get(taskId) as SyncTask<T> | undefined;
    if (task) {
      task.config.fetchFn = fetchFn;
      task.config.onDataChange = onDataChange;
      task.config.onError = options?.onError;
    }
  }, [taskId, fetchFn, onDataChange, options?.onError]);
}

export default syncManager;
