const { DEBUG } = require('../config/debug');
/**
 * 小程序数据同步管理器
 * 实现定时轮询和变化检测
 *
 * 使用方式:
 * const syncMgr = new SyncManager();
 * syncMgr.startSync('orders', api.production.listOrders, 30000);
 */

/**
 * 数据同步管理器类
 */
class SyncManager {
  constructor() {
    this.syncTasks = new Map(); // 键：任务 ID，值：{ timer, lastData, config }
    this.listeners = new Map(); // 键：任务 ID，值：回调集合
    this.lastSyncTime = new Map(); // 键：任务 ID，值：时间戳
    this.syncErrors = new Map(); // 键：任务 ID，值：{ count, lastError, timestamp }
  }

  /**
   * 启动数据同步任务
   * @param {string} taskId - 任务 ID（唯一）
   * @param {Function} fetchFn - 获取数据的函数（异步）
   * @param {number} interval - 同步间隔（毫秒），默认 30000 毫秒
   * @returns {boolean} 是否启动成功
   */
  startSync(taskId, fetchFn, interval = 30000, options) {
    if (!taskId || !fetchFn) {
      return false;
    }
    if (this.syncTasks.has(taskId)) {
      if (DEBUG) {
        console.warn(`[同步管理器] 任务 ${taskId} 已在运行中`);
      }
      return false;
    }

    const opts = options || {};

    const config = {
      taskId,
      fetchFn,
      interval: Math.max(interval, 5000), // 最少 5s
      onDataChange: opts.onDataChange || null,
      onError: opts.onError || null,
      compareData: opts.compareData || this._defaultCompare,
    };

    // 立即执行一次
    this._executeSync(config);

    // 设置定时器
    const timer = setInterval(() => {
      this._executeSync(config);
    }, config.interval);

    this.syncTasks.set(taskId, {
      timer,
      lastData: null,
      config,
    });

    return true;
  }

  /**
   * 停止数据同步任务
   * @param {string} taskId - 任务 ID
   * @returns {boolean} 是否停止成功
   */
  stopSync(taskId) {
    const task = this.syncTasks.get(taskId);
    if (!task) {
      return false;
    }

    clearInterval(task.timer);
    this.syncTasks.delete(taskId);
    this.listeners.delete(taskId);
    this.syncErrors.delete(taskId);

    return true;
  }

  /**
   * 停止所有同步任务
   */
  stopAllSync() {
    for (const taskId of this.syncTasks.keys()) {
      this.stopSync(taskId);
    }
  }

  /**
   * 添加数据变化监听器
   * @param {string} taskId - 任务 ID
   * @param {Function} callback - 回调函数 (data) => void
   * @returns {Function} 取消监听函数
   */
  onDataChange(taskId, callback) {
    if (!taskId || !callback) {
      return () => {};
    }

    if (!this.listeners.has(taskId)) {
      this.listeners.set(taskId, new Set());
    }

    this.listeners.get(taskId).add(callback);

    // 返回取消监听函数
    return () => {
      const listeners = this.listeners.get(taskId);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(taskId);
        }
      }
    };
  }

  /**
   * 获取任务的同步状态
   * @param {string} taskId - 任务 ID
   * @returns {Object|null} 同步状态或 null
   */
  getSyncStatus(taskId) {
    const task = this.syncTasks.get(taskId);
    if (!task) {
      return null;
    }

    const errors = this.syncErrors.get(taskId) || { count: 0, lastError: null };
    const lastSync = this.lastSyncTime.get(taskId) || 0;

    return {
      taskId,
      running: !!task,
      interval: task.config.interval,
      lastSyncTime: lastSync,
      lastSyncAt: lastSync ? new Date(lastSync).toISOString() : 'never',
      errorCount: errors.count,
      lastError: errors.lastError,
      lastErrorAt: errors.timestamp ? new Date(errors.timestamp).toISOString() : null,
    };
  }

  /**
   * 手动触发一次同步
   * @param {string} taskId - 任务 ID
   * @returns {Promise<Object>} 同步结果
   */
  async manualSync(taskId) {
    const task = this.syncTasks.get(taskId);
    if (!task) {
      return { success: false, error: `Task ${taskId} not found` };
    }

    return this._executeSync(task.config);
  }

  /**
   * 获取所有任务的统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const stats = {
      totalTasks: this.syncTasks.size,
      tasks: [],
      totalErrors: 0,
    };

    for (const taskId of this.syncTasks.keys()) {
      const status = this.getSyncStatus(taskId);
      stats.tasks.push(status);
      stats.totalErrors += status.errorCount;
    }

    return stats;
  }

  /**
   * 触发数据变更回调
   * @private
   */
  _triggerDataChangeCallbacks(taskId, newData, onDataChange) {
    // 触发 config 中的回调
    if (onDataChange && typeof onDataChange === 'function') {
      try {
        onDataChange(newData);
      } catch (e) {
        console.error(`[SyncManager] onDataChange callback error: ${e.message}`);
      }
    }

    // 触发通过 onDataChange 注册的监听器
    const listeners = this.listeners.get(taskId);
    if (listeners && listeners.size > 0) {
      for (const listener of listeners) {
        try {
          listener(newData);
        } catch (e) {
          console.error(`[SyncManager] Listener callback error: ${e.message}`);
        }
      }
    }
  }

  /**
   * 处理同步错误
   * @private
   */
  _handleSyncError(taskId, error, onError) {
    // 记录错误
    const errInfo = this.syncErrors.get(taskId) || { count: 0 };
    errInfo.count += 1;
    errInfo.lastError = error.message || String(error);
    errInfo.timestamp = Date.now();
    this.syncErrors.set(taskId, errInfo);

    console.error(`[SyncManager] Sync error for task ${taskId} (${errInfo.count}):`, error);

    // 触发错误回调
    if (onError && typeof onError === 'function') {
      try {
        onError(error, errInfo.count);
      } catch (e) {
        console.error(`[SyncManager] onError callback error: ${e.message}`);
      }
    }

    return { success: false, error: error.message, errorCount: errInfo.count };
  }

  /**
   * 执行同步（内部）
   * @private
   */
  async _executeSync(config) {
    const { taskId, fetchFn, onDataChange, onError, compareData } = config;

    try {
      const newData = await fetchFn();
      const task = this.syncTasks.get(taskId);

      if (!task) {
        return;
      }

      const lastData = task.lastData;
      const hasChanged = compareData(newData, lastData);

      // 更新最后同步时间
      this.lastSyncTime.set(taskId, Date.now());

      // 清除错误计数
      this.syncErrors.delete(taskId);

      // 如果数据变化，触发回调
      if (hasChanged) {
        // 更新缓存
        task.lastData = this._deepClone(newData);

        // 触发所有回调
        this._triggerDataChangeCallbacks(taskId, newData, onDataChange);
      }

      return { success: true, changed: hasChanged, data: newData };
    } catch (error) {
      return this._handleSyncError(taskId, error, onError);
    }
  }

  /**
   * 默认数据比较函数
   * @private
   */
  _defaultCompare(newData, oldData) {
    if (!oldData) {
      return true;
    } // 首次同步总是认为有变化
    return JSON.stringify(newData) !== JSON.stringify(oldData);
  }

  /**
   * 深拷贝对象
   * @private
   */
  _deepClone(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      return obj;
    }
  }
}

/**
 * 创建全局同步管理器实例
 */
const syncManager = new SyncManager();

module.exports = { SyncManager, syncManager };
