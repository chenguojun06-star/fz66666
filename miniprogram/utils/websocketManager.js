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
    this._destroyed = false;
  }

  connect(userId, tenantId) {
    if (this._destroyed) return;
    if (this.connected || this.connecting) return;
    if (!userId || !tenantId) return;

    this.userId = userId;
    this.tenantId = tenantId;
    this.manualClose = false;

    var self = this;
    var baseUrl = getBaseUrl();
    var wsUrl = baseUrl.replace(/^https?/, 'wss') + '/ws/realtime';
    wsUrl += '?userId=' + encodeURIComponent(userId);
    wsUrl += '&clientType=miniprogram';
    wsUrl += '&tenantId=' + encodeURIComponent(tenantId);

    this.connecting = true;
    try {
      this.socket = wx.connectSocket({
        url: wsUrl,
        success: function() {},
        fail: function(err) {
          console.warn('[WS] connectSocket fail:', err.errMsg || err);
          self.connecting = false;
          if (self._isDomainError(err)) {
            console.warn('[WS] domain not in whitelist, switching to polling immediately');
            self._startPolling();
          } else {
            self._scheduleReconnect();
          }
        }
      });

      wx.onSocketOpen(function(res) {
        self.connected = true;
        self.connecting = false;
        self.reconnectAttempts = 0;
        console.info('[WS] connected');
        self._startHeartbeat();
        self._stopPolling();
      });

      wx.onSocketMessage(function(res) {
        self._handleMessage(res.data);
      });

      wx.onSocketError(function(err) {
        console.warn('[WS] error:', err);
        self.connected = false;
        self.connecting = false;
        self._stopHeartbeat();
        if (!self.manualClose && !self._destroyed) {
          if (self._isDomainError(err)) {
            console.warn('[WS] domain error, switching to polling');
            self._startPolling();
          } else {
            self._scheduleReconnect();
          }
        }
      });

      wx.onSocketClose(function(res) {
        self.connected = false;
        self.connecting = false;
        self._stopHeartbeat();
        if (!self.manualClose && !self._destroyed) {
          self._scheduleReconnect();
        }
      });
    } catch (e) {
      this.connecting = false;
      console.warn('[WS] connect exception:', e.message || e);
      this._scheduleReconnect();
    }
  }

  _isDomainError(err) {
    var msg = (err && (err.errMsg || err.message || String(err))) || '';
    return msg.indexOf('url not in domain list') >= 0 || msg.indexOf('合法域名') >= 0;
  }

  disconnect() {
    this.manualClose = true;
    this._destroyed = true;
    this._stopHeartbeat();
    this._stopPolling();
    this._clearReconnect();
    if (this.socket) {
      try { wx.closeSocket(); } catch (e) {}
      this.socket = null;
    }
    this.connected = false;
    this.connecting = false;
  }

  reconnect() {
    if (this._destroyed) return;
    if (this.connected || this.connecting) return;
    this.disconnect();
    this._destroyed = false;
    this.manualClose = false;
    if (this.userId && this.tenantId) {
      this.connect(this.userId, this.tenantId);
    }
  }

  _handleMessage(data) {
    try {
      var msg = typeof data === 'string' ? JSON.parse(data) : data;
      if (!msg || !msg.type) return;

      if (msg.type === 'ping') {
        this._send({ type: 'pong' });
        return;
      }
      if (msg.type === 'pong') return;

      var eventType = msg.type;
      var eventData = msg.data || msg.payload || {};

      if (Events[eventType] || eventType.includes(':')) {
        eventBus.emit(eventType, eventData);
      }

      if (eventType === 'order:progress:changed' || eventType === 'warehouse:in'
          || eventType === 'process:stage:received' || eventType === 'process:stage:completed') {
        eventBus.emit(Events.DATA_CHANGED, Object.assign({ type: 'orders', source: 'ws' }, eventData));
      }
      if (eventType === 'scan:success' || eventType === 'scan:undo') {
        eventBus.emit(Events.DATA_CHANGED, Object.assign({ type: 'scans', source: 'ws' }, eventData));
      }
      if (eventType === 'quality:checked') {
        eventBus.emit(Events.DATA_CHANGED, Object.assign({ type: 'quality', source: 'ws' }, eventData));
      }
      if (eventType === 'order:status:changed') {
        eventBus.emit(Events.DATA_CHANGED, Object.assign({ type: 'orders', source: 'ws' }, eventData));
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
        fail: function() {}
      });
    } catch (e) {}
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    var self = this;
    this.heartbeatTimer = setInterval(function() {
      try {
        if (self._destroyed) { self._stopHeartbeat(); return; }
        if (self.connected && self.pageVisible) {
          self._send({ type: 'ping' });
        }
      } catch (e) {}
    }, HEARTBEAT_INTERVAL);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      try { clearInterval(this.heartbeatTimer); } catch (e) {}
      this.heartbeatTimer = null;
    }
  }

  _scheduleReconnect() {
    if (this.manualClose || this._destroyed) return;
    this._clearReconnect();
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('[WS] max reconnect attempts reached, switching to polling');
      this._startPolling();
      return;
    }
    var delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY
    );
    delay = delay + Math.random() * 1000;
    this.reconnectAttempts++;
    console.info('[WS] reconnect in ' + Math.round(delay) + 'ms, attempt ' + this.reconnectAttempts);
    var self = this;
    this.reconnectTimer = setTimeout(function() {
      try {
        if (self._destroyed) return;
        if (self.userId && self.tenantId && !self.manualClose) {
          self.connect(self.userId, self.tenantId);
        }
      } catch (e) {}
    }, delay);
  }

  _clearReconnect() {
    if (this.reconnectTimer) {
      try { clearTimeout(this.reconnectTimer); } catch (e) {}
      this.reconnectTimer = null;
    }
  }

  onAppShow() {
    this.pageVisible = true;
    if (this._destroyed) return;
    if (!this.connected && !this.connecting && this.userId && this.tenantId) {
      this.reconnectAttempts = 0;
      this._stopPolling();
      this.connect(this.userId, this.tenantId);
    }
  }

  onAppHide() {
    this.pageVisible = false;
    this._stopHeartbeat();
  }

  isConnected() {
    return this.connected;
  }

  isPolling() {
    return this.polling;
  }

  _startPolling() {
    if (this.polling || this._destroyed) return;
    this.polling = true;
    console.info('[WS] polling fallback started (interval: ' + POLL_INTERVAL + 'ms)');
    this._doPoll();
    var self = this;
    this.pollTimer = setInterval(function() {
      try {
        if (self._destroyed) { self._stopPolling(); return; }
        if (self.pageVisible) {
          self._doPoll();
        }
      } catch (e) {}
    }, POLL_INTERVAL);
  }

  _stopPolling() {
    if (!this.polling) return;
    this.polling = false;
    if (this.pollTimer) {
      try { clearInterval(this.pollTimer); } catch (e) {}
      this.pollTimer = null;
    }
    console.info('[WS] polling fallback stopped');
  }

  _doPoll() {
    try {
      eventBus.emit(Events.DATA_CHANGED, { type: 'all', source: 'poll' });
      eventBus.emit(Events.REFRESH_ALL, { source: 'poll' });
    } catch (e) {
      console.warn('[WS] poll error:', e.message || e);
    }
  }
}

var wsManager = new WebSocketManager();

module.exports = { wsManager };
