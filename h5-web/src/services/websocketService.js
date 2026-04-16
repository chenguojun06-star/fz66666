import { eventBus } from '@/utils/eventBus';
import { useAuthStore } from '@/stores/authStore';

const RECONNECT_BASE_DELAY = 3000;
const RECONNECT_MAX_DELAY = 60000;
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL = 18000;
const POLL_INTERVAL = 30000;

function resolveWsUrl() {
  let base = window.location.origin;
  if (import.meta.env.VITE_API_BASE_URL) {
    base = import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '');
  }
  return base.replace(/^http/, 'ws') + '/ws/realtime';
}

class WebSocketService {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.connecting = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.pollTimer = null;
    this.polling = false;
    this.manualClose = false;
  }

  connect() {
    if (this.connected || this.connecting) return;
    const { user, tenantId } = useAuthStore.getState();
    const userId = user?.id;
    if (!userId || !tenantId) return;

    this.manualClose = false;
    const url = resolveWsUrl()
      + '?userId=' + encodeURIComponent(userId)
      + '&clientType=h5'
      + '&tenantId=' + encodeURIComponent(tenantId);

    this.connecting = true;
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this.connecting = false;
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      this._startHeartbeat();
      this._stopPolling();
    };

    this.ws.onmessage = (event) => {
      this._handleMessage(event.data);
    };

    this.ws.onerror = () => {
      this.connected = false;
      this.connecting = false;
      this._stopHeartbeat();
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.connecting = false;
      this._stopHeartbeat();
      if (!this.manualClose) {
        this._scheduleReconnect();
      }
    };
  }

  disconnect() {
    this.manualClose = true;
    this._stopHeartbeat();
    this._stopPolling();
    this._clearReconnect();
    if (this.ws) {
      try { this.ws.close(); } catch (_e) {}
      this.ws = null;
    }
    this.connected = false;
    this.connecting = false;
  }

  _handleMessage(data) {
    try {
      const msg = typeof data === 'string' ? JSON.parse(data) : data;
      if (!msg || !msg.type) return;
      if (msg.type === 'ping') { this._send({ type: 'pong' }); return; }
      if (msg.type === 'pong') return;

      const eventType = msg.type;
      const eventData = msg.data || msg.payload || {};

      eventBus.emit(eventType, eventData);

      if (eventType === 'order:progress:changed' || eventType === 'warehouse:in') {
        eventBus.emit('DATA_REFRESH', { type: 'orders', source: 'ws', ...eventData });
      }
      if (eventType === 'scan:success' || eventType === 'scan:undo') {
        eventBus.emit('DATA_REFRESH', { type: 'scans', source: 'ws', ...eventData });
      }
      if (eventType === 'quality:checked') {
        eventBus.emit('DATA_REFRESH', { type: 'quality', source: 'ws', ...eventData });
      }
      if (eventType === 'order:status:changed') {
        eventBus.emit('DATA_REFRESH', { type: 'orders', source: 'ws', ...eventData });
      }
      if (eventType === 'data:changed') {
        eventBus.emit('DATA_REFRESH', eventData);
      }
      if (eventType === 'refresh:all') {
        eventBus.emit('DATA_REFRESH', { type: 'all', source: 'ws' });
      }
    } catch (_e) {}
  }

  _send(data) {
    if (!this.connected || !this.ws) return;
    try {
      this.ws.send(JSON.stringify(data));
    } catch (_e) {}
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) this._send({ type: 'ping' });
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
      this._startPolling();
      return;
    }
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY
    ) + Math.random() * 1000;
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      if (!this.manualClose) this.connect();
    }, delay);
  }

  _clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  _startPolling() {
    if (this.polling) return;
    this.polling = true;
    this._doPoll();
    this.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
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
  }

  _doPoll() {
    eventBus.emit('DATA_REFRESH', { type: 'all', source: 'poll' });
  }

  onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      if (!this.connected && !this.connecting && !this.manualClose) {
        this.reconnectAttempts = 0;
        this._stopPolling();
        this.connect();
      }
    }
  }
}

const wsService = new WebSocketService();

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => wsService.onVisibilityChange());
}

export { wsService };
export default wsService;
