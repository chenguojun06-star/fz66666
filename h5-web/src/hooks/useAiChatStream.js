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
    let finished = false;

    const finishOnce = (finalText) => {
      if (finished) return;
      finished = true;
      abortRef.current = null;
      onComplete?.(finalText);
    };

    try {
      await new Promise((resolve, reject) => {
        const handle = api.intelligence.aiAdvisorChatStream(
          streamPayload,
          (event) => {
            streamStarted = true;
            const evtType = event.type;
            const evtData = event.data || {};

            if (evtType === 'answer' && evtData?.content) {
              accumulatedText += String(evtData.content);
              onEvent?.({ type: 'text', text: accumulatedText });
            } else if (evtType === 'answer_chunk' && evtData?.content) {
              accumulatedText += String(evtData.content);
              onEvent?.({ type: 'text', text: accumulatedText });
            } else if (evtType === 'thinking') {
              onEvent?.({ type: 'thinking' });
            } else if (evtType === 'tool_call') {
              onEvent?.({ type: 'tool_call', name: evtData.tool || evtData.name || '' });
            } else if (evtType === 'tool_result') {
              onEvent?.({ type: 'tool_result', success: evtData.success !== false, name: evtData.tool || evtData.name || '' });
            } else if (evtType === 'tool_executing') {
              onEvent?.({ type: 'tool_call', name: evtData.tool || evtData.name || '处理中' });
            } else if (evtType === 'follow_up_actions') {
              onEvent?.({ type: 'follow_up_actions', actions: evtData.actions || [] });
            } else if (evtType === 'step_progress') {
              onEvent?.({ type: 'step_progress', step: evtData.step, total: evtData.total });
            } else if (evtType === 'xiaoyun_mood') {
              onEvent?.({ type: 'xiaoyun_mood', mood: evtData.mood || 'normal' });
            } else if (evtType === 'data_card') {
              onEvent?.({ type: 'data_card', card: evtData });
            } else if (evtType === 'time_budget') {
              onEvent?.({ type: 'time_budget', used: evtData.used, remaining: evtData.remaining });
            } else if (evtType === 'error') {
              onEvent?.({ type: 'error', message: evtData.message || '' });
            }
          },
          () => {
            finishOnce(accumulatedText);
            resolve();
          },
          async (err) => {
            if (streamStarted && accumulatedText) {
              finishOnce(accumulatedText);
              resolve();
              return;
            }
            try {
              const reply = await onFallback?.(question, imageUrl);
              finishOnce(reply || '抱歉，小云暂时无法回复，请稍后再试。');
            } catch (fallbackErr) {
              if (!finished) {
                finished = true;
                abortRef.current = null;
                onError?.(fallbackErr);
              }
            }
            resolve();
          }
        );
        abortRef.current = handle;
      });
    } catch (e) {
      if (!finished) {
        finished = true;
        onError?.(e);
      }
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
