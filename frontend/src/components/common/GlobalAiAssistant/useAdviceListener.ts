/**
 * useAdviceListener — 监听后端推送的 AI 智能决策卡片 + ⌘K 搜索无结果事件
 *
 * 含 3 个 effect：
 * 1. window 'ai:traceable_advice' CustomEvent 监听
 * 2. WebSocket 'ai:traceable_advice' 消息监听
 * 3. window 'openAiChat' 事件监听（⌘K 搜索无结果 → 打开小云面板并预填问题）
 */
import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { WsMessage } from '@/hooks/useWebSocket';
import type { Message } from './types';
import { normalizeTraceableAdvice } from './helpers';

interface UseAdviceListenerParams {
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  setInputValue: Dispatch<SetStateAction<string>>;
  subscribe: (type: string, handler: (msg: WsMessage) => void) => (() => void) | void;
}

export function useAdviceListener({
  setMessages,
  setIsOpen,
  setInputValue,
  subscribe,
}: UseAdviceListenerParams): void {
  // ── 监听后端推送的 AI 智能决策卡片（CustomEvent） ──
  useEffect(() => {
    const handleAdvicePush = (event: Event) => {
      const customEvent = event as CustomEvent;
      const advice = normalizeTraceableAdvice(customEvent.detail);
      if (!advice) return;

      setIsOpen(true);
      setMessages(prev => [
        ...prev,
        {
          id: `advice-${Date.now()}`,
          role: 'ai',
          text: advice.summary,
          traceableAdvice: advice,
        }
      ]);
    };

    window.addEventListener('ai:traceable_advice', handleAdvicePush);
    return () => window.removeEventListener('ai:traceable_advice', handleAdvicePush);
  }, [setMessages, setIsOpen]);

  // ── 监听后端推送的 AI 智能决策卡片（WebSocket） ──
  useEffect(() => {
    return subscribe('ai:traceable_advice', (msg: WsMessage) => {
      const advice = normalizeTraceableAdvice(msg.payload);
      if (!advice) return;

      setIsOpen(true);
      setMessages(prev => [
        ...prev,
        {
          id: `advice-ws-${Date.now()}`,
          role: 'ai',
          text: advice.summary,
          traceableAdvice: advice,
        }
      ]);
    });
  }, [subscribe, setMessages, setIsOpen]);

  // ── 监听 ⌘K 搜索无结果 → 打开小云面板并预填问题 ──
  useEffect(() => {
    const handleOpenAiChat = (event: Event) => {
      const query = (event as CustomEvent).detail?.query;
      if (query) {
        setInputValue(query);
      }
      setIsOpen(true);
    };
    window.addEventListener('openAiChat', handleOpenAiChat);
    return () => window.removeEventListener('openAiChat', handleOpenAiChat);
  }, [setInputValue, setIsOpen]);
}
