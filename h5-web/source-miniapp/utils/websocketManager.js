const { getBaseUrl } = require('../config');
const { eventBus, Events } = require('./eventBus');
const api = require('./api');

const RECONNECT_BASE_DELAY = 3000;
const RECONNECT_MAX_DELAY = 60000;
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL = 18000;
const POLL_INTERVAL = 30000;
const POLL_START_DELAY = 5000;

class WebSocketManager {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.connecting = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.pollTimer = null;
    this.polling = false;
    this.userId = null;
    this.tenantId = null;
    this.manualClose = false;
    this.pageVisible = true;
  }

  connect(userId, tenantId) {
    if (this.connected || this.connecting) return;
    if (!userId || !tenantId) return;

    this.userId = userId;
    this.tenantId = tenantId;
    this.manualClose = false;

    let baseUrl = getBaseUrl();
    let wsUrl = baseUrl.replace(/^https?/, 'wss') + '/ws/realtime';
    wsUrl += '?userId=' + encodeURIComponent(userId);
    wsUrl += '&clientType=miniprogram';
    wsUrl += '&tenantId=' + encodeURIComponent(tenantId);

    this.connecting = true;
    try {
      this.socket = wx.connectSocket({
        url: wsUrl,
        success: () => {},
        fail: (err) => {
          console.warn('[WS] connectSocket fail:', err.errMsg || err);
          this.connecting = false;
          this._scheduleReconnect();
        }
      });

      wx.onSocketOpen((res) => {
        this.connected = true;
        this.connecting = false;
        this.reconnectAttempts = 0;
        console.info('[WS] connected');
        this._startHeartbeat();
        this._stopPolling();
      });

      wx.onSocketMessage((res) => {
        this._handleMessage(res.data);
      });

      wx.onSocketError((err) => {
        console.warn('[WS] error:', err);
        this.connected = false;
        this.connecting = false;
        this._stopHeartbeat();
        if (!this.manualClose) {
          this._scheduleReconnect();
        }
      });

      wx.onSocketClose((res) => {
        this.connected = false;
        this.connecting = false;
        this._stopHeartbeat();
        if (!this.manualClose) {
          this._scheduleReconnect();
        }
      });
    } catch (e) {
      this.connecting = false;
      console.warn('[WS] connect exception:', e.message || e);
      this._scheduleReconnect();
    }
  }

  disconnect() {
    this.manualClose = true;
    this._stopHeartbeat();
    this._stopPolling();
    this._clearReconnect();
    if (this.socket) {
      try {
        wx.closeSocket();
      } catch (e) {}
      this.socket = null;
    }
    this.connected = false;
    this.connecting = false;
  }

  reconnect() {
    if (this.connected || this.connecting) return;
    this.disconnect();
    this.manualClose = false;
    if (this.userId && this.tenantId) {
      this.connect(this.userId, this.tenantId);
    }
  }

  _handleMessage(data) {
    try {
      let msg = typeof data === 'string' ? JSON.parse(data) : data;
      if (!msg || !msg.type) return;

      if (msg.type === 'ping') {
        this._send({ type: 'pong' });
        return;
      }
      if (msg.type === 'pong') return;

      let eventType = msg.type;
      let eventData = msg.data || msg.payload || {};

      if (Events[eventType] || eventType.includes(':')) {
        eventBus.emit(eventType, eventData);
      }

      if (eventType === 'order:progress:changed' || eventType === 'warehouse:in'
          || eventType === 'process:stage:received' || eventType === 'process:stage:completed') {
        eventBus.emit(Events.DATA_CHANGED, { type: 'orders', source: 'ws', ...eventData });
      }
      if (eventType === 'scan:success' || eventType === 'scan:undo') {
        eventBus.emit(Events.DATA_CHANGED, { type: 'scans', source: 'ws', ...eventData });
      }
      if (eventType === 'quality:checked') {
        eventBus.emit(Events.DATA_CHANGED, { type: 'quality', source: 'ws', ...eventData });
      }
      if (eventType === 'order:status:changed') {
        eventBus.emit(Events.DATA_CHANGED, { type: 'orders', source: 'ws', ...eventData });
        eventBus.emit(Events.ORDER_STATUS_CHANGED, eventData);
      }
      if (eventType === 'data:changed') {
        eventBus.emit(Events.DATA_CHANGED, eventData);
      }
      if (eventType === 'refresh:all') {
        eventBus.emit(Events.REFRESH_ALL, eventData);
      }
    } catch (e) {
      console.warn('[WS] parse message error:', e.message);
    }
  }

  _send(data) {
    if (!this.connected) return;
    try {
      wx.sendSocketMessage({
        data: JSON.stringify(data),
        fail: () => {}
      });
    } catch (e) {}
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this._send({ type: 'ping' });
      }
    }, HEARTBEAT_INTERVAL);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _scheduleReconnect() {
    if (this.manualClose) return;
    this._clearReconnect();
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('[WS] max reconnect attempts reached, switching to polling');
      this._startPolling();
      return;
    }
    let delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY
    );
    delay = delay + Math.random() * 1000;
    this.reconnectAttempts++;
    console.info('[WS] reconnect in ' + Math.round(delay) + 'ms, attempt ' + this.reconnectAttempts);
    this.reconnectTimer = setTimeout(() => {
      if (this.userId && this.tenantId && !this.manualClose) {
        this.connect(this.userId, this.tenantId);
      }
    }, delay);
  }

  _clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  onAppShow() {
    this.pageVisible = true;
    if (!this.connected && !this.connecting && this.userId && this.tenantId) {
      this.reconnectAttempts = 0;
      this._stopPolling();
      this.connect(this.userId, this.tenantId);
    }
  }

  onAppHide() {
    this.pageVisible = false;
  }

  isConnected() {
    return this.connected;
  }

  isPolling() {
    return this.polling;
  }

  _startPolling() {
    if (this.polling) return;
    this.polling = true;
    console.info('[WS] polling fallback started (interval: ' + POLL_INTERVAL + 'ms)');
    this._doPoll();
    this.pollTimer = setInterval(() => {
      if (this.pageVisible) {
        this._doPoll();
      }
    }, POLL_INTERVAL);
  }

  _stopPolling() {
    if (!this.polling) return;
    this.polling = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    console.info('[WS] polling fallback stopped');
  }

  async _doPoll() {
    try {
      eventBus.emit(Events.DATA_CHANGED, { type: 'all', source: 'poll' });
      eventBus.emit(Events.REFRESH_ALL, { source: 'poll' });
    } catch (e) {
      console.warn('[WS] poll error:', e.message || e);
    }
  }
}

const wsManager = new WebSocketManager();

module.exports = { wsManager };
