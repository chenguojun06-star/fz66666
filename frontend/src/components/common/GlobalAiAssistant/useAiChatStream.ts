import { useRef, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import { normalizeXiaoyunChatPayload } from '@/services/intelligence/xiaoyunChatAdapter';
import { createXiaoyunHandler } from '@/services/intelligence/xiaoyunUnifiedHandler';
import type { XiaoyunMood } from '@/services/intelligence/xiaoyunUnifiedHandler';
import type { HyperAdvisorResponse } from '@/services/intelligence/intelligenceApi';
import api from '@/utils/api';
import type { Message, FollowUpAction } from './types';
import { parseAiResponse } from './types';
import { describeToolName, needsRiskAnalysis, needsOverdueFactory, isAuthError } from './helpers';
import { upsertMessage, buildMessageData } from './utils';
import type { BuildMessageDataOptions } from './utils';

const SSE_INACTIVITY_TIMEOUT_MS = 30_000;

export interface LiveStatus {
  mood?: XiaoyunMood;
  step?: { step: number; total: number; phase: string; message: string };
  toolExecuting?: { tool: string; icon?: string; message?: string; parallel?: number };
  elapsedMs?: number;
  progress?: { percent: number; message: string };
  visible: boolean;
}

interface StreamConfig {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsTyping: React.Dispatch<React.SetStateAction<boolean>>;
  location: ReturnType<typeof useLocation>;
  advisorSessionId: string;
  isSuperAdmin: boolean;
  speak: (text: string) => void;
  onLiveStatusChange: (status: LiveStatus) => void;
}

export function useAiChatStream(config: StreamConfig) {
  const { location, advisorSessionId, isSuperAdmin, speak } = config;

  const streamAbortRef = useRef<AbortController | null>(null);
  const subRequestAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const scheduleTimer = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay);
    timersRef.current.push(id as unknown as number);
    return id;
  }, []);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id as unknown as number));
    timersRef.current = [];
  }, []);

  const safeSetMessages = useCallback((updater: (prev: Message[]) => Message[]) => {
    if (mountedRef.current) config.setMessages(updater);
  }, [config]);

  const safeSetIsTyping = useCallback((value: boolean) => {
    if (mountedRef.current) config.setIsTyping(value);
  }, [config]);

  const safeUpdateLiveStatus = useCallback((status: LiveStatus) => {
    if (mountedRef.current) config.onLiveStatusChange(status);
  }, [config]);

  const abort = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    subRequestAbortRef.current?.abort();
    subRequestAbortRef.current = null;
    clearAllTimers();
    safeUpdateLiveStatus({ visible: false });
  }, [clearAllTimers, safeUpdateLiveStatus]);

  const setTextMessage = useCallback((msgId: string, text: string) => {
    safeSetMessages((prev) =>
      upsertMessage(prev, msgId, (existing) =>
        existing ? { ...existing, text } : { id: msgId, role: 'ai', text },
      ),
    );
  }, [safeSetMessages]);

  const setFullMessage = useCallback((msgId: string, data: ReturnType<typeof buildMessageData>) => {
    safeSetMessages((prev) =>
      upsertMessage(prev, msgId, (existing) =>
        existing ? { ...existing, ...data } : { id: msgId, role: 'ai', ...data },
      ),
    );
  }, [safeSetMessages]);

  const startStream = useCallback((
    contextualText: string,
    text: string,
    reportTypeToDownload?: 'daily' | 'weekly' | 'monthly',
    imageUrl?: string,
  ) => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    subRequestAbortRef.current?.abort();
    subRequestAbortRef.current = new AbortController();

    const currentSeq = ++requestSeqRef.current;
    safeSetIsTyping(true);

    const aiMsgId = `a-${Date.now()}`;
    let inactivityTimer: number | undefined;
    let accumulatedText = '';
    let completed = false;
    let answerReceived = false;
    let streamStarted = false;

    let currentLiveStatus: LiveStatus = { visible: true };
    const updateLiveStatus = (partial: Partial<LiveStatus>) => {
      currentLiveStatus = { ...currentLiveStatus, ...partial };
      safeUpdateLiveStatus({ ...currentLiveStatus });
    };
    updateLiveStatus({ mood: 'thinking', visible: true, step: undefined, toolExecuting: undefined, elapsedMs: undefined });

    const finishTyping = () => {
      if (requestSeqRef.current !== currentSeq) return;
      safeSetIsTyping(false);
    };

    const resetInactivityTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = scheduleTimer(() => {
        if (requestSeqRef.current === currentSeq && !answerReceived && !completed) {
          setTextMessage(aiMsgId, accumulatedText || '小云思考时间较长，请稍后再问一次试试 🤔');
        }
        finishTyping();
      }, SSE_INACTIVITY_TIMEOUT_MS);
    };

    const unifiedHandler = createXiaoyunHandler({
      onStepProgress: (e) => updateLiveStatus({ mood: 'calculating', step: { step: e.step, total: e.total, phase: e.phase, message: e.message }, elapsedMs: e.elapsedMs }),
      onToolExecuting: (e) => updateLiveStatus({ mood: 'searching', toolExecuting: { tool: e.tool, icon: e.icon, message: e.message, parallel: e.parallel }, elapsedMs: e.elapsedMs }),
      onXiaoyunMood: (e) => updateLiveStatus({ mood: e.mood }),
      onTimeBudget: (e) => updateLiveStatus({ elapsedMs: e.elapsedMs }),
      onProgress: (e) => updateLiveStatus({ progress: { percent: e.percent, message: e.message } }),
      onHeartbeat: () => resetInactivityTimer(),
      onThinking: () => updateLiveStatus({ mood: 'thinking' }),
      onToolCall: (tool) => updateLiveStatus({ mood: 'searching', toolExecuting: { tool } }),
      onToolResult: () => updateLiveStatus({ toolExecuting: undefined }),
      onAnswer: () => updateLiveStatus({ mood: 'happy' }),
      onAnswerChunk: () => {},
      onFollowUpActions: () => {},
      onError: () => updateLiveStatus({ mood: 'warning' }),
      onDone: () => {},
    });

    const fireRiskAnalysis = () => {
      if (!needsRiskAnalysis(text)) return;
      const signal = subRequestAbortRef.current?.signal;
      intelligenceApi.hyperAdvisorAsk(advisorSessionId, contextualText)
        .then((resp) => {
          if (signal?.aborted) return;
          const ha: HyperAdvisorResponse | undefined = (resp as any)?.code === 200
            ? (resp as any).data : ((resp as any)?.data || resp) as HyperAdvisorResponse;
          if (!ha) return;
          safeSetMessages((prev) => prev.map((m) => m.id === aiMsgId ? {
            ...m, riskIndicators: ha.riskIndicators, simulation: ha.simulation,
            needsClarification: ha.needsClarification, traceId: ha.traceId,
            advisorSessionId: ha.sessionId, userQuery: text,
          } : m));
        })
        .catch(() => {});
    };

    const fireOverdueFactory = () => {
      if (!needsOverdueFactory(accumulatedText)) return;
      const signal = subRequestAbortRef.current?.signal;
      api.get('/dashboard/overdue-factory-stats')
        .then((res) => {
          if (signal?.aborted) return;
          const d = (res as any)?.data ?? res;
          if (d && d.factoryGroups?.length) {
            safeSetMessages((prev) => prev.map((m) => m.id === aiMsgId ? { ...m, overdueFactoryCard: d } : m));
          }
        })
        .catch(() => {});
    };

    const fetchAndSetAnswer = async (fallbackText: string, extraOpts: BuildMessageDataOptions = {}) => {
      const payload = normalizeXiaoyunChatPayload(await intelligenceApi.aiAdvisorChat(contextualText));
      const rawAnswer = payload?.answer || fallbackText;
      const displayAnswer = payload?.displayAnswer || rawAnswer;
      const parsed = parseAiResponse(rawAnswer);
      const followUpActions = (payload as Record<string, unknown>)?.followUpActions as FollowUpAction[] | undefined;
      const data = buildMessageData(displayAnswer, parsed, {
        intent: payload?.source,
        cardsOverride: payload?.cards,
        commandId: payload?.commandId,
        followUpActions,
        ...extraOpts,
      });
      setFullMessage(aiMsgId, data);
      return displayAnswer;
    };

    const runRetryLoop = async () => {
      const maxRetries = 2;
      const retryDelay = [2000, 4000];
      const signal = subRequestAbortRef.current?.signal;
      for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
        if (signal?.aborted) return;
        try {
          await new Promise((r) => setTimeout(r, retryDelay[retryCount]));
          if (signal?.aborted) return;
          const display = await fetchAndSetAnswer('');
          if (display) {
            speak(display);
            return;
          }
        } catch (_retryErr) {
          console.error('[useAiChatStream] 重试AI回答失败:', _retryErr);
        }
      }
      setTextMessage(aiMsgId, '当前连不到数据服务，请稍后再试。');
    };

    const onDone = () => {
      if (completed) return;
      completed = true;
      if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = undefined; }
      if (!answerReceived) {
        if (!accumulatedText) setTextMessage(aiMsgId, '小云未返回有效回答，请重试或换个问法 🤔');
        finishTyping();
      }
      safeUpdateLiveStatus({ ...currentLiveStatus, mood: 'done' });
      scheduleTimer(() => safeUpdateLiveStatus({ ...currentLiveStatus, visible: false }), 2000);
      fireRiskAnalysis();
      fireOverdueFactory();
    };

    const onError = async (err: unknown) => {
      if (completed) return;
      completed = true;
      if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = undefined; }
      updateLiveStatus({ mood: 'warning' });

      if (isAuthError(err)) {
        setTextMessage(aiMsgId, '登录已过期，请重新登录');
        finishTyping();
        return;
      }
      if (streamStarted) {
        setTextMessage(aiMsgId, accumulatedText || '网络中断，请重试 🌧️');
        finishTyping();
        return;
      }
      try {
        await fetchAndSetAnswer('当前还没拿到有效分析结果，请换个问法或稍后重试。', { reportTypeToDownload });
        finishTyping();
        return;
      } catch (_syncErr) {
        // 同步回退也失败了，进入重试循环
      }
      try {
        await runRetryLoop();
      } finally {
        finishTyping();
      }
    };

    const handleStreamEvent = (event: any) => {
      streamStarted = true;
      resetInactivityTimer();
      try { unifiedHandler(event.type, JSON.stringify(event.data)); } catch (e) { console.error('[useAiChatStream] unifiedHandler处理失败:', e); }

      switch (event.type) {
        case 'thinking':
          setTextMessage(aiMsgId, '小云正在整理思路，准备给你结论…');
          break;
        case 'tool_call':
          setTextMessage(aiMsgId, `小云正在处理：${describeToolName(String(event.data.tool || ''), isSuperAdmin)}…`);
          break;
        case 'tool_result':
          setTextMessage(aiMsgId, event.data.success
            ? `${describeToolName(String(event.data.tool || ''), isSuperAdmin)} 已处理完成，小云继续整理结果…`
            : `${describeToolName(String(event.data.tool || ''), isSuperAdmin)} 这一步没处理成功，小云正在重新组织答案…`);
          break;
        case 'progress': {
          const msg = event.data.message || '';
          const pct = event.data.percent || 0;
          if (msg) setTextMessage(aiMsgId, `小云正在分析（${pct}%）— ${msg}`);
          break;
        }
        case 'answer_chunk': {
          const chunk = String(event.data.chunk || '');
          if (chunk) {
            accumulatedText += chunk;
            setTextMessage(aiMsgId, accumulatedText);
          }
          break;
        }
        case 'answer': {
          const rawContent = String(event.data.content || '');
          const commandId = event.data.commandId ? String(event.data.commandId) : undefined;
          const parsed = parseAiResponse(rawContent);
          let displayText = parsed.displayText || '小云暂时无法给出回答，请稍后再试。如果持续出现，请联系管理员检查 AI 模型配置。';
          accumulatedText = displayText;
          setFullMessage(aiMsgId, buildMessageData(displayText, parsed, { commandId, reportTypeToDownload }));
          if (!answerReceived) {
            answerReceived = true;
            if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = undefined; }
            finishTyping();
          }
          break;
        }
        case 'follow_up_actions': {
          const actions = ((event.data as Record<string, unknown>)?.actions as FollowUpAction[] | undefined) ?? [];
          if (actions.length) {
            safeSetMessages((prev) => prev.map((m) => m.id === aiMsgId ? { ...m, followUpActions: actions } : m));
          }
          break;
        }
        case 'error':
          accumulatedText = String(event.data.message || '智能分析暂时异常，请稍后再试。');
          setTextMessage(aiMsgId, accumulatedText);
          break;
      }
    };

    try {
      const pageContext = location.pathname + location.search;
      resetInactivityTimer();
      const ctrl = intelligenceApi.aiAdvisorChatStream(
        contextualText, pageContext, handleStreamEvent, onDone, onError, imageUrl,
      );
      streamAbortRef.current = ctrl;
    } catch (_error) {
      safeSetMessages((prev) => [...prev, { id: aiMsgId, role: 'ai', text: '当前连不到数据服务，请稍后再试。' }]);
      if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = undefined; }
      finishTyping();
    }
  }, [location, advisorSessionId, isSuperAdmin, speak, safeSetIsTyping, safeSetMessages, safeUpdateLiveStatus, scheduleTimer, setTextMessage, setFullMessage]);

  return { startStream, abort, streamAbortRef };
}
