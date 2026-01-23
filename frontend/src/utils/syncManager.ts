/**
import logger from './logger';
 * PC端数据同步管理器
 * 基于小程序 syncManager.js 改造的 TypeScript 版本
 * 
 * 功能：
 * - 定时轮询数据
 * - 数据变化检测
 * - 错误自动降级
 * - 页面可见性优化
 * 
 * @example
 * ```typescript
 * import { syncManager } from '@/utils/syncManager';
 * 
 * // 启动同步
 * syncManager.startSync({
 *   taskId: 'production-orders',
 *   fetchFn: () => api.get('/production/order/list'),
 *   onDataChange: (data) => setOrders(data),
 *   interval: 30000
 * });
 * 
 * // 停止同步
 * syncManager.stopSync('production-orders');
 * ```
 */

export type SyncConfig<T = any> = {
  /** 任务唯一ID */
  taskId: string;
  /** 数据获取函数 */
  fetchFn: () => Promise<T>;
  /** 轮询间隔（毫秒），默认30000ms */
  interval?: number;
  /** 数据变化回调 */
  onDataChange?: (newData: T, oldData: T | null) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** 自定义数据比对函数 */
  compareData?: (oldData: T, newData: T) => boolean;
  /** 是否在页面隐藏时暂停 */
  pauseOnHidden?: boolean;
  /** 最大连续错误次数 */
  maxErrors?: number;
};

type SyncTask<T = any> = {
  config: SyncConfig<T>;
  timer: number | null;
  lastData: T | null;
  errorCount: number;
  isPaused: boolean;
};

class SyncManager {
  private tasks = new Map<string, SyncTask>();
  private visibilityHandler: (() => void) | null = null;

  constructor() {
    this.setupVisibilityListener();
  }

  /**
   * 启动数据同步任务
   */
  startSync<T = any>(config: SyncConfig<T>): boolean {
    const { taskId, fetchFn, interval = 30000, maxErrors = 3 } = config;

    if (!taskId || !fetchFn) {
      console.error('[同步管理器] taskId 和 fetchFn 是必需的');
      return false;
    }

    if (this.tasks.has(taskId)) {
      logger.warn(`[同步管理器] 任务 ${taskId} 已在运行中`);
      return false;
    }

    const normalizedInterval = Math.max(interval, 5000); // 最少5秒

    const task: SyncTask<T> = {
      config: {
        ...config,
        interval: normalizedInterval,
        maxErrors,
        compareData: config.compareData || this.defaultCompare,
      },
      timer: null,
      lastData: null,
      errorCount: 0,
      isPaused: false,
    };

    this.tasks.set(taskId, task);

    // 立即执行一次
    this.executeSync(task);

    // 启动定时器
    task.timer = window.setInterval(() => {
      if (!task.isPaused) {
        this.executeSync(task);
      }
    }, normalizedInterval);

    logger.debug(`[同步管理器] 任务 ${taskId} 已启动，间隔 ${normalizedInterval}ms`);

    return true;
  }

  /**
   * 停止数据同步任务
   */
  stopSync(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      logger.warn(`[同步管理器] 任务 ${taskId} 不存在`);
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

  /**
   * 暂停任务（不删除，可恢复）
   */
  pauseSync(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.isPaused = true;
    logger.debug(`[同步管理器] 任务 ${taskId} 已暂停`);
    return true;
  }

  /**
   * 恢复任务
   */
  resumeSync(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.isPaused = false;
    logger.debug(`[同步管理器] 任务 ${taskId} 已恢复`);

    // 立即执行一次
    this.executeSync(task);

    return true;
  }

  /**
   * 停止所有任务
   */
  stopAll(): void {
    const taskIds = Array.from(this.tasks.keys());
    taskIds.forEach((taskId) => this.stopSync(taskId));
    console.log('[同步管理器] 所有任务已停止');
  }

  /**
   * 获取任务状态
   */
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
   * 执行同步任务
   */
  private async executeSync<T>(task: SyncTask<T>): Promise<void> {
    const { config } = task;
    const { taskId, fetchFn, onDataChange, onError, compareData, maxErrors = 3 } = config;

    try {
      const newData = await fetchFn();

      // 比对数据
      if (task.lastData !== null && compareData) {
        const hasChanges = compareData(task.lastData, newData);
        if (hasChanges) {
          logger.debug(`[实时同步] 任务 ${taskId} 检测到数据变化`);
          onDataChange?.(newData, task.lastData);
        } else {
          logger.debug(`[实时同步] 任务 ${taskId} 数据无变化`);
        }
      } else {
        // 首次获取数据
        onDataChange?.(newData, null);
      }

      task.lastData = newData;
      task.errorCount = 0; // 成功后重置错误计数

    } catch (error) {
      task.errorCount++;
      const err = error as any;
      
      // 检查是否是认证错误 (401/403)
      const isAuthError = err?.status === 401 || err?.status === 403;
      
      if (isAuthError) {
        logger.warn(`[实时同步] 任务 ${taskId} 认证失败，停止同步`);
        this.stopSync(taskId);
        // 不调用 onError，因为认证错误已经由拦截器处理（跳转登录）
        return;
      }
      
      console.error(`[实时同步] 任务 ${taskId} 失败 (${task.errorCount}/${maxErrors})`, err);
      onError?.(err);

      // 错误次数过多，自动停止
      if (task.errorCount >= maxErrors) {
        console.error(`[实时同步] 任务 ${taskId} 失败次数过多，自动停止`);
        this.stopSync(taskId);
      }
    }
  }

  /**
   * 默认数据比对函数（深度比较）
   */
  private defaultCompare<T>(oldData: T, newData: T): boolean {
    try {
      return JSON.stringify(oldData) !== JSON.stringify(newData);
    } catch {
      // JSON 序列化失败，认为数据有变化
      return true;
    }
  }

  /**
   * 监听页面可见性变化
   */
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

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.stopAll();

    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }
}

// 单例导出
export const syncManager = new SyncManager();

/**
 * React Hook：使用数据同步
 * 
 * @example
 * ```typescript
 * const MyComponent = () => {
 *   const [orders, setOrders] = useState([]);
 *   
 *   useSync(
 *     'my-orders',
 *     () => api.get('/orders'),
 *     (newData) => setOrders(newData),
 *     { interval: 30000 }
 *   );
 *   
 *   return <div>{orders.length} orders</div>;
 * };
 * ```
 */
import { useEffect, useRef } from 'react';

export function useSync<T = any>(
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

  // 更新启用状态（enabled）
  useEffect(() => {
    enabledRef.current = options?.enabled ?? true;
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    if (!enabledRef.current) {
      // 如果禁用，确保停止任务
      syncManager.stopSync(taskId);
      return;
    }

    const started = syncManager.startSync({
      taskId,
      fetchFn,
      onDataChange,
      interval: options?.interval,
      onError: options?.onError,
      pauseOnHidden: options?.pauseOnHidden,
    });

    if (!started) {
      logger.warn(`[useSync] 任务 ${taskId} 启动失败`);
    }

    return () => {
      syncManager.stopSync(taskId);
    };
  }, [taskId]); // 只在任务 ID 变化时重新启动

  // 处理 fetchFn 与 onDataChange 的更新
  useEffect(() => {
    const task = syncManager['tasks'].get(taskId);
    if (task) {
      // 更新配置
      task.config.fetchFn = fetchFn;
      task.config.onDataChange = onDataChange;
      task.config.onError = options?.onError;
    }
  }, [taskId, fetchFn, onDataChange, options?.onError]);
}

export default syncManager;
