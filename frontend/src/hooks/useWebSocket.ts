import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * WebSocket 消息结构（与后端 WebSocketMessage<T> 对应）
 */
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
  /** 用户 ID（登录后才连接） */
  userId: string | undefined;
  /** 客户端类型，默认 'pc' */
  clientType?: string;
  /** 是否启用（未登录时设为 false） */
  enabled?: boolean;
  /** 重连间隔 ms，默认 5000 */
  reconnectInterval?: number;
  /** 心跳间隔 ms，默认 30000 */
  heartbeatInterval?: number;
  /** 最大重连次数，默认 10 */
  maxReconnectAttempts?: number;
}

/**
 * WebSocket Hook — 连接后端 /ws/realtime 端点
 *
 * 使用方式：
 * ```ts
 * const { subscribe, connected } = useWebSocket({ userId: user.id, enabled: !!user });
 * useEffect(() => subscribe('tenant:application:pending', (msg) => { ... }), [subscribe]);
 * ```
 */
export function useWebSocket(options: UseWebSocketOptions) {
  const {
    userId,
    clientType = 'pc',
    enabled = true,
    reconnectInterval = 5000,
    heartbeatInterval = 18000, // 微信云托管负载均衡器60s超时，18s心跳确保不被切断
    maxReconnectAttempts = 10,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval>>();
  const reconnectCountRef = useRef(0);
  const listenersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const [connected, setConnected] = useState(false);

  /** 构建 WebSocket URL */
  const buildUrl = useCallback(() => {
    const loc = window.location;
    // 开发环境: ws://localhost:5173/ws/realtime (Vite proxy)
    // 生产环境: wss://xxx.com/ws/realtime (nginx proxy)
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${loc.host}/ws/realtime?userId=${userId}&clientType=${clientType}`;
  }, [userId, clientType]);

  /** 发送心跳 */
  const startHeartbeat = useCallback((ws: WebSocket) => {
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, heartbeatInterval);
  }, [heartbeatInterval]);

  /** 停止心跳 */
  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = undefined;
    }
  }, []);

  /** 建立连接 */
  const connect = useCallback(() => {
    if (!userId || !enabled) return;
    // 清理已有连接
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    try {
      const url = buildUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] 连接成功');
        setConnected(true);
        reconnectCountRef.current = 0;
        startHeartbeat(ws);
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);
          // 服务端主动推的 ping 直接忽略（心跳保活，无需业务处理）
          if (msg.type === 'ping') return;
          // 分发给对应 type 的监听器
          const handlers = listenersRef.current.get(msg.type);
          if (handlers) {
            handlers.forEach((fn) => {
              try { fn(msg); } catch (e) { console.error('[WebSocket] handler error:', e); }
            });
          }
          // 同时分发给 '*' 通配监听器
          const wildcard = listenersRef.current.get('*');
          if (wildcard) {
            wildcard.forEach((fn) => {
              try { fn(msg); } catch (e) { console.error('[WebSocket] wildcard handler error:', e); }
            });
          }
        } catch {
          // 非 JSON 消息，忽略
        }
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] 连接关闭:', event.code, event.reason);
        setConnected(false);
        stopHeartbeat();
        wsRef.current = null;
        // 自动重连
        if (enabled && reconnectCountRef.current < maxReconnectAttempts) {
          reconnectCountRef.current++;
          const delay = reconnectInterval * Math.min(reconnectCountRef.current, 6);
          console.log(`[WebSocket] ${delay / 1000}s 后重连 (第${reconnectCountRef.current}次)`);
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // onclose 会紧随 onerror 触发，无需额外处理
      };
    } catch (e) {
      console.warn('[WebSocket] 创建连接失败:', e);
    }
  }, [userId, enabled, buildUrl, startHeartbeat, stopHeartbeat, reconnectInterval, maxReconnectAttempts]);

  /** 订阅某类消息，返回取消订阅函数 */
  const subscribe = useCallback((type: string, handler: MessageHandler): (() => void) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(handler);
    return () => {
      listenersRef.current.get(type)?.delete(handler);
    };
  }, []);

  // 连接/断开
  useEffect(() => {
    if (enabled && userId) {
      connect();
    }
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      stopHeartbeat();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, enabled]);

  return { connected, subscribe };
}
