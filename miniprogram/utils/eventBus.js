const { DEBUG } = require('../config/debug');
/**
 * 小程序事件总线 - 用于跨页面通信
 * 实现多端数据同步通知
 *
 * 使用场景：
 * - 扫码后通知其他页面刷新数据
 * - 撤回操作后通知所有页面更新
 * - 订单状态变更后同步多端显示
 */

class EventBus {
  constructor() {
    this.events = new Map(); // 事件名 -> 回调函数集合
  }

  /**
   * 订阅事件
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消订阅函数
   */
  on(eventName, callback) {
    if (!eventName || typeof callback !== 'function') {
      if (DEBUG) {
        console.warn('[EventBus] Invalid event subscription');
      }
      return () => {};
    }

    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set());
    }

    this.events.get(eventName).add(callback);

    // 返回取消订阅函数
    return () => {
      this.off(eventName, callback);
    };
  }

  /**
   * 取消订阅事件
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数（不传则取消该事件的所有订阅）
   */
  off(eventName, callback) {
    if (!this.events.has(eventName)) {
      return;
    }

    if (callback) {
      this.events.get(eventName).delete(callback);
    } else {
      this.events.delete(eventName);
    }
  }

  /**
   * 发布事件
   * @param {string} eventName - 事件名称
   * @param {*} data - 事件数据
   */
  emit(eventName, data) {
    if (!this.events.has(eventName)) {
      return;
    }

    const callbacks = this.events.get(eventName);
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[EventBus] Error in event "${eventName}" callback:`, error);
      }
    });
  }

  /**
   * 订阅一次性事件（触发后自动取消订阅）
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消订阅函数
   */
  once(eventName, callback) {
    const wrappedCallback = data => {
      callback(data);
      this.off(eventName, wrappedCallback);
    };

    return this.on(eventName, wrappedCallback);
  }

  /**
   * 清空所有事件
   */
  clear() {
    this.events.clear();
  }

  /**
   * 获取当前订阅的事件数量（用于调试）
   */
  getEventCount(eventName) {
    if (!eventName) {
      return this.events.size;
    }
    return this.events.has(eventName) ? this.events.get(eventName).size : 0;
  }
}

// 创建全局单例
const eventBus = new EventBus();

// 定义标准事件名
const Events = {
  // 扫码相关
  SCAN_SUCCESS: 'scan:success', // 扫码成功
  SCAN_UNDO: 'scan:undo', // 撤销扫码
  SCAN_ROLLBACK: 'scan:rollback', // 回退操作

  // 订单相关
  ORDER_UPDATED: 'order:updated', // 订单更新
  ORDER_PROGRESS_CHANGED: 'order:progress:changed', // 订单进度变更
  ORDER_STATUS_CHANGED: 'order:status:changed', // 订单状态变更

  // 任务相关
  TASK_RECEIVED: 'task:received', // 领取任务
  TASK_RETURNED: 'task:returned', // 退回任务
  TASK_COMPLETED: 'task:completed', // 完成任务
  TASK_BUNDLED: 'task:bundled', // 生成菲号

  // 质检相关
  QUALITY_CHECKED: 'quality:checked', // 质检完成
  QUALITY_REPAIRED: 'quality:repaired', // 返修完成

  // 入库相关
  WAREHOUSE_IN: 'warehouse:in', // 入库操作

  // 通用数据变更
  DATA_CHANGED: 'data:changed', // 通用数据变更
  REFRESH_ALL: 'refresh:all', // 请求刷新所有页面
};

/**
 * 触发数据刷新事件（便捷方法）
 * @param {string} dataType - 数据类型（orders, tasks, scans, etc.）
 * @param {Object} payload - 附加数据
 */
function triggerDataRefresh(dataType, payload = {}) {
  eventBus.emit(Events.DATA_CHANGED, {
    type: dataType,
    timestamp: Date.now(),
    ...payload,
  });

  // 同时触发全局刷新事件
  eventBus.emit(Events.REFRESH_ALL, {
    source: dataType,
    timestamp: Date.now(),
    ...payload,
  });
}

/**
 * 订阅数据刷新事件（便捷方法）
 * @param {Function} callback - 回调函数
 * @returns {Function} 取消订阅函数
 */
function onDataRefresh(callback) {
  const unsubscribe1 = eventBus.on(Events.DATA_CHANGED, callback);
  const unsubscribe2 = eventBus.on(Events.REFRESH_ALL, callback);

  return () => {
    unsubscribe1();
    unsubscribe2();
  };
}

module.exports = {
  eventBus,
  Events,
  triggerDataRefresh,
  onDataRefresh,
};
