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
}

interface WsInstance {
  ws: WebSocket | null;
  listeners: Map<string, Set<MessageHandler>>;
  connected: boolean;
  setConnected: (v: boolean) => void;
  connect: () => void;
  reconnectCount: number;
  heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  currentOptions: UseWebSocketOptions;
  subscriberCount: number;
}

let globalInstance: WsInstance | null = null;

function getOrCreateInstance(options: UseWebSocketOptions): WsInstance {
  if (globalInstance) {
    globalInstance.currentOptions = options;
    return globalInstance;
  }

  const state = { connected: false } as { connected: boolean };
  const setConnected = (v: boolean) => {
    state.connected = v;
    globalInstance!.connected = v;
    globalInstance!.setConnected = setConnected;
    connectedListeners.forEach(fn => fn(v));
  };

  const connectedListeners = new Set<(v: boolean) => void>();

  const inst: WsInstance = {
    ws: null,
    listeners: new Map(),
    connected: false,
    setConnected,
    connect: () => {},
    reconnectCount: 0,
    heartbeatTimer: undefined,
    reconnectTimer: undefined,
    currentOptions: options,
    subscriberCount: 0,
  };
  globalInstance = inst;

  const buildUrl = () => {
    const opts = inst.currentOptions;
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${loc.host}/ws/realtime?userId=${opts.userId}&clientType=${opts.clientType || 'pc'}&tenantId=${opts.tenantId ?? ''}`;
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
        if (import.meta.env.DEV) console.log('[WebSocket] 连接成功');
        setConnected(true);
        inst.reconnectCount = 0;
        startHeartbeat(ws);
      };
      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);
          if (msg.type === 'ping') return;
          const handlers = inst.listeners.get(msg.type);
          if (handlers) handlers.forEach(fn => { try { fn(msg); } catch { /* */ } });
          const wildcard = inst.listeners.get('*');
          if (wildcard) wildcard.forEach(fn => { try { fn(msg); } catch { /* */ } });
        } catch { /* non-JSON */ }
      };
      ws.onclose = () => {
        if (import.meta.env.DEV) console.log('[WebSocket] 连接关闭');
        setConnected(false);
        stopHeartbeat();
        inst.ws = null;
        if (document.hidden) return;
        const maxAttempts = opts.maxReconnectAttempts || 5;
        if (opts.enabled && inst.reconnectCount < maxAttempts) {
          inst.reconnectCount++;
          const interval = opts.reconnectInterval || 10000;
          const delay = Math.min(interval * Math.pow(2, inst.reconnectCount - 1), 60000);
          if (import.meta.env.DEV) console.log(`[WebSocket] ${delay / 1000}s 后重连`);
          inst.reconnectTimer = setTimeout(doConnect, delay);
        }
      };
      ws.onerror = () => { /* onclose follows */ };
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[WebSocket] 创建连接失败:', e);
    }
  };

  inst.connect = doConnect;
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
    setMyConnected(inst.connected);
    const handler = (v: boolean) => setMyConnected(v);
    const connectedListeners = (globalInstance?.setConnected as any)?._listeners as Set<(v: boolean) => void> | undefined;
    return () => { /* cleanup handled by subscriber count */ };
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
        if (inst.ws) {
          const ws = inst.ws;
          inst.ws = null;
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
