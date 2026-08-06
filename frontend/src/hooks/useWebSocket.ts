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

/** 心跳消息类型（与后端 OrderProgressWebSocketServer.onMessage 约定） */
const HEARTBEAT_PING = '{"type":"ping"}';
/** 心跳响应消息类型标识，用于在 onMessage 中过滤掉 pong */
const HEARTBEAT_PONG_TYPE = 'pong';

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
    heartbeatInterval = 25000,
    maxReconnectAttempts = 10,
    tenantId,
    token: explicitToken,
  } = options;

  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const progressHandlersRef = useRef<Set<ProgressHandler>>(new Set());
  const manualCloseRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 心跳定时器引用，连接关闭时必须清除，避免向已关闭的 socket 发数据触发 onerror
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 最近一次收到 pong 的时间戳，用于检测后端是否存活（超过 2 个心跳周期未收到则主动重连）
  const lastPongAtRef = useRef<number>(0);

  // 检查 JWT token 是否已过期（仅检查 exp 字段，不验证签名）
  const isTokenExpired = useCallback((token: string): boolean => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false; // 格式异常不阻断，交给后端校验
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (!payload.exp) return false; // 无 exp 字段，不阻断
      return Date.now() >= payload.exp * 1000;
    } catch {
      return false; // 解析失败不阻断，交给后端校验
    }
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback((ws: WebSocket) => {
    stopHeartbeat();
    lastPongAtRef.current = Date.now();
    heartbeatTimerRef.current = setInterval(() => {
      // socket 已关闭或正在关闭，停止心跳（onclose 会处理重连）
      if (ws.readyState !== WebSocket.OPEN) {
        stopHeartbeat();
        return;
      }
      try {
        ws.send(HEARTBEAT_PING);
      } catch {
        // send 失败说明连接已断开，停止心跳等 onclose 触发重连
        stopHeartbeat();
      }
      // 检测后端是否存活：超过 2 个心跳周期未收到 pong，主动关闭触发重连
      // 避免"半开连接"——前端能 send 成功但后端已断开，onclose 不会触发
      if (Date.now() - lastPongAtRef.current > heartbeatInterval * 2 + 5000) {
        console.warn('[WS] 心跳超时，后端无响应，主动重连');
        stopHeartbeat();
        try { ws.close(); } catch { /* ignore */ }
      }
    }, heartbeatInterval);
  }, [heartbeatInterval, stopHeartbeat]);

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

    // token 已过期则停止重连，避免后端反复拒绝握手刷 ERROR 日志
    if (isTokenExpired(token)) {
      console.warn('[WS] token已过期，停止WebSocket重连');
      reconnectAttemptsRef.current = maxReconnectAttempts; // 触发上限停止
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/order-progress/${tenantId}?token=${encodeURIComponent(token)}`;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (wsRef.current) {
      manualCloseRef.current = true;
      wsRef.current.close();
    }

    stopHeartbeat();
    manualCloseRef.current = false;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.debug('[WS] 连接建立');
      setConnected(true);
      reconnectAttemptsRef.current = 0;
      // 连接建立后立即启动心跳，防止中间网关 idle timeout 切断空闲连接（1006 根因）
      startHeartbeat(ws);
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);

        // 心跳响应：更新 pong 时间戳，不触发业务 handler
        if (parsed && parsed.type === HEARTBEAT_PONG_TYPE) {
          lastPongAtRef.current = Date.now();
          return;
        }

        const data = parsed as ProgressMessage;
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

    ws.onerror = () => {
      // 静默处理：onclose 会处理重连
    };

    ws.onclose = (event) => {
      setConnected(false);
      stopHeartbeat();

      // 主动关闭时不重连（React StrictMode 卸载或组件销毁）
      if (manualCloseRef.current) return;

      console.debug('[WS] 连接关闭:', event.code);

      if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        // 指数退避：5s -> 10s -> 20s -> 30s（上限30s）
        const delay = Math.min(reconnectInterval * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);
        console.debug(`[WS] ${delay / 1000}s 后重连（第${reconnectAttemptsRef.current}次）`);
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };

    wsRef.current = ws;
  }, [enabled, userId, tenantId, reconnectInterval, maxReconnectAttempts, explicitToken, isTokenExpired, startHeartbeat, stopHeartbeat]);

  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      manualCloseRef.current = true;
      stopHeartbeat();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, enabled, stopHeartbeat]);

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