import { useEffect, useRef, useCallback, useState } from 'react';

export interface WsMessage<T = Record<string, unknown>> {
  type: string;
  payload: T;
  senderId?: string;
  senderType?: string;
  targetUserId?: string;
  timestamp?: string;
  messageId?: string;
}

type MessageHandler = (msg: WsMessage) => void;

interface UseWebSocketOptions {
  userId: string | undefined;
  clientType?: string;
  enabled?: boolean;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  maxReconnectAttempts?: number;
  tenantId?: string | number;
  token?: string;
}

interface WsInstance {
  ws: WebSocket | null;
  listeners: Map<string, Set<MessageHandler>>;
  connected: boolean;
  setConnected: (v: boolean) => void;
  addConnectedListener: (fn: (v: boolean) => void) => () => void;
  connect: () => void;
  reconnectCount: number;
  heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  connectDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  currentOptions: UseWebSocketOptions;
  subscriberCount: number;
  stopFallbackPolling: () => void;
  pendingMessages: WsMessage[];
  flushTimer: ReturnType<typeof setTimeout> | undefined;
}

let globalInstance: WsInstance | null = null;

function getOrCreateInstance(options: UseWebSocketOptions): WsInstance {
  if (globalInstance) {
    globalInstance.currentOptions = options;
    return globalInstance;
  }

  const connectedListeners = new Set<(v: boolean) => void>();
  const setConnected = (v: boolean) => {
    // null 守卫：cleanup 会把 globalInstance 置为 null，
    // 而 WebSocket onopen/onclose 可能在 cleanup 之后触发（竞态），
    // 不加 null 守卫会抛出 TypeError: Cannot set properties of null (setting 'connected')
    if (globalInstance) {
      globalInstance.connected = v;
    }
    connectedListeners.forEach(fn => { try { fn(v); } catch { /* ignore */ } });
  };

  const inst: WsInstance = {
    ws: null,
    listeners: new Map(),
    connected: false,
    setConnected,
    addConnectedListener: (fn: (v: boolean) => void) => {
      connectedListeners.add(fn);
      return () => connectedListeners.delete(fn);
    },
    connect: () => {},
    reconnectCount: 0,
    heartbeatTimer: undefined,
    reconnectTimer: undefined,
    connectDebounceTimer: undefined,
    currentOptions: options,
    subscriberCount: 0,
    stopFallbackPolling: () => {},
    pendingMessages: [],
    flushTimer: undefined,
  };
  globalInstance = inst;

  const buildUrl = () => {
    const opts = inst.currentOptions;
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${loc.host}/ws/realtime?userId=${opts.userId}&clientType=${opts.clientType || 'pc'}&tenantId=${opts.tenantId ?? ''}&token=${opts.token ?? ''}`;
  };

  const dispatchMessage = (msg: WsMessage) => {
    const handlers = inst.listeners.get(msg.type);
    if (handlers) handlers.forEach(fn => { try { fn(msg); } catch { /* */ } });
    const wildcard = inst.listeners.get('*');
    if (wildcard) wildcard.forEach(fn => { try { fn(msg); } catch { /* */ } });
  };

  const flushPendingMessages = () => {
    if (inst.flushTimer) {
      clearTimeout(inst.flushTimer);
      inst.flushTimer = undefined;
    }
    const batch = inst.pendingMessages.splice(0);
    if (batch.length === 0) return;
    requestAnimationFrame(() => {
      batch.forEach(msg => dispatchMessage(msg));
    });
  };

  const enqueueMessage = (msg: WsMessage) => {
    inst.pendingMessages.push(msg);
    if (!inst.flushTimer) {
      inst.flushTimer = setTimeout(flushPendingMessages, 0);
    }
  };

  const startHeartbeat = (ws: WebSocket) => {
    if (inst.heartbeatTimer) clearInterval(inst.heartbeatTimer);
    inst.heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, options.heartbeatInterval || 18000);
  };

  const stopHeartbeat = () => {
    if (inst.heartbeatTimer) {
      clearInterval(inst.heartbeatTimer);
      inst.heartbeatTimer = undefined;
    }
  };

  let fallbackPollingTimer: ReturnType<typeof setInterval> | undefined;
  const startFallbackPolling = () => {
    if (fallbackPollingTimer) return;
    if (import.meta.env.DEV) console.debug('[WebSocket] 重连次数耗尽，启动降级轮询(30s)');
    fallbackPollingTimer = setInterval(() => {
      const opts = inst.currentOptions;
      if (!opts.enabled || !opts.userId) { stopFallbackPolling(); return; }
      if (inst.ws && inst.ws.readyState === WebSocket.OPEN) { stopFallbackPolling(); return; }
      try {
        const url = buildUrl();
        const ws = new WebSocket(url);
        ws.onopen = () => {
          if (import.meta.env.DEV) console.debug('[WebSocket] 降级轮询重连成功');
          inst.ws = ws;
          setConnected(true);
          inst.reconnectCount = 0;
          startHeartbeat(ws);
          stopFallbackPolling();
          ws.onmessage = (event) => {
            try {
              const msg: WsMessage = JSON.parse(event.data);
              if (msg.type === 'ping') return;
              enqueueMessage(msg);
            } catch { /* non-JSON */ }
          };
          ws.onclose = () => {
            setConnected(false);
            stopHeartbeat();
            inst.ws = null;
            if (document.hidden) return;
            const maxAttempts = opts.maxReconnectAttempts || 10;
            if (opts.enabled && inst.reconnectCount < maxAttempts) {
              inst.reconnectCount++;
              const interval = opts.reconnectInterval || 10000;
              const delay = Math.min(interval * Math.pow(2, inst.reconnectCount - 1), 60000);
              inst.reconnectTimer = setTimeout(doConnect, delay);
            } else if (opts.enabled) {
              startFallbackPolling();
            }
          };
          ws.onerror = () => { /* onclose follows */ };
        };
        ws.onerror = () => { try { ws.close(); } catch { /* */ } };
      } catch { /* */ }
    }, 30000);
  };
  const stopFallbackPolling = () => {
    if (fallbackPollingTimer) {
      clearInterval(fallbackPollingTimer);
      fallbackPollingTimer = undefined;
    }
  };
  inst.stopFallbackPolling = stopFallbackPolling;

  const doConnect = () => {
    const opts = inst.currentOptions;
    if (!opts.userId || !opts.enabled) return;
    if (inst.ws) {
      const old = inst.ws;
      inst.ws = null;
      old.onopen = null; old.onclose = null; old.onerror = null; old.onmessage = null;
      if (old.readyState !== WebSocket.CONNECTING) { old.close(); }
      else { old.addEventListener('open', () => { try { old.close(); } catch { /* */ } }); }
    }
    try {
      const url = buildUrl();
      const ws = new WebSocket(url);
      inst.ws = ws;
      ws.onopen = () => {
        if (import.meta.env.DEV) console.debug('[WebSocket] 连接成功');
        setConnected(true);
        inst.reconnectCount = 0;
        startHeartbeat(ws);
      };
      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);
          if (msg.type === 'ping') return;
          enqueueMessage(msg);
        } catch { /* non-JSON */ }
      };
      ws.onclose = () => {
        if (import.meta.env.DEV) console.debug('[WebSocket] 连接关闭');
        setConnected(false);
        stopHeartbeat();
        inst.ws = null;
        if (document.hidden) return;
        const maxAttempts = opts.maxReconnectAttempts || 10;
        if (opts.enabled && inst.reconnectCount < maxAttempts) {
          inst.reconnectCount++;
          const interval = opts.reconnectInterval || 10000;
          const delay = Math.min(interval * Math.pow(2, inst.reconnectCount - 1), 60000);
          if (import.meta.env.DEV) console.debug(`[WebSocket] ${delay / 1000}s 后重连`);
          inst.reconnectTimer = setTimeout(doConnect, delay);
        } else if (opts.enabled && inst.reconnectCount >= maxAttempts) {
          startFallbackPolling();
        }
      };
      ws.onerror = () => { /* onclose follows */ };
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[WebSocket] 创建连接失败:', e);
    }
  };

  const debouncedConnect = () => {
    if (inst.connectDebounceTimer) clearTimeout(inst.connectDebounceTimer);
    inst.connectDebounceTimer = setTimeout(() => {
      inst.connectDebounceTimer = undefined;
      doConnect();
    }, 300);
  };

  inst.connect = debouncedConnect;
  return inst;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const instRef = useRef<WsInstance | null>(null);
  if (!instRef.current) {
    instRef.current = getOrCreateInstance(options);
  } else {
    instRef.current.currentOptions = options;
  }
  const inst = instRef.current;

  const [connected, setMyConnected] = useState(inst.connected);

  useEffect(() => {
    // 同步初始连接状态，并订阅后续变化
    setMyConnected(inst.connected);
    const unsubscribe = inst.addConnectedListener((v) => setMyConnected(v));
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    inst.subscriberCount++;
    if (inst.subscriberCount === 1 && options.enabled && options.userId) {
      inst.connect();
    }
    return () => {
      inst.subscriberCount--;
      if (inst.subscriberCount <= 0) {
        if (inst.reconnectTimer) clearTimeout(inst.reconnectTimer);
        if (inst.heartbeatTimer) clearInterval(inst.heartbeatTimer);
        if (inst.connectDebounceTimer) clearTimeout(inst.connectDebounceTimer);
        if (inst.flushTimer) clearTimeout(inst.flushTimer);
        inst.stopFallbackPolling();
        if (inst.ws) {
          const ws = inst.ws;
          ws.onopen = null; ws.onclose = null; ws.onerror = null; ws.onmessage = null;
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
        }
        inst.connected = false;
        globalInstance = null;
      }
    };
  }, [options.enabled, options.userId]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && options.enabled && options.userId && !inst.ws) {
        inst.reconnectCount = 0;
        inst.connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [options.enabled, options.userId]);

  const subscribe = useCallback((type: string, handler: MessageHandler): (() => void) => {
    if (!inst.listeners.has(type)) inst.listeners.set(type, new Set());
    inst.listeners.get(type)!.add(handler);
    return () => { inst.listeners.get(type)?.delete(handler); };
  }, []);

  return { connected, subscribe };
}
