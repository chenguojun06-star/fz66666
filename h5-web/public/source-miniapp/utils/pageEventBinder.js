/**
 * 页面事件总线订阅工具
 *
 * 用途：统一所有业务页面的 eventBus 订阅/取消订阅逻辑，避免重复代码和遗漏。
 *
 * 使用方式（在页面 onLoad 中调用）：
 *   const { bindPageEvents, unbindPageEvents } = require('../../../utils/pageEventBinder');
 *
 *   onLoad() {
 *     this._unsubscribe = bindPageEvents(this, () => this.loadData());
 *   }
 *
 *   onUnload() {
 *     unbindPageEvents(this);
 *   }
 *
 * 默认订阅事件：DATA_CHANGED / REFRESH_ALL
 * 可通过第三个参数指定额外事件：
 *   bindPageEvents(this, refreshFn, ['SCAN_SUCCESS', 'ORDER_PROGRESS_CHANGED']);
 *
 * 历史背景：2026-07-09 发现 13 个业务页面完全未接入 eventBus，导致操作后跨页面不刷新。
 * 本工具统一接入，确保所有业务页面都能响应数据变更事件。
 */
'use strict';

const { eventBus, Events } = require('./eventBus');

// 默认订阅的事件（所有业务页面都应该订阅）
const DEFAULT_EVENTS = [Events.DATA_CHANGED, Events.REFRESH_ALL];

/**
 * 为页面绑定 eventBus 事件订阅
 * @param {Object} pageInstance - Page 实例（this）
 * @param {Function} refreshFn - 收到事件时的刷新函数
 * @param {Array<string>} [extraEvents] - 额外要订阅的事件名数组
 * @returns {Function} 取消订阅函数（可直接赋值给 this._unsubscribe）
 */
function bindPageEvents(pageInstance, refreshFn, extraEvents) {
  if (!pageInstance || typeof refreshFn !== 'function') return null;

  // 防止重复绑定
  if (pageInstance._eventBound) return null;
  pageInstance._eventBound = true;

  // 合并默认事件和额外事件，去重
  const allEvents = Array.from(new Set([...DEFAULT_EVENTS, ...(extraEvents || [])]));

  // 节流：500ms 内多次事件只触发一次刷新（避免短时间多个事件导致重复请求）
  let lastRefresh = 0;
  const throttledRefresh = function() {
    const now = Date.now();
    if (now - lastRefresh < 500) return;
    lastRefresh = now;
    try {
      refreshFn.call(pageInstance);
    } catch (e) {
      console.error('[pageEventBinder] refresh error:', e.message || e);
    }
  };

  // 存储到实例上，供 unbind 使用
  pageInstance._eventHandler = throttledRefresh;
  pageInstance._subscribedEvents = allEvents;

  // 订阅所有事件
  for (const eventName of allEvents) {
    eventBus.on(eventName, throttledRefresh);
  }

  // 返回取消订阅函数
  return function unbind() {
    unbindPageEvents(pageInstance);
  };
}

/**
 * 取消页面的 eventBus 事件订阅
 * @param {Object} pageInstance - Page 实例（this）
 */
function unbindPageEvents(pageInstance) {
  if (!pageInstance || !pageInstance._eventBound) return;

  pageInstance._eventBound = false;

  if (pageInstance._eventHandler && pageInstance._subscribedEvents) {
    for (const eventName of pageInstance._subscribedEvents) {
      eventBus.off(eventName, pageInstance._eventHandler);
    }
  }

  pageInstance._eventHandler = null;
  pageInstance._subscribedEvents = null;
}

module.exports = {
  bindPageEvents,
  unbindPageEvents,
  Events, // 方便页面直接引用
};
