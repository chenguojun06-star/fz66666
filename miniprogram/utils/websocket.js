const { getBaseUrl } = require('../config');
const { getToken } = require('./storage');
const { DEBUG } = require('../config/debug');
const { eventBus, Events } = require('./eventBus');

/**
 * WebSocket 实时数据同步模块
 *
 * 与后端 /ws/realtime 建立 WebSocket 连接，接收服务端推送的数据变更事件，
 * 并通过本地 EventBus 广播到各页面，实现跨端实时数据同步。
 *
 * 功能：
 * - 自动重连（指数退避：1s, 2s, 4s, 8s, 最大30s）
 * - 心跳保活（30s 一次 ping，连续3次无响应触发重连）
 * - 页面 onShow 时自动重连断开的连接
 * - 后端事件 → EventBus 事件映射
 */

// ========== 常量配置 ==========
const WS_PATH = '/ws/realtime'; // WebSocket 路径
const HEARTBEAT_INTERVAL = 30000; // 心跳间隔 30秒
const HEARTBEAT_MAX_MISS = 3; // 连续3次心跳无响应触发重连
const RECONNECT_MAX = 10; // 最大重连次数
const RECONNECT_BASE_DELAY = 1000; // 基础重连延迟 1秒
const RECONNECT_MAX_DELAY = 30000; // 最大重连延迟 30秒

// ========== 后端事件 → EventBus 事件映射 ==========
const EVENT_MAP = {
  'order:update': [Events.ORDER_UPDATED, Events.DATA_CHANGED],
  'order:create': [Events.ORDER_UPDATED, Events.DATA_CHANGED],
  'order:change': [Events.ORDER_UPDATED, Events.DATA_CHANGED],
  'scan:create': [Events.SCAN_SUCCESS, Events.DATA_CHANGED],
  'scan:undo': [Events.SCAN_UNDO, Events.DATA_CHANGED],
  'progress:update': [Events.ORDER_PROGRESS_CHANGED, Events.DATA_CHANGED],
  'progress:change': [Events.ORDER_PROGRESS_CHANGED, Events.DATA_CHANGED],
  'stock:change': [Events.STOCK_CHANGED, Events.DATA_CHANGED],
  'stock:update': [Events.STOCK_CHANGED, Events.DATA_CHANGED],
};

// ========== 内部状态 ==========
let socketTask = null; // wx.connectSocket 返回的任务对象
let connectionState = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
let reconnectCount = 0; // 当前重连次数
let reconnectTimer = null; // 重连定时器
let heartbeatTimer = null; // 心跳定时器
let heartbeatMissCount = 0; // 心跳未响应计数
let heartbeatWaiting = false; // 是否在等待心跳响应
let manuallyClosed = false; // 是否主动断开（主动断开不自动重连）

/**
 * 将 HTTP 基址转换为 WebSocket 地址
 * https:// → wss://, http:// → ws://
 * @param {string} baseUrl - HTTP 基址
 * @returns {string} WebSocket 基址
 */
function toWsUrl(baseUrl) {
  if (!baseUrl) return '';
  if (baseUrl.startsWith('https://')) {
    return 'wss://' + baseUrl.slice(8);
  }
  if (baseUrl.startsWith('http://')) {
    return 'ws://' + baseUrl.slice(7);
  }
  // 兜底：直接拼接 wss://
  return 'wss://' + baseUrl;
}

/**
 * 构建完整的 WebSocket 连接 URL
 * @returns {string|null} 完整的 WebSocket URL，无 token 时返回 null
 */
function buildWsUrl() {
  try {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      if (DEBUG) console.warn('[WebSocket] getBaseUrl() 返回空，无法建立连接');
      return null;
    }
    const wsBase = toWsUrl(baseUrl);
    const token = getToken();
    if (!token) {
      if (DEBUG) console.warn('[WebSocket] 无 token，跳过连接');
      return null;
    }
    return wsBase + WS_PATH + '?token=' + encodeURIComponent(token);
  } catch (e) {
    console.error('[WebSocket] 构建 URL 失败:', e.message || e);
    return null;
  }
}

/**
 * 停止心跳
 */
function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  heartbeatMissCount = 0;
  heartbeatWaiting = false;
}

/**
 * 启动心跳
 */
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(function () {
    if (!socketTask || connectionState !== 'connected') {
      return;
    }
    // 如果上一轮心跳还没收到响应，累计未响应次数
    if (heartbeatWaiting) {
      heartbeatMissCount++;
      if (DEBUG) console.warn('[WebSocket] 心跳未响应，累计:', heartbeatMissCount);
      if (heartbeatMissCount >= HEARTBEAT_MAX_MISS) {
        if (DEBUG) console.warn('[WebSocket] 连续' + HEARTBEAT_MAX_MISS + '次心跳无响应，触发重连');
        stopHeartbeat();
        reconnect();
        return;
      }
    }
    // 发送心跳
    try {
      heartbeatWaiting = true;
      socketTask.send({
        data: JSON.stringify({ type: 'ping', timestamp: Date.now() }),
        fail: function () {
          heartbeatWaiting = false;
          heartbeatMissCount++;
          if (heartbeatMissCount >= HEARTBEAT_MAX_MISS) {
            if (DEBUG) console.warn('[WebSocket] 心跳发送失败，触发重连');
            stopHeartbeat();
            reconnect();
          }
        },
      });
    } catch (e) {
      heartbeatWaiting = false;
      if (DEBUG) console.error('[WebSocket] 心跳发送异常:', e.message || e);
    }
  }, HEARTBEAT_INTERVAL);
}

/**
 * 处理心跳响应
 */
function handleHeartbeatResponse() {
  heartbeatWaiting = false;
  heartbeatMissCount = 0;
}

/**
 * 清除重连定时器
 */
function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/**
 * 计算重连延迟（指数退避）
 * @returns {number} 延迟毫秒数
 */
function getReconnectDelay() {
  var delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectCount);
  return Math.min(delay, RECONNECT_MAX_DELAY);
}

/**
 * 处理收到的 WebSocket 消息，映射到 EventBus 事件
 * @param {string} rawData - 原始消息字符串
 */
function handleMessage(rawData) {
  try {
    var msg = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

    // 心跳响应
    if (msg.type === 'pong') {
      handleHeartbeatResponse();
      return;
    }

    // 提取事件类型
    var eventType = msg.type || msg.event || '';
    if (!eventType) {
      if (DEBUG) console.warn('[WebSocket] 消息缺少事件类型:', rawData);
      return;
    }

    // 提取事件数据
    var payload = msg.data || msg.payload || {};

    // 映射到 EventBus 事件
    var mappedEvents = EVENT_MAP[eventType];
    if (mappedEvents) {
      for (var i = 0; i < mappedEvents.length; i++) {
        eventBus.emit(mappedEvents[i], {
          source: 'websocket',
          wsEvent: eventType,
          timestamp: Date.now(),
          data: payload,
        });
      }
    } else {
      // 未知事件类型，统一触发 DATA_CHANGED
      eventBus.emit(Events.DATA_CHANGED, {
        source: 'websocket',
        wsEvent: eventType,
        timestamp: Date.now(),
        data: payload,
      });
    }

    if (DEBUG) console.log('[WebSocket] 事件映射:', eventType, '→', mappedEvents ? mappedEvents.join(',') : 'DATA_CHANGED');
  } catch (e) {
    console.error('[WebSocket] 消息处理失败:', e.message || e, 'raw:', rawData);
  }
}

/**
 * 建立 WebSocket 连接
 */
function connect() {
  // 已连接或正在连接中，不重复建立
  if (connectionState === 'connected' || connectionState === 'connecting') {
    if (DEBUG) console.log('[WebSocket] 已在连接状态，跳过');
    return;
  }

  var url = buildWsUrl();
  if (!url) {
    if (DEBUG) console.warn('[WebSocket] 无法构建连接 URL，跳过连接');
    return;
  }

  manuallyClosed = false;
  connectionState = 'connecting';

  if (DEBUG) console.log('[WebSocket] 正在连接:', url.split('?')[0] + '...');

  try {
    socketTask = wx.connectSocket({
      url: url,
      success: function () {
        if (DEBUG) console.log('[WebSocket] connectSocket 调用成功');
      },
      fail: function (err) {
        console.error('[WebSocket] connectSocket 调用失败:', err && err.errMsg ? err.errMsg : err);
        connectionState = 'disconnected';
        socketTask = null;
        // 调用失败时尝试重连
        scheduleReconnect();
      },
    });

    if (!socketTask) {
      connectionState = 'disconnected';
      if (DEBUG) console.warn('[WebSocket] wx.connectSocket 返回空');
      return;
    }

    // 监听连接打开
    socketTask.onOpen(function () {
      if (DEBUG) console.log('[WebSocket] 连接已建立');
      connectionState = 'connected';
      reconnectCount = 0;
      clearReconnectTimer();
      startHeartbeat();
    });

    // 监听消息
    socketTask.onMessage(function (res) {
      if (res && res.data) {
        handleMessage(res.data);
      }
    });

    // 监听连接关闭
    socketTask.onClose(function (res) {
      if (DEBUG) console.log('[WebSocket] 连接关闭, code:', res.code, 'reason:', res.reason);
      connectionState = 'disconnected';
      socketTask = null;
      stopHeartbeat();

      // 非主动关闭时自动重连
      if (!manuallyClosed) {
        scheduleReconnect();
      }
    });

    // 监听连接错误
    socketTask.onError(function (err) {
      console.error('[WebSocket] 连接错误:', err && err.errMsg ? err.errMsg : err);
      connectionState = 'disconnected';
      socketTask = null;
      stopHeartbeat();

      // 非主动关闭时自动重连
      if (!manuallyClosed) {
        scheduleReconnect();
      }
    });
  } catch (e) {
    console.error('[WebSocket] 连接异常:', e.message || e);
    connectionState = 'disconnected';
    socketTask = null;
    scheduleReconnect();
  }
}

/**
 * 安排重连（指数退避）
 */
function scheduleReconnect() {
  if (manuallyClosed) {
    if (DEBUG) console.log('[WebSocket] 主动断开，不自动重连');
    return;
  }

  if (reconnectCount >= RECONNECT_MAX) {
    console.warn('[WebSocket] 已达最大重连次数(' + RECONNECT_MAX + ')，停止重连');
    return;
  }

  clearReconnectTimer();

  var delay = getReconnectDelay();
  reconnectCount++;

  if (DEBUG) console.log('[WebSocket] 将在 ' + delay + 'ms 后重连 (第' + reconnectCount + '次)');

  reconnectTimer = setTimeout(function () {
    reconnectTimer = null;
    connect();
  }, delay);
}

/**
 * 重新连接（重置重连计数后连接）
 */
function reconnect() {
  if (connectionState === 'connecting') {
    if (DEBUG) console.log('[WebSocket] 正在连接中，跳过重连');
    return;
  }

  // 先关闭现有连接
  closeSocket();

  // 重置重连计数，让指数退避从头开始
  reconnectCount = 0;
  manuallyClosed = false;

  // 延迟一小段时间再连接，避免立即重连导致状态混乱
  setTimeout(function () {
    connect();
  }, 300);
}

/**
 * 关闭 Socket 连接（内部方法）
 */
function closeSocket() {
  stopHeartbeat();
  if (socketTask) {
    try {
      socketTask.close({});
    } catch (e) {
      // 忽略关闭异常
    }
    socketTask = null;
  }
  connectionState = 'disconnected';
}

/**
 * 主动断开连接（不自动重连）
 */
function disconnect() {
  manuallyClosed = true;
  clearReconnectTimer();
  reconnectCount = 0;
  closeSocket();
  if (DEBUG) console.log('[WebSocket] 已主动断开连接');
}

/**
 * 获取当前连接状态
 * @returns {boolean} 是否已连接
 */
function isConnected() {
  return connectionState === 'connected';
}

/**
 * 获取连接状态字符串
 * @returns {string} 'disconnected' | 'connecting' | 'connected'
 */
function getConnectionState() {
  return connectionState;
}

/**
 * 页面 onShow 时调用：如果连接断开则重连
 * 在 app.js 的 onShow 或各页面 onShow 中调用
 */
function onPageShow() {
  if (connectionState === 'disconnected' && !manuallyClosed) {
    if (DEBUG) console.log('[WebSocket] 页面 onShow，连接已断开，尝试重连');
    reconnectCount = 0; // 重置退避计数
    connect();
  }
}

module.exports = {
  connect: connect,
  disconnect: disconnect,
  reconnect: reconnect,
  isConnected: isConnected,
  getConnectionState: getConnectionState,
  onPageShow: onPageShow,
};
