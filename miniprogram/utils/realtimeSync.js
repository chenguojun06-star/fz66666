/**
 * 实时同步客户端
 * 使用WebSocket实现小程序与PC端的实时数据同步
 */

const { getApiBaseUrl } = require('./config');
const { getToken } = require('./storage');
const logger = require('./logger');

// WebSocket实例
let ws = null;

// 重连配置
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000;

// 心跳配置
let heartbeatTimer = null;
const HEARTBEAT_INTERVAL = 30000; // 30秒

// 事件监听器
const listeners = new Map();

// 连接状态
let isConnected = false;
let isConnecting = false;

/**
 * 获取WebSocket URL
 */
function getWebSocketUrl() {
  const baseUrl = getApiBaseUrl();
  // 将http/https替换为ws/wss
  const wsUrl = baseUrl.replace(/^http/, 'ws');
  const userId = getCurrentUserId();
  const clientType = 'miniprogram';
  
  return `${wsUrl}/ws/realtime?userId=${userId}&clientType=${clientType}`;
}

/**
 * 获取当前用户ID
 */
function getCurrentUserId() {
  try {
    const userInfo = wx.getStorageSync('user_info');
    return userInfo ? userInfo.id : 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

/**
 * 连接WebSocket
 */
function connect() {
  if (isConnected || isConnecting) {
    logger.debug('[RealtimeSync] WebSocket已连接或正在连接');
    return;
  }

  isConnecting = true;
  const url = getWebSocketUrl();

  logger.info('[RealtimeSync] 连接WebSocket:', url);

  ws = wx.connectSocket({
    url,
    header: {
      'Authorization': `Bearer ${getToken()}`
    }
  });

  // 连接成功
  ws.onOpen(() => {
    logger.info('[RealtimeSync] WebSocket连接成功');
    isConnected = true;
    isConnecting = false;
    reconnectAttempts = 0;
    
    // 启动心跳
    startHeartbeat();
    
    // 触发连接成功事件
    emit('connected', {});
  });

  // 收到消息
  ws.onMessage((res) => {
    try {
      const message = JSON.parse(res.data);
      logger.debug('[RealtimeSync] 收到消息:', message.type);
      
      // 处理心跳响应
      if (message.type === 'pong') {
        return;
      }
      
      // 触发对应类型的事件
      emit(message.type, message.payload);
      
      // 同时触发通用数据变更事件
      if (message.type !== 'error') {
        emit('data:changed', message);
      }
    } catch (e) {
      logger.error('[RealtimeSync] 消息解析失败:', e);
    }
  });

  // 连接关闭
  ws.onClose(() => {
    logger.warn('[RealtimeSync] WebSocket连接关闭');
    isConnected = false;
    isConnecting = false;
    stopHeartbeat();
    
    // 触发断开事件
    emit('disconnected', {});
    
    // 尝试重连
    attemptReconnect();
  });

  // 连接错误
  ws.onError((error) => {
    logger.error('[RealtimeSync] WebSocket错误:', error);
    isConnected = false;
    isConnecting = false;
    stopHeartbeat();
    
    // 触发错误事件
    emit('error', error);
  });
}

/**
 * 断开连接
 */
function disconnect() {
  logger.info('[RealtimeSync] 断开WebSocket连接');
  
  stopHeartbeat();
  reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // 防止自动重连
  
  if (ws) {
    ws.close();
    ws = null;
  }
  
  isConnected = false;
  isConnecting = false;
}

/**
 * 尝试重连
 */
function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logger.error('[RealtimeSync] 重连次数已达上限，放弃重连');
    emit('reconnect_failed', {});
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1), 30000);
  
  logger.info(`[RealtimeSync] ${delay}ms后尝试第${reconnectAttempts}次重连`);
  
  setTimeout(() => {
    connect();
  }, delay);
}

/**
 * 启动心跳
 */
function startHeartbeat() {
  stopHeartbeat();
  
  heartbeatTimer = setInterval(() => {
    if (isConnected) {
      send({
        type: 'ping',
        payload: { time: Date.now() }
      });
    }
  }, HEARTBEAT_INTERVAL);
}

/**
 * 停止心跳
 */
function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/**
 * 发送消息
 */
function send(message) {
  if (!isConnected || !ws) {
    logger.warn('[RealtimeSync] WebSocket未连接，无法发送消息');
    return false;
  }

  try {
    ws.send({
      data: JSON.stringify(message)
    });
    return true;
  } catch (e) {
    logger.error('[RealtimeSync] 发送消息失败:', e);
    return false;
  }
}

/**
 * 订阅事件
 */
function on(eventType, callback) {
  if (!listeners.has(eventType)) {
    listeners.set(eventType, new Set());
  }
  listeners.get(eventType).add(callback);
  
  // 返回取消订阅函数
  return () => {
    off(eventType, callback);
  };
}

/**
 * 取消订阅
 */
function off(eventType, callback) {
  if (listeners.has(eventType)) {
    listeners.get(eventType).delete(callback);
  }
}

/**
 * 触发事件
 */
function emit(eventType, data) {
  if (listeners.has(eventType)) {
    listeners.get(eventType).forEach(callback => {
      try {
        callback(data);
      } catch (e) {
        logger.error(`[RealtimeSync] 事件处理错误 (${eventType}):`, e);
      }
    });
  }
}

/**
 * 获取连接状态
 */
function getConnectionStatus() {
  return {
    isConnected,
    isConnecting,
    reconnectAttempts
  };
}

module.exports = {
  connect,
  disconnect,
  send,
  on,
  off,
  getConnectionStatus,
  
  // 便捷方法
  onScanSuccess: (callback) => on('scan:success', callback),
  onScanUndo: (callback) => on('scan:undo', callback),
  onOrderUpdated: (callback) => on('order:updated', callback),
  onOrderStatusChanged: (callback) => on('order:status:changed', callback),
  onOrderProgressChanged: (callback) => on('order:progress:changed', callback),
  onTaskReceived: (callback) => on('task:received', callback),
  onQualityChecked: (callback) => on('quality:checked', callback),
  onWarehouseIn: (callback) => on('warehouse:in', callback),
  onDataChanged: (callback) => on('data:changed', callback),
  onRefreshAll: (callback) => on('refresh:all', callback),
};
