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
  /** 连续成功多少次才重置 errorCount（默认1次）。用于避免"偶发成功→计数器清零→又开始失败"的震荡 */
  successResetThreshold?: number;
};

type SyncTask<T = unknown> = {
  config: SyncConfig<T>;
  timer: number | null;
  lastData: T | null;
  lastDataHash: string;
  errorCount: number;
  consecutiveSuccessCount: number;
  isPaused: boolean;
  isExecuting: boolean;
  /** 最近一次启用时的 fetchFn 签名（JSON.stringify 参数快照），用于判断查询条件真变了，避免误触发"数据变化" */
  lastFetchSig: string;
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
    const {
      taskId,
      fetchFn,
      interval = 30000,
      maxErrors = 3,
      successResetThreshold = 1,
    } = config;

    if (!taskId || !fetchFn) {
      logger.error('[同步管理器] taskId 和 fetchFn 是必需的');
      return false;
    }

    // ★ 关键修复1：如果任务已存在（比如同一 taskId 重新启用），先彻底停止旧任务，
    // 否则旧 errorCount / lastData / lastFetchSig 会携带脏状态，导致误判或闸门早停
    if (this.tasks.has(taskId)) {
      const old = this.tasks.get(taskId)!;
      if (old.timer !== null) window.clearInterval(old.timer);
      this.tasks.delete(taskId);
    }

    const normalizedInterval = Math.max(interval, 5000);

    const task: SyncTask<T> = {
      config: {
        ...config,
        interval: normalizedInterval,
        maxErrors,
        successResetThreshold,
        compareData: config.compareData || this.defaultCompare,
      },
      timer: null,
      lastData: null,
      lastDataHash: '',
      errorCount: 0,
      consecutiveSuccessCount: 0,
      isPaused: false,
      isExecuting: false,
      lastFetchSig: '',
    };

    this.tasks.set(taskId, task as SyncTask<unknown>);

    // 立即执行一次，开启轮询
    this.executeSync(task);
    task.timer = window.setInterval(() => {
      if (!task.isPaused && !task.isExecuting) {
        void this.executeSync(task);
      }
    }, normalizedInterval);

    logger.trace(`[同步管理器] 任务 ${taskId} 已启动，间隔 ${normalizedInterval}ms`);
    return true;
  }

  stopSync(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.timer !== null) {
      window.clearInterval(task.timer);
      task.timer = null;
    }
    this.tasks.delete(taskId);
    logger.trace(`[同步管理器] 任务 ${taskId} 已停止`);
    return true;
  }

  pauseSync(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.isPaused = true;
    logger.trace(`[同步管理器] 任务 ${taskId} 已暂停`);
    return true;
  }

  resumeSync(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    task.isPaused = false;
    logger.trace(`[同步管理器] 任务 ${taskId} 已恢复`);
    if (!task.isExecuting) void this.executeSync(task);
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

  /**
   * 外部动态更新配置（不重启轮询）。
   * 主要用于：fetchFn 引用变化但查询语义没变（同参数不同闭包），这种情况不改 lastData。
   * 如果 newFetchSig 真的不一样（查询条件变了），则重置 lastData 避免误判"数据变化"。
   */
  updateConfig<T>(taskId: string, patch: Partial<SyncConfig<T>>, newFetchSig?: string): void {
    const task = this.tasks.get(taskId) as SyncTask<T> | undefined;
    if (!task) return;

    // ★ 关键修复2：查询条件真变了（不是简单的闭包引用变）时，清空 lastData 缓存
    if (newFetchSig && task.lastFetchSig && newFetchSig !== task.lastFetchSig) {
      task.lastData = null;
      task.lastDataHash = '';
      task.consecutiveSuccessCount = 0;
      // errorCount 不清零 —— 保留失败闸门，防止"改下参数就又能狂轰服务器"
      logger.debug(`[同步管理器] 任务 ${taskId} 查询条件变化，重置缓存`);
    }
    task.lastFetchSig = newFetchSig ?? task.lastFetchSig;
    task.config = { ...task.config, ...patch };
  }

  private async executeSync<T>(task: SyncTask<T>): Promise<void> {
    if (task.isExecuting) return;
    task.isExecuting = true;

    const { config } = task;
    const {
      taskId, fetchFn, onDataChange, onError, compareData,
      maxErrors = 3, successResetThreshold = 1,
    } = config;

    try {
      const newData = await fetchFn();

      // ★ 关键修复3：fetchFn 返回 null 视为"本次拉取无效"（例如被 try/catch 吞了异常后 return null），
      // 不计入成功也不改 lastData，但要记一次软失败，连续 N 次后也要触发闸门。
      if (newData === null || newData === undefined) {
        task.errorCount++;
        task.consecutiveSuccessCount = 0;
        logger.warn(`[实时同步] 任务 ${taskId} 返回空数据 (${task.errorCount}/${maxErrors})`);
        if (task.errorCount >= maxErrors) {
          logger.error(`[实时同步] 任务 ${taskId} 返回空数据次数过多，自动停止`);
          this.stopSync(taskId);
        }
        return;
      }

      const newHash = fastHash(newData);
      if (task.lastData !== null && compareData) {
        if (newHash !== task.lastDataHash) {
          const hasChanges = compareData(task.lastData, newData);
          if (hasChanges) {
            logger.debug(`[实时同步] 任务 ${taskId} 检测到数据变化`);
            onDataChange?.(newData, task.lastData);
          }
        }
      } else {
        onDataChange?.(newData, null);
      }

      task.lastData = newData;
      task.lastDataHash = newHash;
      task.consecutiveSuccessCount++;
      // ★ 关键修复4：成功后不清零 errorCount，必须连续 N 次成功才清零，
      // 防止"偶发成功一次→清零→再失败又从0累加"的闸门失效问题。
      if (task.consecutiveSuccessCount >= successResetThreshold) {
        task.errorCount = 0;
      }

    } catch (error) {
      task.errorCount++;
      task.consecutiveSuccessCount = 0;
      const err = error as { status?: number; message?: string };
      const errorMessage = typeof err?.message === 'string' ? err.message : 'Unknown error';
      const errorObj = error instanceof Error ? error : new Error(errorMessage);

      const isAuthError = err?.status === 401 || err?.status === 403;
      if (isAuthError) {
        logger.warn(`[实时同步] 任务 ${taskId} 认证失败，停止同步`);
        this.stopSync(taskId);
        return;
      }

      logger.error(`[实时同步] 任务 ${taskId} 失败 (${task.errorCount}/${maxErrors})`, err);
      onError?.(errorObj);

      if (task.errorCount >= maxErrors) {
        logger.error(`[实时同步] 任务 ${taskId} 失败次数过多，自动停止（下次进入页面手动刷新后会重启）`);
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
            logger.trace(`[同步管理器] 页面隐藏，暂停任务 ${taskId}`);
            this.pauseSync(taskId);
          } else {
            logger.trace(`[同步管理器] 页面可见，恢复任务 ${taskId}`);
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
      logger.trace('[同步管理器] 检测到用户登出，停止所有同步任务');
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

import { useEffect, useMemo, useRef } from 'react';

export function useSync<T = unknown>(
  taskId: string,
  fetchFn: () => Promise<T>,
  onDataChange: (newData: T, oldData: T | null) => void,
  options?: {
    interval?: number;
    enabled?: boolean;
    onError?: (error: Error) => void;
    pauseOnHidden?: boolean;
    maxErrors?: number;
    /**
     * 查询条件签名（必填！）。用于判断"fetchFn 只是闭包引用变了"还是"查询参数真变了"。
     * 真变了 → 重置 lastData，避免误触发"数据变化 → setState → 重渲染 → 又触发变化"的震荡刷新。
     * 示例：`fetchSig: JSON.stringify([queryParams.page, queryParams.orderNo, ...])`
     */
    fetchSig?: string;
  }
): void {
  const optionsRef = useRef(options);
  const fetchRef = useRef(fetchFn);
  const onDataChangeRef = useRef(onDataChange);

  optionsRef.current = options;
  fetchRef.current = fetchFn;
  onDataChangeRef.current = onDataChange;

  const enabled = options?.enabled ?? true;
  const fetchSig = options?.fetchSig ?? taskId;

  // ★ 关键修复5：用 useMemo 生成稳定 config，保证只有真依赖变化才触发第二个 useEffect 的 updateConfig
  const stableInterval = options?.interval;
  const stablePauseOnHidden = options?.pauseOnHidden;
  const stableMaxErrors = options?.maxErrors;
  const stableOnError = options?.onError;

  useEffect(() => {
    if (!enabled) {
      syncManager.stopSync(taskId);
      return;
    }

    const started = syncManager.startSync({
      taskId,
      fetchFn: () => fetchRef.current(),
      onDataChange: (newData, oldData) => onDataChangeRef.current(newData, oldData),
      interval: optionsRef.current?.interval,
      onError: optionsRef.current?.onError,
      pauseOnHidden: optionsRef.current?.pauseOnHidden,
      maxErrors: optionsRef.current?.maxErrors,
    });

    if (!started) {
      logger.warn(`[useSync] 任务 ${taskId} 启动失败`);
    }

    return () => {
      syncManager.stopSync(taskId);
    };
    // ★ 关键修复6：enabled 必须进依赖数组！之前只写 enabledRef 不重启 —— 停掉后永远起不来
  }, [taskId, enabled]);

  // 不重启任务，只更新配置（fetchFn/onDataChange 引用变化时）。传入 fetchSig 判断查询是否真变
  useEffect(() => {
    syncManager.updateConfig<T>(
      taskId,
      {
        interval: stableInterval,
        pauseOnHidden: stablePauseOnHidden,
        maxErrors: stableMaxErrors,
        onError: stableOnError,
        fetchFn: () => fetchRef.current(),
        onDataChange: (newData, oldData) => onDataChangeRef.current(newData, oldData),
      },
      fetchSig,
    );
    // 注意：fetchRef/onDataChangeRef 的内容随时更新，这里依赖的是"外部传入的可序列化配置"
  }, [taskId, fetchSig, stableInterval, stablePauseOnHidden, stableMaxErrors, stableOnError]);

  // 静默占位，防止 TS 报 unused
  void useMemo(() => fetchSig, [fetchSig]);
}

export default syncManager;
