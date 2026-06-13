import { useState, useRef, useCallback, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { ChatHistoryMessage } from '@/services/intelligence/intelligenceApi';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import type { AiTraceCardData, PurchaseDocCardData } from './AgentCards';
import type { Message } from './types';
import { genSessionId, saveSession, loadSession } from './sessionUtils';
import { INITIAL_MSG } from './constants';
import { extractOrderNo, isPurchaseDocFile, shouldAutoInbound, shouldAutoArrival, buildReportInsight } from './helpers';
import { speakText } from './speechUtils';
import { useAiChatStream } from './useAiChatStream';
import type { LiveStatus } from './useAiChatStream';

export function useAiChat(antdMessage: ReturnType<typeof import('antd').App.useApp>['message']) {
  const { user } = useUser();
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
  const [liveStatus, setLiveStatus] = useState<LiveStatus>({ visible: false });
  const [previewImage, setPreviewImage] = useState<string | null>(null);  // 图片预览


  const historyFetchedRef = useRef(false);
  const briefingFetchedRef = useRef(false);

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

    // 页面上下文感知：提取当前页面信息并注入对话上下文
    const path = location.pathname;
    const pageContextParts: string[] = [];
    const pageContextMap: Record<string, string> = {
      '/production': '生产管理模块',
      '/style-info': '款式样衣管理',
      '/finance': '财务管理',
      '/warehouse': '仓库管理',
      '/system': '系统管理',
      '/crm': '客户关系管理',
      '/cockpit': '智能决策中心',
      '/dashboard': '驾驶舱',
    };
    for (const prefix in pageContextMap) {
      if (path.startsWith(prefix)) {
        pageContextParts.push(pageContextMap[prefix]);
        break;
      }
    }
    // 提取 URL 查询参数中的重要ID（如 orderNo/styleId等）
    const searchParams = new URLSearchParams(location.search);
    for (const [k, v] of Array.from(searchParams.entries())) {
      if (['orderNo', 'styleId', 'orderId', 'styleNo', 'order'].includes(k)) {
        pageContextParts.push(`${k}:${v}`);
      }
    }
    const pageContext = pageContextParts.length > 0
      ? `[当前页面:${pageContextParts.join(' / ')}] `
      : '';

    // 检测用户是否发送了图片URL，如果是则附加视觉提示
    const imageUrlPattern = /^https?:\/\/\S+\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i;
    const isImageUrl = imageUrlPattern.test(text);
    const visionHint = isImageUrl
      ? '\n[系统提示：用户发送了一张图片URL，如果与服装相关，请主动调用视觉工具进行分析（款式识别/缺陷检测/色差检测/以图搜款）]'
      : '';

    const contextualText = factoryId
      ? `${pageContext}[工厂ID:${factoryId} 工厂名:${factoryName || ''}] ${text}${visionHint}`
      : `${pageContext}${text}${visionHint}`;

    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);
    if (!manualText) setInputValue('');

    let reportTypeToDownload: 'daily' | 'weekly' | 'monthly' | undefined;
    if (text.includes('日报')) reportTypeToDownload = 'daily';
    if (text.includes('周报')) reportTypeToDownload = 'weekly';
    if (text.includes('月报')) reportTypeToDownload = 'monthly';
    if (reportTypeToDownload) {
      void handleDownloadReport(reportTypeToDownload);
      return;
    }

    startStream(contextualText, text, reportTypeToDownload);
  }, [inputValue, isTyping, user, startStream, handleDownloadReport]);

  // 检查是否是图片文件
  const isImageFile = (file: File): boolean => {
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    return imageExts.includes(ext);
  };

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['.xlsx', '.xls', '.csv', '.jpg', '.jpeg', '.png', '.gif', '.pdf', '.webp', '.bmp'];
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!allowed.includes(ext)) { alert('只支持 Excel（xlsx/xls）、CSV、图片和 PDF 文件'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('文件大小不能超过 10MB'); return; }
    setAttachedFile(file);
    
    // 如果是图片，生成预览
    if (isImageFile(file)) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPreviewImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewImage(null);
    }
    
    e.target.value = '';
  }, []);
  
  const handleCancelPreview = useCallback(() => {
    setAttachedFile(null);
    setPreviewImage(null);
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
    
    // 处理图片上传
    if (isImageFile(attachedFile)) {
      // 生成用户消息
      const userMsgText = question 
        ? `📷 我上传了一张图片\n${question}`
        : '📷 我上传了一张图片，请帮我分析';
      
      // 添加用户消息（包含图片URL（暂不修改消息
      const userMessageId = `u-${Date.now()}`;
      setMessages(prev => [...prev, { 
        id: userMessageId, 
        role: 'user' as const, 
        text: userMsgText,
        imageUrl: previewImage || undefined
      }]);
      setInputValue('');
      const fileToUpload = attachedFile;
      setAttachedFile(null);
      setPreviewImage(null);
      
      try {
        // 构造专门处理图片
        // 使用视觉分析
        const factoryId = (user as any)?.factoryId;
        const factoryName = (user as any)?.factoryName;
        const visionInstruction = previewImage 
          ? '\n[系统提示：用户上传了一张图片，请主动调用视觉工具进行分析（款式识别/缺陷检测/色差检测/以图搜款]'
          : '';
        const contextualText = factoryId
          ? `[工厂ID:${factoryId} 工厂名:${factoryName || ''}] ${question || '请帮我分析这张图片'}${visionInstruction}`
          : `${question || '请帮我分析这张图片'}${visionInstruction}`;
        
        setUploadingFile(false);
        startStream(contextualText, question || '图片分析', undefined, previewImage || '');
      } catch {
        setUploadingFile(false);
        setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'ai' as const, text: `❌ 图片上传失败，请稍后重试。` }]);
      }
      return;
    }
    
    // 处理其他类型文件
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
  }, [attachedFile, previewImage, inputValue, handleSend, speak, isImageFile, user, startStream]);

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
    setPreviewImage,         // 新增
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