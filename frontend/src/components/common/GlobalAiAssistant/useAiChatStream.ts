import { useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import { normalizeXiaoyunChatPayload } from '@/services/intelligence/xiaoyunChatAdapter';
import { createXiaoyunHandler } from '@/services/intelligence/xiaoyunUnifiedHandler';
import type { XiaoyunMood } from '@/services/intelligence/xiaoyunUnifiedHandler';
import type { HyperAdvisorResponse } from '@/services/intelligence/intelligenceApi';
import api from '@/utils/api';
import type { Message, FollowUpAction } from './types';
import { parseAiResponse } from './types';
import { describeToolName } from './helpers';

const SSE_INACTIVITY_TIMEOUT_MS = 60_000;

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
  const { setMessages, setIsTyping, location, advisorSessionId, isSuperAdmin, speak, onLiveStatusChange } = config;

  const streamAbortRef = useRef<AbortController | null>(null);
  const subRequestAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  const abort = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    subRequestAbortRef.current?.abort();
    subRequestAbortRef.current = null;
    onLiveStatusChange({ visible: false });
  }, [onLiveStatusChange]);

  const startStream = useCallback((
    contextualText: string,
    text: string,
    reportTypeToDownload?: 'daily' | 'weekly' | 'monthly',
    imageUrl?: string,
  ) => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
    if (subRequestAbortRef.current) {
      subRequestAbortRef.current.abort();
    }
    subRequestAbortRef.current = new AbortController();

    const currentSeq = ++requestSeqRef.current;
    setIsTyping(true);

    const aiMsgId = `a-${Date.now()}`;
    let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
    let accumulatedText = '';
    let completed = false;
    let answerReceived = false;
    let streamStarted = false;

    let currentLiveStatus: LiveStatus = { visible: true };
    const updateLiveStatus = (partial: Partial<LiveStatus>) => {
      currentLiveStatus = { ...currentLiveStatus, ...partial };
      onLiveStatusChange({ ...currentLiveStatus });
    };
    updateLiveStatus({ mood: 'thinking', visible: true, step: undefined, toolExecuting: undefined, elapsedMs: undefined });

    const unifiedHandler = createXiaoyunHandler({
      onStepProgress: (e) => updateLiveStatus({
        mood: 'calculating',
        step: { step: e.step, total: e.total, phase: e.phase, message: e.message },
        elapsedMs: e.elapsedMs,
      }),
      onToolExecuting: (e) => updateLiveStatus({
        mood: 'searching',
        toolExecuting: { tool: e.tool, icon: e.icon, message: e.message, parallel: e.parallel },
        elapsedMs: e.elapsedMs,
      }),
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

    const finishTyping = () => {
      if (requestSeqRef.current !== currentSeq) return;
      setIsTyping(false);
    };

    const resetInactivityTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        if (requestSeqRef.current === currentSeq) {
          if (!answerReceived && !completed) {
            setMessages(prev => {
              const existing = prev.find(m => m.id === aiMsgId);
              const errText = accumulatedText || '小云思考时间较长，请稍后再问一次试试 🤔';
              if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, text: errText } : m);
              return [...prev, { id: aiMsgId, role: 'ai' as const, text: errText }];
            });
          }
          finishTyping();
        }
      }, SSE_INACTIVITY_TIMEOUT_MS);
    };

    const fireRiskAnalysis = () => {
      const needsRiskAnalysis = /风险|延期|逾期|交期|超期|risk|overdue|delay|模拟|推演|what.?if|预测|forecast/i.test(text);
      if (!needsRiskAnalysis) return;

      const signal = subRequestAbortRef.current?.signal;
      intelligenceApi.hyperAdvisorAsk(advisorSessionId, contextualText)
        .then(resp => {
          if (signal?.aborted) return;
          const ha: HyperAdvisorResponse | undefined = (resp as any)?.code === 200
            ? (resp as any).data : ((resp as any)?.data || resp) as HyperAdvisorResponse;
          if (!ha) return;
          setMessages(prev => prev.map(m => m.id === aiMsgId ? {
            ...m, riskIndicators: ha.riskIndicators, simulation: ha.simulation,
            needsClarification: ha.needsClarification, traceId: ha.traceId,
            advisorSessionId: ha.sessionId, userQuery: text,
          } : m));
        })
        .catch(() => {});
    };

    const fireOverdueFactory = () => {
      if (!/逾期|延期|超期|overdue/i.test(accumulatedText)) return;

      const signal = subRequestAbortRef.current?.signal;
      api.get('/dashboard/overdue-factory-stats')
        .then(res => {
          if (signal?.aborted) return;
          const d = (res as any)?.data ?? res;
          if (d && d.factoryGroups?.length) {
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, overdueFactoryCard: d } : m));
          }
        })
        .catch(() => {});
    };

    const runRetryLoop = async () => {
      let retryCount = 0;
      const maxRetries = 2;
      const retryDelay = [2000, 4000];
      const signal = subRequestAbortRef.current?.signal;

      while (retryCount < maxRetries) {
        if (signal?.aborted) return;
        try {
          await new Promise(r => setTimeout(r, retryDelay[retryCount]));
          if (signal?.aborted) return;
          retryCount++;

          const retryPayload = normalizeXiaoyunChatPayload(await intelligenceApi.aiAdvisorChat(contextualText));
          const retryAnswer = retryPayload?.answer || '';
          if (retryAnswer) {
            const retryDisplay = retryPayload?.displayAnswer || retryAnswer;
            const { displayText: dt, charts: ch, cards: pc, actionCards: ac, quickActions: qa, teamStatusCards: tsc, bundleSplitCards: bsc, stepWizardCards: swc, overdueFactoryCard: ofc, reportPreview: rp, reportType: rpt } = parseAiResponse(retryAnswer);
            const retryCards = retryPayload?.cards || [];
            const retryFollowUp = (retryPayload as Record<string, unknown>)?.followUpActions as FollowUpAction[] | undefined;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m, text: retryDisplay || dt, intent: retryPayload?.source,
              charts: ch, cards: retryCards.length ? retryCards : pc,
              actionCards: ac, quickActions: qa, teamStatusCards: tsc, bundleSplitCards: bsc,
              stepWizardCards: swc, overdueFactoryCard: ofc,
              reportPreview: rp, reportType: rpt,
              agentCommandId: retryPayload?.commandId, followUpActions: retryFollowUp,
            } : m));
            speak(retryDisplay || dt);
            return;
          }
        } catch (_retryErr) {
        }
      }
      setMessages(prev => {
        const existing = prev.find(m => m.id === aiMsgId);
        const errText = '当前连不到数据服务，请稍后再试。';
        if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, text: errText } : m);
        return [...prev, { id: aiMsgId, role: 'ai' as const, text: errText }];
      });
    };

    const onDone = () => {
      if (completed) return;
      completed = true;
      if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = undefined; }
      if (!answerReceived) {
        if (!accumulatedText) {
          setMessages(prev => {
            const existing = prev.find(m => m.id === aiMsgId);
            const errText = '小云未返回有效回答，请重试或换个问法 🤔';
            if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, text: errText } : m);
            return [...prev, { id: aiMsgId, role: 'ai' as const, text: errText }];
          });
        }
        finishTyping();
      }
      updateLiveStatus({ mood: 'done' });
      setTimeout(() => updateLiveStatus({ visible: false }), 2000);
      fireRiskAnalysis();
      fireOverdueFactory();
    };

    const onError = async (err: unknown) => {
      if (completed) return;
      completed = true;
      if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = undefined; }
      updateLiveStatus({ mood: 'warning' });

      const isAuthError = typeof err === 'string' && (err.includes('401') || err.includes('登录已过期'));
      if (isAuthError) {
        setMessages(prev => {
          const existing = prev.find(m => m.id === aiMsgId);
          const errText = '登录已过期，请重新登录';
          if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, text: errText } : m);
          return [...prev, { id: aiMsgId, role: 'ai' as const, text: errText }];
        });
        finishTyping();
        return;
      }
      if (streamStarted) {
        setMessages(prev => {
          const existing = prev.find(m => m.id === aiMsgId);
          const errText = accumulatedText || '网络中断，请重试 🌧️';
          if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, text: errText } : m);
          return [...prev, { id: aiMsgId, role: 'ai' as const, text: errText }];
        });
        finishTyping();
        return;
      }
      try {
        const payload = normalizeXiaoyunChatPayload(await intelligenceApi.aiAdvisorChat(contextualText));
        const rawAnswer = payload?.answer || '当前还没拿到有效分析结果，请换个问法或稍后重试。';
        const displayAnswer = payload?.displayAnswer || rawAnswer;
        const commandId = payload?.commandId;
        const { displayText, charts, cards: parsedCards, actionCards, quickActions, teamStatusCards, bundleSplitCards, stepWizardCards: parsedStepWizardCards, overdueFactoryCard: parsedOverdueCard, reportPreview: parsedReportPreview, reportType: parsedReportType } = parseAiResponse(rawAnswer);
        const cards = payload?.cards || [];
        const followUpActions = (payload as Record<string, unknown>)?.followUpActions as FollowUpAction[] | undefined;
        setMessages(prev => {
          const existing = prev.find(m => m.id === aiMsgId);
          const msgData = {
            text: displayAnswer || displayText, intent: payload?.source,
            reportType: reportTypeToDownload || parsedReportType, reportPreview: parsedReportPreview, charts,
            cards: cards.length ? cards : parsedCards,
            actionCards, quickActions, teamStatusCards, bundleSplitCards,
            stepWizardCards: parsedStepWizardCards,
            overdueFactoryCard: parsedOverdueCard,
            agentCommandId: commandId, followUpActions,
          };
          if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, ...msgData } : m);
          return [...prev, { id: aiMsgId, role: 'ai' as const, ...msgData }];
        });
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

    try {
      const pageContext = location.pathname + location.search;
      resetInactivityTimer();

      const ctrl = intelligenceApi.aiAdvisorChatStream(
        contextualText,
        pageContext,
        (event) => {
          streamStarted = true;
          resetInactivityTimer();
          try { unifiedHandler(event.type, JSON.stringify(event.data)); } catch {}
          if (event.type === 'thinking') {
            const toolStatus = '小云正在整理思路，准备给你结论…';
            setMessages(prev => {
              const existing = prev.find(m => m.id === aiMsgId);
              if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m);
              return [...prev, { id: aiMsgId, role: 'ai' as const, text: toolStatus }];
            });
          } else if (event.type === 'tool_call') {
            const toolStatus = `小云正在处理：${describeToolName(String(event.data.tool || ''), isSuperAdmin)}…`;
            setMessages(prev => {
              const existing = prev.find(m => m.id === aiMsgId);
              if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m);
              return [...prev, { id: aiMsgId, role: 'ai' as const, text: toolStatus }];
            });
          } else if (event.type === 'tool_result') {
            const toolStatus = event.data.success
              ? `${describeToolName(String(event.data.tool || ''), isSuperAdmin)} 已处理完成，小云继续整理结果…`
              : `${describeToolName(String(event.data.tool || ''), isSuperAdmin)} 这一步没处理成功，小云正在重新组织答案…`;
            setMessages(prev => {
              const existing = prev.find(m => m.id === aiMsgId);
              if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m);
              return [...prev, { id: aiMsgId, role: 'ai' as const, text: toolStatus }];
            });
          } else if (event.type === 'progress') {
            const progressMsg = event.data.message || '';
            const progressPercent = event.data.percent || 0;
            if (progressMsg) {
              setMessages(prev => {
                const existing = prev.find(m => m.id === aiMsgId);
                if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, text: `小云正在分析（${progressPercent}%）— ${progressMsg}` } : m);
                return [...prev, { id: aiMsgId, role: 'ai' as const, text: `小云正在分析（${progressPercent}%）— ${progressMsg}` }];
              });
            }
          } else if (event.type === 'answer_chunk') {
            const chunk = String(event.data.chunk || '');
            if (chunk) {
              accumulatedText += chunk;
              setMessages(prev => {
                const existing = prev.find(m => m.id === aiMsgId);
                const currentText = accumulatedText;
                if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, text: currentText } : m);
                return [...prev, { id: aiMsgId, role: 'ai' as const, text: currentText }];
              });
            }
          } else if (event.type === 'answer') {
            const rawContent = String(event.data.content || '');
            const commandId = event.data.commandId ? String(event.data.commandId) : undefined;
            let { displayText, charts: _charts, cards, actionCards, quickActions, teamStatusCards, bundleSplitCards, stepWizardCards, overdueFactoryCard, reportPreview, reportType: parsedReportType } = parseAiResponse(rawContent);
            if (!displayText || !displayText.trim()) {
              displayText = '小云暂时无法给出回答，请稍后再试。如果持续出现，请联系管理员检查 AI 模型配置。';
            }
            accumulatedText = displayText;
            setMessages(prev => {
              const existing = prev.find(m => m.id === aiMsgId);
              const msgData = {
                text: accumulatedText,
                reportType: reportTypeToDownload || parsedReportType,
                reportPreview,
                charts: _charts, cards, actionCards, quickActions, teamStatusCards, bundleSplitCards, stepWizardCards, overdueFactoryCard,
                agentCommandId: commandId,
              };
              if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, ...msgData } : m);
              return [...prev, { id: aiMsgId, role: 'ai' as const, ...msgData }];
            });
            if (!answerReceived) {
              answerReceived = true;
              if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = undefined; }
              finishTyping();
            }
          } else if (event.type === 'follow_up_actions') {
            const actions = ((event.data as Record<string, unknown>)?.actions as FollowUpAction[] | undefined) ?? [];
            if (actions.length) {
              setMessages(prev => {
                const existing = prev.find(m => m.id === aiMsgId);
                if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, followUpActions: actions } : m);
                return [...prev, { id: aiMsgId, role: 'ai' as const, text: '', followUpActions: actions }];
              });
            }
          } else if (event.type === 'error') {
            accumulatedText = String(event.data.message || '智能分析暂时异常，请稍后再试。');
            setMessages(prev => {
              const existing = prev.find(m => m.id === aiMsgId);
              if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, text: accumulatedText } : m);
              return [...prev, { id: aiMsgId, role: 'ai' as const, text: accumulatedText }];
            });
          }
        },
        onDone,
        onError,
      );
      streamAbortRef.current = ctrl;
    } catch (_error) {
      setMessages(prev => [...prev, { id: aiMsgId, role: 'ai' as const, text: '当前连不到数据服务，请稍后再试。' }]);
      if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = undefined; }
      finishTyping();
    }
  }, [setMessages, setIsTyping, location, advisorSessionId, isSuperAdmin, speak, onLiveStatusChange]);

  return { startStream, abort, streamAbortRef };
}