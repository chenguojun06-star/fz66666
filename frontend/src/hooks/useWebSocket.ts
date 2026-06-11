import { useCallback } from 'react';

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

export function useWebSocket(_options: UseWebSocketOptions) {
  const subscribe = useCallback((_type: string, _handler: MessageHandler): (() => void) => {
    return () => {};
  }, []);

  return { connected: false, subscribe };
}
