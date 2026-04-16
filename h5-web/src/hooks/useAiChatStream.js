import { useRef, useCallback } from 'react';
import api from '@/api';

export default function useAiChatStream() {
  const abortRef = useRef(null);

  const startStream = useCallback(async ({ question, pageContext, conversationId, imageUrl, orderNo, processName, stage }, { onEvent, onComplete, onError, onFallback }) => {
    if (abortRef.current) abortRef.current.abort();

    const streamPayload = { question: question || (imageUrl ? '请看这张图片' : ''), pageContext: pageContext || window.location.pathname };
    if (conversationId) streamPayload.conversationId = conversationId;
    if (imageUrl) streamPayload.imageUrl = imageUrl;
    if (orderNo) streamPayload.orderNo = orderNo;
    if (processName) streamPayload.processName = processName;
    if (stage) streamPayload.stage = stage;

    let accumulatedText = '';
    let streamStarted = false;

    try {
      await new Promise((resolve, reject) => {
        const handle = api.intelligence.aiAdvisorChatStream(
          streamPayload,
          (event) => {
            streamStarted = true;
            if (event.type === 'answer' && event.data?.content) {
              accumulatedText += String(event.data.content);
            } else if (event.type === 'thinking') {
              onEvent?.({ type: 'thinking' });
            } else if (event.type === 'tool_call') {
              onEvent?.({ type: 'tool_call', name: event.data?.tool || '' });
            } else if (event.type === 'tool_result') {
              onEvent?.({ type: 'tool_result', success: event.data?.success });
            }
            onEvent?.({ type: 'text', text: accumulatedText });
          },
          () => {
            abortRef.current = null;
            onComplete?.(accumulatedText);
            resolve();
          },
          async (err) => {
            abortRef.current = null;
            if (streamStarted && accumulatedText) {
              onComplete?.(accumulatedText);
              resolve();
              return;
            }
            try {
              const reply = await onFallback?.(question, imageUrl);
              onComplete?.(reply || '抱歉，小云暂时无法回复，请稍后再试。');
            } catch (fallbackErr) {
              onError?.(fallbackErr);
            }
            resolve();
          }
        );
        abortRef.current = handle;
      });
    } catch (e) {
      onError?.(e);
    }
  }, []);

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  return { startStream, abort };
}
