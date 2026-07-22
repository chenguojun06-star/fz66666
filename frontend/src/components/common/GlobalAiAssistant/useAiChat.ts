import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { ChatHistoryMessage } from '@/services/intelligence/intelligenceApi';
import { useUser } from '@/utils/AuthContext';
import type { AiTraceCardData } from './AgentCards';
import type { Message } from './types';
import { genSessionId, saveSession, loadSession } from './sessionUtils';
import { INITIAL_MSG } from './constants';
import { buildReportInsight } from './helpers';
import { buildContextualText, detectReportType } from './helpers';
import { speakText } from './speechUtils';
import { useAiChatStream } from './useAiChatStream';
import type { LiveStatus } from './useAiChatStream';
import { useVoiceInput } from './useVoiceInput';
import { useFileAttachment } from './useFileAttachment';

export function useAiChat(antdMessage: ReturnType<typeof import('antd').App.useApp>['message']) {
  const { user } = useUser();
  const isSuperAdmin = (user as any)?.isSuperAdmin === true;
  const location = useLocation();

  const [messages, setMessages] = useState<Message[]>([INITIAL_MSG]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [downloadingType, setDownloadingType] = useState<string | null>(null);
  const [advisorSessionId, setAdvisorSessionId] = useState(loadSession);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>({ visible: false });

  const historyFetchedRef = useRef(false);
  const briefingFetchedRef = useRef(false);

  const speak = useCallback((text: string) => speakText(text, isMuted), [isMuted]);

  const { startStream, abort: abortStream, streamAbortRef } = useAiChatStream({
    setMessages,
    setIsTyping,
    location,
    advisorSessionId,
    isSuperAdmin,
    speak,
    onLiveStatusChange: setLiveStatus,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { streamAbortRef.current?.abort(); };
  }, [streamAbortRef]);

  const fetchBriefing = useCallback(() => {
    if (briefingFetchedRef.current) return;
    briefingFetchedRef.current = true;
    intelligenceApi.detectAnomalies().then(resp => {
      const data = resp?.data;
      if (!data || !data.items || data.items.length === 0) return;
      const critical = data.items.filter((a: any) => a.severity === 'critical');
      const warning = data.items.filter((a: any) => a.severity === 'warning');
      if (critical.length === 0 && warning.length === 0) return;
      const lines: string[] = ['📋 **今日智能简报**'];
      if (critical.length > 0) lines.push(`🔴 严重异常 ${critical.length} 条：${critical.map((a: any) => a.title + ' - ' + (a.targetName || '')).join('；')}`);
      if (warning.length > 0) lines.push(`🟡 风险预警 ${warning.length} 条：${warning.map((a: any) => a.title + ' - ' + (a.targetName || '')).join('；')}`);
      lines.push('可对我说「查看异常详情」或「帮我处理」');
      setMessages(prev => {
        if (prev.length > 1 && prev.some(m => m.text.includes('今日智能简报'))) return prev;
        return [...prev, { id: `briefing-${Date.now()}`, role: 'ai' as const, text: lines.join('\n') }];
      });
    }).catch(() => {});
  }, []);

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
      .catch(() => {});
  }, [advisorSessionId]);

  const handleAdvisorFeedback = useCallback((msg: Message, score: number) => {
    if (msg.agentCommandId) {
      const prmScore = score >= 4 ? 1 : -1;
      intelligenceApi.submitAiMessageFeedback({
        sessionId: advisorSessionId,
        commandId: msg.agentCommandId,
        score: prmScore,
        userQuery: msg.userQuery || '',
        aiContent: msg.text?.substring(0, 200),
      }).catch(() => {});
      return;
    }
    if (!msg.traceId) return;
    intelligenceApi.hyperAdvisorFeedback({
      sessionId: msg.advisorSessionId || advisorSessionId,
      traceId: msg.traceId,
      query: msg.userQuery || '',
      advice: msg.text,
      score,
      feedbackText: score >= 4 ? '有帮助' : '待改进',
    }).catch(() => {});
  }, [advisorSessionId]);

  const handleDownloadReport = useCallback(async (type: 'daily' | 'weekly' | 'monthly') => {
    if (downloadingType) return;
    const label = type === 'daily' ? '日报' : type === 'weekly' ? '周报' : '月报';
    setDownloadingType(type);
    try {
      const resp = await intelligenceApi.getProfessionalReportPreview(type);
      const previewData = (resp as any)?.data?.data || (resp as any)?.data;
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

    const contextualText = buildContextualText({
      pathname: location.pathname,
      search: location.search,
      messages,
      text,
      factoryId,
      factoryName,
    });

    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);
    if (!manualText) setInputValue('');

    const reportTypeToDownload = detectReportType(text);
    if (reportTypeToDownload) {
      void handleDownloadReport(reportTypeToDownload);
      return;
    }

    startStream(contextualText, text, reportTypeToDownload);
  }, [inputValue, isTyping, user, startStream, handleDownloadReport, location.pathname, location.search, messages]);

  const {
    isRecording,
    handleVoiceInput,
  } = useVoiceInput({
    handleSend,
    speak,
    setInputValue,
    setMessages,
  });

  const {
    attachedFile,
    setAttachedFile,
    uploadingFile,
    previewImage,
    setPreviewImage,
    handleFileSelect,
    handleCancelPreview,
    handleSendWithAttachment,
  } = useFileAttachment({
    inputValue,
    setInputValue,
    setMessages,
    handleSend,
    speak,
    startStream,
    user,
  });

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
    abortStream();
    const newId = genSessionId();
    saveSession(newId);
    setAdvisorSessionId(newId);
    setMessages([INITIAL_MSG]);
    setInputValue('');
    historyFetchedRef.current = true;
    setLiveStatus({ visible: false });
  }, [abortStream]);

  return {
    messages, setMessages,
    inputValue, setInputValue,
    isTyping,
    liveStatus,
    isMuted, setIsMuted,
    downloadingType,
    attachedFile, setAttachedFile,
    uploadingFile,
    isRecording,
    advisorSessionId,
    historyFetchedRef,
    previewImage,
    setPreviewImage,
    speak,
    restoreHistory,
    fetchBriefing,
    handleSend,
    handleSendWithAttachment,
    handleFileSelect,
    handleVoiceInput,
    handleDownloadReport,
    handleActualDownload,
    handleAdvisorFeedback,
    handleShowAgentTrace,
    handleShowRecentTraces,
    handleCancelPreview,
    clearChat,
  };
}
