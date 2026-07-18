const { getBaseUrl } = require('../config');
const { getToken, getUserInfo } = require('./storage');
const { DEBUG } = require('../config/debug');
const { eventBus, Events } = require('./eventBus');

/**
 * WebSocket 实时数据同步模块
 *
 * 与后端 /ws/order-progress/{tenantId} 建立 WebSocket 连接，接收服务端推送的订单进度变更事件，
 * 并通过本地 EventBus 广播到各页面，实现跨端实时数据同步。
 *
 * 连接策略（按优先级）：
 * 1. wx.cloud.connectContainer — 微信云托管专用通道，走微信私有协议，
 *    无需域名白名单，无需 wss，最稳定可靠
 * 2. wx.connectSocket — 标准WebSocket，走自定义域名 wss://api.webyszl.cn
 *
 * 端点契约（与后端 OrderProgressWebSocketServer.java、PC 端 useWebSocket.ts 保持一致）：
 *   wss://host/ws/order-progress/{tenantId}?token=xxx&clientType=miniprogram
 *   - tenantId 必须在 path 中（后端 @ServerEndpoint("/ws/order-progress/{tenantId}")）
 *   - 握手拦截器 WebSocketHandshakeInterceptor 校验 path tenantId 与 token tenantId 一致
 *
 * 功能：
 * - 自动重连（指数退避：1s, 2s, 4s, 8s, 最大30s）
 * - 心跳保活（30s 一次 ping，连续3次无响应触发重连）
 * - 页面 onShow 时自动重连断开的连接
 * - 后端事件 → EventBus 事件映射
 */

// ========== 常量配置 ==========
// 后端实际端点：@ServerEndpoint("/ws/order-progress/{tenantId}")
// tenantId 必须放在 path 中（与后端、PC 端 frontend/src/hooks/useWebSocket.ts 保持一致）
// 历史教训：2026-07-13 之前 WS_PATH 写成 '/ws/realtime'（后端不存在）导致连接 404 刷屏
var WS_PATH_PREFIX = '/ws/order-progress/'; // WebSocket 路径前缀，tenantId 拼接其后
var HEARTBEAT_INTERVAL = 30000; // 心跳间隔 30秒
var HEARTBEAT_MAX_MISS = 3; // 连续3次心跳无响应触发重连
var RECONNECT_MAX = 10; // 最大重连次数
var RECONNECT_BASE_DELAY = 1000; // 基础重连延迟 1秒
var RECONNECT_MAX_DELAY = 30000; // 最大重连延迟 30秒

// ========== 后端事件 → EventBus 事件映射 ==========
var EVENT_MAP = {
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
var socketTask = null; // wx.connectSocket / wx.cloud.connectContainer 返回的任务对象
var connectionState = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
var reconnectCount = 0; // 当前重连次数
var reconnectTimer = null; // 重连定时器
var heartbeatTimer = null; // 心跳定时器
var heartbeatMissCount = 0; // 心跳未响应计数
var heartbeatWaiting = false; // 是否在等待心跳响应
var manuallyClosed = false; // 是否主动断开（主动断开不自动重连）
var reconnectScheduled = false; // 防止 onError+onClose 重复调度重连
var isClosing = false; // 是否正在关闭旧连接（防止并发 connectSocket）
var useCloudContainer = false; // 是否使用 wx.cloud.connectContainer
// 云托管通道是否可用（首次失败后置 false，避免反复尝试刷屏）
// 项目未调用 wx.cloud.init()，wx.cloud.connectContainer 必然失败
var cloudContainerAvailable = true;

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
  return 'wss://' + baseUrl;
}

/**
 * 构建完整的 WebSocket 连接 URL（用于 wx.connectSocket 方式）
 * URL 格式：wss://host/ws/order-progress/{tenantId}?token=xxx&clientType=miniprogram
 * 注意：tenantId 必须在 path 中（后端 @ServerEndpoint("/ws/order-progress/{tenantId}")），
 *      握手拦截器 WebSocketHandshakeInterceptor 会校验 path tenantId 与 token tenantId 一致
 * @returns {string|null} 完整的 WebSocket URL，无 token/tenantId 时返回 null
 */
function buildWsUrl() {
  try {
    var baseUrl = getBaseUrl();
    if (!baseUrl) {
      if (DEBUG) console.warn('[WebSocket] getBaseUrl() 返回空，无法建立连接');
      return null;
    }
    var wsBase = toWsUrl(baseUrl);
    var token = getToken();
    if (!token) {
      if (DEBUG) console.warn('[WebSocket] 无 token，跳过连接');
      return null;
    }

    var userInfo = getUserInfo();
    var userId = userInfo && userInfo.id ? String(userInfo.id) : '';
    var tenantId = userInfo && userInfo.tenantId ? String(userInfo.tenantId) : '';
    if (!tenantId) {
      if (DEBUG) console.warn('[WebSocket] 无 tenantId，跳过连接（后端要求 tenantId 在 path 中）');
      return null;
    }

    // tenantId 走 path，其余参数走 query
    var params = ['token=' + encodeURIComponent(token)];
    if (userId) params.push('userId=' + encodeURIComponent(userId));
    params.push('clientType=miniprogram');

    return wsBase + WS_PATH_PREFIX + encodeURIComponent(tenantId) + '?' + params.join('&');
  } catch (e) {
    console.error('[WebSocket] 构建 URL 失败:', e.message || e);
    return null;
  }
}

/**
 * 检测是否可用 wx.cloud.connectContainer
 * 微信云托管专用通道，走微信私有协议，无需域名白名单
 * 注意：仅检测函数存在不够，还需 wx.cloud.init() 已调用。
 * 本项目未启用云托管，首次尝试失败后通过 cloudContainerAvailable 标志位跳过后续尝试。
 * @returns {boolean}
 */
function canUseCloudContainer() {
  if (!cloudContainerAvailable) {
    return false;
  }
  try {
    return !!(wx && wx.cloud && typeof wx.cloud.connectContainer === 'function');
  } catch (e) {
    return false;
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

    if (msg.type === 'pong') {
      handleHeartbeatResponse();
      return;
    }

    var eventType = msg.type || msg.event || '';
    if (!eventType) {
      if (DEBUG) console.warn('[WebSocket] 消息缺少事件类型:', rawData);
      return;
    }

    var payload = msg.data || msg.payload || {};

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
 * 绑定 socketTask 的事件回调
 * @param {object} task - wx.connectSocket 或 wx.cloud.connectContainer 返回的任务对象
 */
function bindSocketEvents(task) {
  // 监听连接打开
  task.onOpen(function () {
    if (DEBUG) console.log('[WebSocket] 连接已建立 (' + (useCloudContainer ? 'cloud' : 'wss') + ')');
    connectionState = 'connected';
    isClosing = false;
    reconnectCount = 0;
    clearReconnectTimer();
    reconnectScheduled = false;
    startHeartbeat();
  });

  // 监听消息
  task.onMessage(function (res) {
    if (res && res.data) {
      handleMessage(res.data);
    }
  });

  // 监听连接关闭
  // 注意：微信小程序中 onError 后一定会触发 onClose，
  // 所以只在 onClose 中调度重连，避免重复调度
  task.onClose(function (res) {
    if (DEBUG) console.log('[WebSocket] 连接关闭, code:', res.code, 'reason:', res.reason);
    connectionState = 'disconnected';
    socketTask = null;
    isClosing = false;
    stopHeartbeat();

    if (!manuallyClosed && !reconnectScheduled) {
      scheduleReconnect();
    }
  });

  // 监听连接错误
  // 注意：onError 后 onClose 一定会触发，重连逻辑放在 onClose 中
  task.onError(function (err) {
    console.error('[WebSocket] 连接错误:', err && err.errMsg ? err.errMsg : err);
  });
}

/**
 * 通过 wx.cloud.connectContainer 建立连接（微信云托管专用通道）
 * @returns {boolean} 是否成功发起连接
 */
function connectViaCloudContainer() {
  try {
    var token = getToken();
    if (!token) {
      if (DEBUG) console.warn('[WebSocket] 无 token，跳过云托管连接');
      return false;
    }

    var userInfo = getUserInfo();
    var userId = userInfo && userInfo.id ? String(userInfo.id) : '';
    var tenantId = userInfo && userInfo.tenantId ? String(userInfo.tenantId) : '';
    if (!tenantId) {
      if (DEBUG) console.warn('[WebSocket] 无 tenantId，跳过云托管连接（后端要求 tenantId 在 path 中）');
      return false;
    }

    // 构建查询参数（tenantId 走 path，与后端 @ServerEndpoint("/ws/order-progress/{tenantId}") 一致）
    var params = ['token=' + encodeURIComponent(token)];
    if (userId) params.push('userId=' + encodeURIComponent(userId));
    params.push('clientType=miniprogram');

    var wsPath = WS_PATH_PREFIX + encodeURIComponent(tenantId) + '?' + params.join('&');

    if (DEBUG) console.log('[WebSocket] 通过云托管通道连接:', wsPath.split('?')[0] + '...');

    var result = wx.cloud.connectContainer({
      path: wsPath,
    });

    if (result && result.socketTask) {
      socketTask = result.socketTask;
      useCloudContainer = true;
      bindSocketEvents(socketTask);
      if (DEBUG) console.log('[WebSocket] 云托管通道连接已发起');
      return true;
    }

    if (DEBUG) console.warn('[WebSocket] wx.cloud.connectContainer 返回空');
    return false;
  } catch (e) {
    var errMsg = e && e.message ? e.message : String(e);
    // 云托管未启用（项目未调用 wx.cloud.init）属于正常情况，静默降级
    // 标记 cloudContainerAvailable=false 避免后续重连时反复尝试刷屏
    if (errMsg.indexOf('Cloud API isn\'t enabled') !== -1 || errMsg.indexOf('wx.cloud.init') !== -1) {
      cloudContainerAvailable = false;
      if (DEBUG) console.log('[WebSocket] 云托管未启用（未调用 wx.cloud.init），后续将走标准WebSocket');
    } else {
      console.error('[WebSocket] 云托管通道连接异常:', errMsg);
    }
    return false;
  }
}

/**
 * 通过 wx.connectSocket 建立连接（标准WebSocket，走自定义域名）
 * @returns {boolean} 是否成功发起连接
 */
function connectViaWebSocket() {
  var url = buildWsUrl();
  if (!url) {
    if (DEBUG) console.warn('[WebSocket] 无法构建连接 URL，跳过连接');
    return false;
  }

  if (DEBUG) console.log('[WebSocket] 通过标准WebSocket连接:', url.split('?')[0] + '...');

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
        scheduleReconnect();
      },
    });

    if (!socketTask) {
      connectionState = 'disconnected';
      if (DEBUG) console.warn('[WebSocket] wx.connectSocket 返回空');
      return false;
    }

    useCloudContainer = false;
    bindSocketEvents(socketTask);
    return true;
  } catch (e) {
    console.error('[WebSocket] 标准WebSocket连接异常:', e.message || e);
    connectionState = 'disconnected';
    socketTask = null;
    isClosing = false;
    scheduleReconnect();
    return false;
  }
}

/**
 * 建立 WebSocket 连接
 * 优先使用 wx.cloud.connectContainer（微信云托管专用通道），
 * 不可用时回退到 wx.connectSocket（标准WebSocket）
 */
function connect() {
  // 已连接或正在连接中，不重复建立
  if (connectionState === 'connected' || connectionState === 'connecting') {
    if (DEBUG) console.log('[WebSocket] 已在连接状态，跳过');
    return;
  }

  // 微信小程序同时只允许 1 个 WebSocket 连接
  // 如果旧连接正在关闭中，延迟重试
  if (isClosing) {
    if (DEBUG) console.log('[WebSocket] 旧连接正在关闭，延迟 500ms 重试');
    setTimeout(function () { connect(); }, 500);
    return;
  }

  manuallyClosed = false;
  reconnectScheduled = false;
  connectionState = 'connecting';

  // 优先尝试微信云托管专用通道
  if (canUseCloudContainer()) {
    if (connectViaCloudContainer()) {
      return;
    }
    // 云托管通道失败，回退到标准WebSocket
    if (DEBUG) console.log('[WebSocket] 云托管通道不可用，回退到标准WebSocket');
  }

  // 标准WebSocket方式
  connectViaWebSocket();
}

/**
 * 安排重连（指数退避）
 */
function scheduleReconnect() {
  if (manuallyClosed) {
    if (DEBUG) console.log('[WebSocket] 主动断开，不自动重连');
    return;
  }

  if (reconnectScheduled) {
    if (DEBUG) console.log('[WebSocket] 重连已调度，跳过');
    return;
  }

  if (reconnectCount >= RECONNECT_MAX) {
    console.warn('[WebSocket] 已达最大重连次数(' + RECONNECT_MAX + ')，停止重连');
    return;
  }

  reconnectScheduled = true;
  clearReconnectTimer();

  var delay = getReconnectDelay();
  reconnectCount++;

  if (DEBUG) console.log('[WebSocket] 将在 ' + delay + 'ms 后重连 (第' + reconnectCount + '次)');

  reconnectTimer = setTimeout(function () {
    reconnectTimer = null;
    reconnectScheduled = false;
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

  closeSocket();

  reconnectCount = 0;
  manuallyClosed = false;

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
    isClosing = true;
    try {
      socketTask.close({});
    } catch (e) {
      isClosing = false;
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
  reconnectScheduled = false;
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
    reconnectCount = 0;
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
