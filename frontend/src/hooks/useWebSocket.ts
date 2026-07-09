import { useState, useCallback, useEffect, useRef } from 'react';

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

interface ProgressMessage extends Record<string, unknown> {
  orderId: string;
  orderNo: string;
  progress: number;
  stage?: string;
  timestamp: number;
}

type ProgressHandler = (msg: ProgressMessage) => void;

export function useWebSocket(options: UseWebSocketOptions) {
  const {
    userId,
    enabled = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10,
    tenantId,
    token: explicitToken,
  } = options;

  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const progressHandlersRef = useRef<Set<ProgressHandler>>(new Set());

  const connect = useCallback(() => {
    if (!enabled || !userId || tenantId === undefined) return;

    // 获取token并拼接到WebSocket URL（防止跨租户连接）
    // 项目实际存储 key 为 'authToken'（见 AuthContext.tsx / api/core.ts），不是 'token'
    const token =
      explicitToken ||
      localStorage.getItem('authToken') ||
      sessionStorage.getItem('authToken') ||
      localStorage.getItem('token');
    if (!token) {
      console.warn('[WS] 缺失token，无法建立WebSocket连接');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/order-progress/${tenantId}?token=${encodeURIComponent(token)}`;

    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WS] 连接建立:', wsUrl);
      setConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ProgressMessage;
        progressHandlersRef.current.forEach(handler => {
          try {
            handler(data);
          } catch (e) {
            console.error('[WS] 进度消息处理失败:', e);
          }
        });

        const wsMsg: WsMessage<ProgressMessage> = {
          type: 'order:progress:changed',
          payload: data,
        };
        handlersRef.current.get('order:progress:changed')?.forEach(handler => {
          try {
            handler(wsMsg);
          } catch (e) {
            console.error('[WS] 消息处理失败:', e);
          }
        });

        window.dispatchEvent(new CustomEvent('order:progress:changed', { detail: data }));
      } catch (e) {
        console.error('[WS] 消息解析失败:', event.data, e);
      }
    };

    ws.onerror = (error) => {
      console.error('[WS] 错误:', error);
    };

    ws.onclose = (event) => {
      console.log('[WS] 连接关闭:', event.code, event.reason);
      setConnected(false);

      if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        setTimeout(connect, reconnectInterval);
      }
    };

    wsRef.current = ws;
  }, [enabled, userId, tenantId, reconnectInterval, maxReconnectAttempts, explicitToken]);

  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect, enabled]);

  const subscribe = useCallback((type: string, handler: MessageHandler): (() => void) => {
    const handlers = handlersRef.current.get(type) || new Set();
    handlers.add(handler);
    handlersRef.current.set(type, handlers);

    return () => {
      const hs = handlersRef.current.get(type);
      hs?.delete(handler);
    };
  }, []);

  const subscribeProgress = useCallback((handler: ProgressHandler): (() => void) => {
    progressHandlersRef.current.add(handler);
    return () => {
      progressHandlersRef.current.delete(handler);
    };
  }, []);

  return { connected, subscribe, subscribeProgress };
}