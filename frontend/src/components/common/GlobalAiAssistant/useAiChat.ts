import { useState, useRef, useCallback, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import { normalizeXiaoyunChatPayload } from '@/services/intelligence/xiaoyunChatAdapter';
import type { HyperAdvisorResponse, ChatHistoryMessage } from '@/services/intelligence/intelligenceApi';
import api from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import type { AiTraceCardData, PurchaseDocCardData } from './AgentCards';
import type { Message, FollowUpAction } from './types';
import { parseAiResponse } from './types';
import { genSessionId, saveSession, loadSession } from './sessionUtils';
import { INITIAL_MSG } from './constants';
import { describeToolName, extractOrderNo, isPurchaseDocFile, shouldAutoInbound, shouldAutoArrival } from './helpers';
import { speakText } from './speechUtils';

/** 基于 reportPreview 真实数据生成小云的解读文字 */
function buildReportInsight(label: string, data: any): string {
  if (!data) {
    return `📊 ${label}已生成（数据加载中），下方看板将展示核心指标。`;
  }
  const lines: string[] = [];
  lines.push(`📊 **${label}解读**（${data.rangeLabel || ''} · ${data.scope || '全公司'}）`);

  // KPI 同比变化解读
  const kpis: any[] = Array.isArray(data.kpis) ? data.kpis : [];
  if (kpis.length > 0) {
    const ups = kpis.filter(k => k.change && k.change.startsWith('+') && k.change !== '+0.0%');
    const downs = kpis.filter(k => k.change && k.change.startsWith('-'));
    const highlights: string[] = [];
    if (ups.length > 0) {
      const top = ups.sort((a, b) => parseFloat(b.change) - parseFloat(a.change))[0];
      highlights.push(`「${top.name}」${top.current.toLocaleString()}${top.unit}（环比 ${top.change} ↑）`);
    }
    if (downs.length > 0) {
      const worst = downs.sort((a, b) => parseFloat(a.change) - parseFloat(b.change))[0];
      highlights.push(`「${worst.name}」${worst.current.toLocaleString()}${worst.unit}（环比 ${worst.change} ↓）`);
    }
    if (highlights.length > 0) {
      lines.push(`📈 核心指标：${highlights.join('；')}。`);
    }
  }

  // 风险解读
  const risk = data.riskSummary || {};
  const overdue = Number(risk.overdueCount ?? 0);
  const high = Number(risk.highRiskCount ?? 0);
  const stagnant = Number(risk.stagnantCount ?? 0);
  if (overdue + high + stagnant > 0) {
    const parts: string[] = [];
    if (overdue > 0) parts.push(`逾期 ${overdue} 单`);
    if (high > 0) parts.push(`高风险 ${high} 单`);
    if (stagnant > 0) parts.push(`停滞 ${stagnant} 单`);
    lines.push(`⚠️ 风险提示：${parts.join('，')}，建议优先跟进。`);
  } else {
    lines.push(`✅ 当前无逾期 / 高风险 / 停滞订单，整体平稳。`);
  }

  // TOP 工厂
  const ranking: any[] = Array.isArray(data.factoryRanking) ? data.factoryRanking : [];
  if (ranking.length > 0) {
    const top = ranking[0];
    lines.push(`🏭 产能 TOP1：${top.name || '未命名'}（扫码 ${top.scanCount} 次 / ${top.scanQty} 件）。`);
  }

  lines.push('');
  lines.push('下方看板展示完整数据，点击底部按钮可下载 Excel 完整版。');
  return lines.join('\n');
}

export function useAiChat(antdMessage: ReturnType<typeof import('antd').App.useApp>['message']) {
  const { user } = useAuth();
  const isSuperAdmin = (user as any)?.isSuperAdmin === true;
  const location = useLocation();

  const [messages, setMessages] = useState<Message[]>([INITIAL_MSG]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [downloadingType, setDownloadingType] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [advisorSessionId, setAdvisorSessionId] = useState(loadSession);

  const streamAbortRef = useRef<AbortController | null>(null);
  const historyFetchedRef = useRef(false);

  useEffect(() => {
    return () => { streamAbortRef.current?.abort(); };
  }, []);

  const speak = useCallback((text: string) => speakText(text, isMuted), [isMuted]);

  const restoreHistory = useCallback(() => {
    if (historyFetchedRef.current) return;
    historyFetchedRef.current = true;
    intelligenceApi.hyperAdvisorHistory(advisorSessionId)
      .then((list: ChatHistoryMessage[]) => {
        if (!Array.isArray(list) || list.length === 0) return;
        const restored = list.map((m, i) => ({
          id: `hist-${i}-${m.id}`,
          role: (m.role === 'user' ? 'user' : 'ai') as 'user' | 'ai',
          text: m.content ?? '',
        }));
        setMessages(prev => prev.length <= 1 ? [INITIAL_MSG, ...restored] : prev);
      })
      .catch((e) => { console.warn('[AiChat] 历史记录加载失败:', e); });
  }, [advisorSessionId]);

  const handleAdvisorFeedback = useCallback((msg: Message, score: number) => {
    // P0: 双路径反馈 —— HyperAdvisor (traceId) 走旧路径；AI Agent (agentCommandId) 走新 PRM 路径
    if (msg.agentCommandId) {
      // AI Agent 消息: 提交到 PRM 表，score 5=👍→+2，1=👎→-2
      const prmScore = score >= 4 ? 1 : -1; // API 接受 1/-1，后端转 +2/-2
      intelligenceApi.submitAiMessageFeedback({
        sessionId: advisorSessionId,
        commandId: msg.agentCommandId,
        score: prmScore,
        userQuery: msg.userQuery || '',
        aiContent: msg.text?.substring(0, 200),
      }).catch((e) => { console.warn('[AiChat] PRM反馈提交失败:', e); });
      return;
    }
    if (!msg.traceId) return;
    // HyperAdvisor 消息: 走旧路径
    intelligenceApi.hyperAdvisorFeedback({
      sessionId: msg.advisorSessionId || advisorSessionId,
      traceId: msg.traceId,
      query: msg.userQuery || '',
      advice: msg.text,
      score,
      feedbackText: score >= 4 ? '有帮助' : '待改进',
    }).catch((e) => { console.warn('[AiChat] 反馈提交失败:', e); });
  }, [advisorSessionId]);

  const handleDownloadReport = useCallback(async (type: 'daily' | 'weekly' | 'monthly') => {
    if (downloadingType) return;
    const label = type === 'daily' ? '日报' : type === 'weekly' ? '周报' : '月报';
    setDownloadingType(type);
    try {
      // 第一步：拉取 JSON 摘要，作为看板内联展示
      const resp = await intelligenceApi.getProfessionalReportPreview(type);
      const previewData = (resp as any)?.data?.data || (resp as any)?.data;
      // 第二步：基于真实数据生成解读文字（小云对报表的洞察）
      const insightText = buildReportInsight(label, previewData);
      setMessages(prev => [...prev, {
        id: `report-${Date.now()}`,
        role: 'ai',
        text: insightText,
        reportType: type,
        reportPreview: previewData,
      }]);
      speak(`${label}已生成，看板已展示`);
    } catch {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`, role: 'ai', text: `❌ ${label}生成失败，请稍后重试。`,
      }]);
    } finally {
      setDownloadingType(null);
    }
  }, [downloadingType, speak]);

  /** 实际下载 Excel（看板下方按钮触发） */
  const handleActualDownload = useCallback(async (type: 'daily' | 'weekly' | 'monthly') => {
    const label = type === 'daily' ? '日报' : type === 'weekly' ? '周报' : '月报';
    try {
      await intelligenceApi.downloadProfessionalReport(type);
      setMessages(prev => [...prev, {
        id: `sys-${Date.now()}`, role: 'ai', text: `✅ ${label} Excel 已下载到本地。`,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`, role: 'ai', text: `❌ ${label} Excel 下载失败，请稍后重试。`,
      }]);
    }
  }, []);

  const handleSend = useCallback(async (manualText?: string) => {
    const text = (manualText || inputValue).trim();
    if (!text || isTyping) return;

    const factoryId = (user as any)?.factoryId;
    const factoryName = (user as any)?.factoryName;
    const contextualText = factoryId
      ? `[工厂ID:${factoryId} 工厂名:${factoryName || ''}] ${text}`
      : text;

    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);
    if (!manualText) setInputValue('');

    // 报告类请求直接触发下载，不走 AI（避免 AI 返回"需要更多信息"的错误响应）
    let reportTypeToDownload: 'daily' | 'weekly' | 'monthly' | undefined;
    if (text.includes('日报')) reportTypeToDownload = 'daily';
    if (text.includes('周报')) reportTypeToDownload = 'weekly';
    if (text.includes('月报')) reportTypeToDownload = 'monthly';
    if (reportTypeToDownload) {
      void handleDownloadReport(reportTypeToDownload);
      return;
    }

    setIsTyping(true);

    const aiMsgId = `a-${Date.now()}`;

    try {
      let streamStarted = false;
      let accumulatedText = '';
      let toolStatus = '';
      let completed = false;
      const pageContext = location.pathname + location.search;

      const ctrl = intelligenceApi.aiAdvisorChatStream(
        contextualText,
        pageContext,
        (event) => {
          streamStarted = true;
          if (event.type === 'thinking') {
            toolStatus = `小云正在整理思路，准备给你结论…`;
            setMessages(prev => {
              const existing = prev.find(m => m.id === aiMsgId);
              if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m);
              return [...prev, { id: aiMsgId, role: 'ai' as const, text: toolStatus }];
            });
          } else if (event.type === 'tool_call') {
            toolStatus = `小云正在处理：${describeToolName(String(event.data.tool || ''), isSuperAdmin)}…`;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m));
          } else if (event.type === 'tool_result') {
            toolStatus = event.data.success
              ? `${describeToolName(String(event.data.tool || ''), isSuperAdmin)} 已处理完成，小云继续整理结果…`
              : `${describeToolName(String(event.data.tool || ''), isSuperAdmin)} 这一步没处理成功，小云正在重新组织答案…`;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m));
          } else if (event.type === 'answer') {
            const rawContent = String(event.data.content || '');
            const commandId = event.data.commandId ? String(event.data.commandId) : undefined;
            const { displayText, charts, cards, actionCards, quickActions, teamStatusCards, bundleSplitCards, stepWizardCards, overdueFactoryCard, reportPreview, reportType: parsedReportType } = parseAiResponse(rawContent);
            accumulatedText = displayText;
            setMessages(prev => prev.map(m => m.id === aiMsgId
              ? { ...m, text: accumulatedText, reportType: reportTypeToDownload || parsedReportType, reportPreview: reportPreview, charts, cards, actionCards, quickActions, teamStatusCards, bundleSplitCards, stepWizardCards, overdueFactoryCard, agentCommandId: commandId }
              : m));
          } else if (event.type === 'follow_up_actions') {
            const actions = ((event.data as Record<string, unknown>)?.actions as FollowUpAction[] | undefined) ?? [];
            if (actions.length) {
              setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, followUpActions: actions } : m));
            }
          } else if (event.type === 'error') {
            accumulatedText = String(event.data.message || '智能分析暂时异常，请稍后再试。');
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: accumulatedText } : m));
          }
        },
        () => {
          if (completed) return;
          completed = true;
          setIsTyping(false);
          if (accumulatedText) speak(accumulatedText);
          intelligenceApi.hyperAdvisorAsk(advisorSessionId, contextualText).then(resp => {
            const ha: HyperAdvisorResponse | undefined = (resp as any)?.code === 200
              ? (resp as any).data : ((resp as any)?.data || resp) as HyperAdvisorResponse;
            if (!ha) return;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m, riskIndicators: ha.riskIndicators, simulation: ha.simulation,
              needsClarification: ha.needsClarification, traceId: ha.traceId,
              advisorSessionId: ha.sessionId, userQuery: text,
            } : m));
          }).catch((e) => { console.warn('[AiChat] 顾问请求失败:', e); });

          setMessages(prev => {
            const msg = prev.find(m => m.id === aiMsgId);
            if (msg && !msg.overdueFactoryCard && /逾期|延期|超期|overdue/i.test(accumulatedText)) {
              api.get('/dashboard/overdue-factory-stats').then(res => {
                const d = (res as any)?.data ?? res;
                if (d && d.factoryGroups?.length) {
                  setMessages(prev2 => prev2.map(m2 => m2.id === aiMsgId ? { ...m2, overdueFactoryCard: d } : m2));
                }
              }).catch(() => {});
            }
            return prev;
          });
        },
        async (err) => {
          if (completed) return;
          completed = true;
          console.warn('SSE stream failed, falling back to sync:', err);
          if (streamStarted) {
            setMessages(prev => prev.map(m => m.id === aiMsgId
              ? { ...m, text: accumulatedText || '网络中断，请重试 🌧️' } : m));
            setIsTyping(false);
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
            speak(displayAnswer || displayText);
          } catch (syncErr) {
            console.error('Sync fallback also failed:', syncErr);
            let retryCount = 0;
            const maxRetries = 2;
            const retryDelay = [2000, 4000];
            const attemptRetry = async () => {
              while (retryCount < maxRetries) {
                try {
                  await new Promise(r => setTimeout(r, retryDelay[retryCount]));
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
                } catch (retryErr) {
                  console.warn(`Retry attempt ${retryCount} failed:`, retryErr);
                }
              }
              setMessages(prev => prev.map(m => m.id === aiMsgId
                ? { ...m, text: '当前连不到数据服务，请稍后再试。' } : m));
            };
            attemptRetry();
          } finally {
            setIsTyping(false);
          }
        },
      );
      streamAbortRef.current = ctrl;
    } catch (error) {
      console.error('AI Query Error:', error);
      setMessages(prev => [...prev, { id: aiMsgId, role: 'ai', text: '当前连不到数据服务，请稍后再试。' }]);
      setIsTyping(false);
    }
  }, [inputValue, isTyping, user, location, advisorSessionId, speak]);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['.xlsx', '.xls', '.csv', '.jpg', '.jpeg', '.png', '.gif', '.pdf'];
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!allowed.includes(ext)) { alert('只支持 Excel（xlsx/xls）、CSV、图片和 PDF 文件'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('文件大小不能超过 10MB'); return; }
    setAttachedFile(file);
    e.target.value = '';
  }, []);

  const handleVoiceInput = useCallback(() => {
    // @ts-ignore
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition
             // @ts-ignore
             || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) { void handleSend('语音功能暂不支持该浏览器，请改用 Chrome。'); return; }
    if (isRecording) return;
    // @ts-ignore
    const recognition = new SR() as { lang: string; interimResults: boolean; maxAlternatives: number; start: () => void; onresult: ((e: Event) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; };
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setIsRecording(true);
    recognition.start();
    recognition.onresult = async (e: Event) => {
      // @ts-ignore
      const text = (e as { results: { [key: number]: { [key: number]: { transcript: string } } } }).results[0][0].transcript.trim();
      setIsRecording(false);
      if (!text) return;
      setInputValue(text);
      try {
        // @ts-ignore
        const res = await api.post('/intelligence/voice/command', { transcribedText: text, mode: 'QUERY' });
        // @ts-ignore
        const data = (res as Record<string, unknown>)?.data ?? res;
        const answer: string = ((data as Record<string, unknown>)?.responseText ?? (data as Record<string, unknown>)?.speakableText ?? '') as string;
        if (answer) {
          setMessages(prev => [
            ...prev,
            { id: `voice-u-${Date.now()}`, role: 'user' as const, text },
            { id: `voice-a-${Date.now()}`, role: 'ai' as const, text: answer },
          ]);
          setInputValue('');
          speak(answer);
        } else {
          void handleSend(text);
        }
      } catch {
        void handleSend(text);
      }
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
  }, [isRecording, handleSend, speak]);

  const handleSendWithAttachment = useCallback(async () => {
    if (!attachedFile) { void handleSend(); return; }
    const question = inputValue.trim();
    setUploadingFile(true);
    const userMsgText = question ? `📎 ${attachedFile.name}\n${question}` : `📎 ${attachedFile.name}`;
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user' as const, text: userMsgText }]);
    setInputValue('');
    const fileToUpload = attachedFile;
    setAttachedFile(null);
    try {
      if (isPurchaseDocFile(fileToUpload)) {
        const orderNo = extractOrderNo(question);
        const recognized = await intelligenceApi.recognizePurchaseDoc(fileToUpload, orderNo);
        const autoMode = shouldAutoInbound(question) ? 'inbound' : shouldAutoArrival(question) ? 'arrival' : null;
        let purchaseDocCard = recognized as PurchaseDocCardData;
        if (autoMode) {
          purchaseDocCard = await intelligenceApi.autoExecutePurchaseDoc({
            docId: String((recognized as Record<string, unknown>).docId || ''),
            orderNo,
            warehouseLocation: autoMode === 'inbound' ? '默认仓' : undefined,
            confirmInbound: autoMode === 'inbound',
          }) as PurchaseDocCardData;
        }
        const aiText = autoMode
          ? `我已经按采购单据识别结果执行了${autoMode === 'inbound' ? '到货并入库' : '自动到货'}，你可以在下面查看匹配和执行情况。`
          : '我已经识别了这张采购单据，你可以先查看匹配结果，也可以继续让我直接自动到货或到货入库。';
        setUploadingFile(false);
        setMessages(prev => [...prev, { id: `a-doc-${Date.now()}`, role: 'ai' as const, text: aiText, purchaseDocCard }]);
        speak(aiText);
        return;
      }
      const result = await intelligenceApi.uploadAnalyze(fileToUpload);
      setUploadingFile(false);
      await handleSend(`${question || '请帮我分析这个文件'}\n\n${result.parsedContent}`);
    } catch {
      setUploadingFile(false);
      await handleSend(question || '文件上传失败，请直接描述需求');
    }
  }, [attachedFile, inputValue, handleSend, speak]);

  const handleShowAgentTrace = useCallback(async (commandId?: string) => {
    if (!commandId) return;
    try {
      const res = await intelligenceApi.getAiAgentTraceDetail(commandId) as unknown as { data?: { data?: { logs?: AiTraceCardData['logs']; count?: number } } };
      const data = res?.data?.data;
      setMessages(prev => [...prev, {
        id: `trace-${commandId}-${Date.now()}`, role: 'ai' as const,
        text: '这是刚才这次处理的执行过程，我帮你整理成步骤了。',
        agentTraceCard: {
          commandId,
          logs: Array.isArray((data as { logs?: unknown[] })?.logs) ? (data as { logs: AiTraceCardData['logs'] }).logs : [],
          count: typeof (data as { count?: unknown })?.count === 'number' ? (data as { count: number }).count : undefined,
        },
      }]);
    } catch (error) {
      antdMessage.error(error instanceof Error ? error.message : '执行轨迹查询失败');
    }
  }, [antdMessage]);

  const handleShowRecentTraces = useCallback(async () => {
    try {
      const res = await intelligenceApi.getAiAgentRecentTraces({ limit: 8 }) as unknown as { data?: { data?: Array<Record<string, unknown>> } };
      const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
      const text = rows.length
        ? `最近小云处理记录：\n${rows.map((item, index) => `${index + 1}. ${String(item.status || '已记录')} · ${String(item.createdAt || '时间未记录')}`).join('\n')}`
        : '最近还没有可用的小云执行记录。';
      setMessages(prev => [...prev, { id: `recent-traces-${Date.now()}`, role: 'ai' as const, text }]);
    } catch (error) {
      antdMessage.error(error instanceof Error ? error.message : '最近执行记录查询失败');
    }
  }, [antdMessage]);

  const clearChat = useCallback(() => {
    const newId = genSessionId();
    saveSession(newId);
    setAdvisorSessionId(newId);
    setMessages([INITIAL_MSG]);
    setInputValue('');
    historyFetchedRef.current = true;
  }, []);

  return {
    messages, setMessages,
    inputValue, setInputValue,
    isTyping,
    isMuted, setIsMuted,
    downloadingType,
    attachedFile, setAttachedFile,
    uploadingFile,
    isRecording,
    advisorSessionId,
    historyFetchedRef,
    speak,
    restoreHistory,
    handleSend,
    handleSendWithAttachment,
    handleFileSelect,
    handleVoiceInput,
    handleDownloadReport,
    handleActualDownload,
    handleAdvisorFeedback,
    handleShowAgentTrace,
    handleShowRecentTraces,
    clearChat,
  };
}
