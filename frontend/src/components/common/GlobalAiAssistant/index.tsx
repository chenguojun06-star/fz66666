import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  SendOutlined,
  CloseOutlined,
  SoundOutlined,
  ExportOutlined,
  DownloadOutlined,
  LoadingOutlined,
  AudioMutedOutlined,
  ClearOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import { normalizeXiaoyunChatPayload } from '@/services/intelligence/xiaoyunChatAdapter';
import { App, Tooltip } from 'antd';
import type { HyperAdvisorResponse, ChatHistoryMessage } from '@/services/intelligence/intelligenceApi';
import api from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import { paths } from '@/routeConfig';
import XiaoyunInsightCard from '@/components/common/XiaoyunInsightCard';
import XiaoyunCloudAvatar, { CuteCloudTrigger, type XiaoyunCloudMood } from '@/components/common/XiaoyunCloudAvatar';
import styles from './index.module.css';
import MiniChartWidget from './MiniChartWidget';
import { AiTraceCardWidget, BundleSplitCardWidget, PurchaseDocCardWidget, TeamStatusCardWidget, type AiTraceCardData, type PurchaseDocCardData } from './AgentCards';
import type { Message } from './types';
import { parseAiResponse } from './types';
import { genSessionId, saveSession, loadSession, loadDismissedPending, saveDismissedPending } from './sessionUtils';
import { renderSimpleMarkdown, sanitizeHtml } from './markdownUtils';
import { INITIAL_MSG, SUGGESTIONS } from './constants';
import { describeToolName, choose, extractOrderNo, isPurchaseDocFile, shouldAutoInbound, shouldAutoArrival } from './helpers';
import ActionCardWidget from './ActionCardWidget';
import { RiskIndicatorWidget, SimulationWidget, ClarificationCard, FeedbackWidget } from './HyperAdvisorWidgets';
import { speakText } from './speechUtils';

const GlobalAiAssistant: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [_mood, setMood] = useState<XiaoyunCloudMood>('normal');
  const [messages, setMessages] = useState<Message[]>([INITIAL_MSG]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasFetchedMood, setHasFetchedMood] = useState(false);
  const [pendingItems, setPendingItems] = useState<Array<{orderNo: string; styleNo: string; factoryName: string; progress: number; daysLeft: number}>>([]);
  const [downloadingType, setDownloadingType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // ── hyper-advisor 会话（localStorage 持久化，7天过期）──
  const [advisorSessionId, setAdvisorSessionId] = useState(loadSession);

  // 每日关闭记忆
  const [dismissedPending, setDismissedPending] = useState<Set<string>>(loadDismissedPending);

  // 监听后端推送的 AI 智能决策卡片 (TraceableAdvice)
  useEffect(() => {
    const handleAdvicePush = (event: Event) => {
      const customEvent = event as CustomEvent;
      const advice = customEvent.detail;
      if (!advice || !advice.title) return;

      // 收到推送后，打开小云面板并追加消息
      setIsOpen(true);
      setMessages(prev => [
        ...prev,
        {
          id: `advice-${Date.now()}`,
          role: 'ai',
          text: advice.summary || '系统发来了一条智能建议。',
          traceableAdvice: advice,
        }
      ]);
    };

    window.addEventListener('ai:traceable_advice', handleAdvicePush);
    return () => window.removeEventListener('ai:traceable_advice', handleAdvicePush);
  }, []);

  // 监听 ⌘K 搜索无结果 → 打开小云面板并预填问题
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
  }, []);

  const dismissPendingItem = (orderNo: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedPending(prev => {
      const next = new Set(prev); next.add(orderNo); saveDismissedPending(next); return next;
    });
  };
  const visiblePendingItems = pendingItems.filter(item => !dismissedPending.has(item.orderNo));

  useEffect(() => {
    if (hasFetchedMood) return;
    const fetchStatus = async () => {
      try {
        setHasFetchedMood(true);
        const factoryId = (user as any)?.factoryId;
        // 仅管理员/老板/工厂账号才拉取公司/工厂级日报数据；普通员工保持默认 normal 状态
        const isManagerLevel = !!(user as any)?.isSuperAdmin || !!(user as any)?.isTenantOwner
          || ['admin', '管理员', '管理'].some(k => ((user as any)?.role || '').toLowerCase().includes(k));
        if (!factoryId && !isManagerLevel) return;
        const res = await api.get('/dashboard/daily-brief', factoryId ? { params: { factoryId } } : undefined);
        // @ts-ignore
        const actualData = res?.code === 200 ? res.data : (res?.data || res);
        if (actualData) {
          const { overdueOrderCount = 0, highRiskOrderCount = 0, todayScanCount = 0, pendingItems: apiPendingItems = [], topPriorityOrder } = actualData;
          let newMood: XiaoyunCloudMood = 'normal';
          let greeting = INITIAL_MSG.text;
          const seed = overdueOrderCount * 17 + highRiskOrderCount * 11 + todayScanCount;

          // 存储待办详情供 UI 展示
          if (apiPendingItems && apiPendingItems.length > 0) {
            setPendingItems(apiPendingItems);
          } else if (topPriorityOrder) {
            setPendingItems([topPriorityOrder]);
          }

          if (overdueOrderCount >= 5 || highRiskOrderCount >= 3) {
            newMood = 'urgent';
            const topHint = topPriorityOrder ? `最紧急：${topPriorityOrder.orderNo}（${topPriorityOrder.daysLeft < 0 ? '已逾期' + Math.abs(topPriorityOrder.daysLeft) + '天' : '剩' + topPriorityOrder.daysLeft + '天'}，进度${topPriorityOrder.progress}%）` : '';
            greeting = choose(seed, [
              `现在有 ${overdueOrderCount + highRiskOrderCount} 个高优先级风险。${topHint}\n我可以先按影响面帮你排处理顺序。`,
              `当前高优先级风险共 ${overdueOrderCount + highRiskOrderCount} 个。${topHint}\n建议先收口最急的几单，我可以直接给出处理次序。`,
              `风险已经堆到 ${overdueOrderCount + highRiskOrderCount} 项。${topHint}\n你可以让我先把“先做什么”排出来。`,
            ]);
          } else if (overdueOrderCount > 0 || highRiskOrderCount > 0) {
            newMood = 'curious';
            const topHint = topPriorityOrder ? `\n📌 ${topPriorityOrder.orderNo}（${topPriorityOrder.styleNo || ''}）${topPriorityOrder.daysLeft < 0 ? '已逾期' + Math.abs(topPriorityOrder.daysLeft) + '天' : '还剩' + topPriorityOrder.daysLeft + '天'}，进度${topPriorityOrder.progress}%` : '';
            greeting = choose(seed + 3, [
              `当前有 ${overdueOrderCount + highRiskOrderCount} 个待关注事项。${topHint}\n我可以继续往下拆：为什么慢、先动哪里。`,
              `现在有 ${overdueOrderCount + highRiskOrderCount} 项需要盯。${topHint}\n你可以让我直接给出优先处理顺序。`,
              `这会儿要关注的事项有 ${overdueOrderCount + highRiskOrderCount} 个。${topHint}\n我可以帮你把根因和动作排清楚。`,
            ]);
          } else if (todayScanCount > 100) {
            newMood = 'success';
            greeting = choose(seed + 5, [
              '今天节奏挺稳的呢 ✨ 继续帮你盯效率、风险和成本波动好不好～',
              '今天运行状态不错哦！要不要让我再做一轮隐患巡检看看？',
              '今天盘面挺好的～ 下一步可以看看效率和成本有没有小伏击！',
            ]);
          } else {
            newMood = 'normal';
            greeting = choose(seed + 7, [
              '你好呀！我是小云 🌤️ 有什么可以帮你的吗？随时问风险、订单进度都行哦！',
              '嘉～ 我是小云！想问风险、瓶颈还是交付进度？直接说就好啊！',
              '你好呀！我是小云 ☁️ 可以让我帮你看风险、瓶颈和交付影响～',
            ]);
            // 时间彩蛋
            const hour = new Date().getHours();
            if (hour >= 0 && hour < 6) {
               greeting = '夜猫子！🌙 还在工作呀～ 让我帮你把夜间异常和明早要做的事整理一下吧！';
            } else if (hour >= 12 && hour <= 14) {
               greeting = '午休时间搶个手～ 🍱 要不要先快速过一遍上半天的数据？';
            } else if (hour >= 19) {
               greeting = '辛苦啊！🌸 到收尾阶段了，让我帮你整理今晚要盯的订单和明天计划～';
            }
          }
          setMood(newMood);
          setMessages([{ ...INITIAL_MSG, text: greeting }]);
        }
      } catch (err) {
        console.error('Failed to fetch system mood', err);
        setMood('normal');
        setMessages([{ ...INITIAL_MSG, text: '实时数据暂时没取到，但不要紧～随时问我都行哦！' }]);
      }
    };
    fetchStatus();
  }, [hasFetchedMood]);

  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // ── 历史记录恢复（mount时从后端加载，刷新后继续对话）──
  const historyFetchedRef = useRef(false);
  useEffect(() => {
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
      .catch(() => { /* 静默降级，不影响正常使用 */ });

  }, []);

  // 监听回车和滚到底部
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages, isTyping, isOpen]);

  // 打开时自动聚焦并语音播报欢迎语（如果支持）
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
      // 初次打开时不强制播报，留给用户交互，防止扰民
    }
  }, [isOpen]);

  const handleDownloadReport = async (type: 'daily' | 'weekly' | 'monthly') => {
    if (downloadingType) return;
    const label = type === 'daily' ? '日报' : type === 'weekly' ? '周报' : '月报';
    setDownloadingType(type);
    try {
      await intelligenceApi.downloadProfessionalReport(type);
      setMessages(prev => [...prev, {
        id: `sys-${Date.now()}`,
        role: 'ai',
        text: `✅ ${label}已下载完成！Excel 格式的专业运营报告已保存到您的下载目录。`,
      }]);
      speak(`${label}已下载完成`);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'ai',
        text: `❌ ${label}下载失败，请稍后重试。`,
      }]);
    } finally {
      setDownloadingType(null);
    }
  };

  const streamAbortRef = useRef<AbortController | null>(null);

  /** hyper-advisor 反馈 */
  const handleAdvisorFeedback = useCallback((msg: Message, score: number) => {
    if (!msg.traceId) return;
    intelligenceApi.hyperAdvisorFeedback({
      sessionId: msg.advisorSessionId || advisorSessionId,
      traceId: msg.traceId,
      query: msg.userQuery || '',
      advice: msg.text,
      score,
      feedbackText: score >= 4 ? '有帮助' : '待改进',
    }).catch(() => { /* 静默 */ });
  }, [advisorSessionId]);

  const handleSend = async (manualText?: string) => {
    const text = (manualText || inputValue).trim();
    if (!text || isTyping) return;

    // 工厂账号：注入工厂上下文，让 AI 只返回本工厂数据
    const factoryId = (user as any)?.factoryId;
    const factoryName = (user as any)?.factoryName;
    const contextualText = factoryId
      ? `[工厂ID:${factoryId} 工厂名:${factoryName || ''}] ${text}`
      : text;

    // 1. 添加用户消息
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      text
    };
    setMessages(prev => [...prev, userMsg]);
    if (!manualText) setInputValue('');
    setIsTyping(true);

    // 检查如果涉及到生成报表，加上带下载按钮的标识
    let reportTypeToDownload: 'daily' | 'weekly' | 'monthly' | undefined = undefined;
    if (text.includes('日报')) reportTypeToDownload = 'daily';
    if (text.includes('周报')) reportTypeToDownload = 'weekly';
    if (text.includes('月报')) reportTypeToDownload = 'monthly';

    const aiMsgId = `a-${Date.now()}`;

    // 2. 尝试流式接口，失败则 fallback 到同步接口
    try {
      let streamStarted = false;
      let accumulatedText = '';
      let toolStatus = '';

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
              if (existing) {
                return prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m);
              }
              return [...prev, { id: aiMsgId, role: 'ai' as const, text: toolStatus }];
            });
          } else if (event.type === 'tool_call') {
            toolStatus = `小云正在处理：${describeToolName(String(event.data.tool || ''))}…`;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m));
          } else if (event.type === 'tool_result') {
            toolStatus = event.data.success
              ? `${describeToolName(String(event.data.tool || ''))} 已处理完成，小云继续整理结果…`
              : `${describeToolName(String(event.data.tool || ''))} 这一步没处理成功，小云正在重新组织答案…`;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m));
          } else if (event.type === 'answer') {
            const rawContent = String(event.data.content || '');
            const commandId = event.data.commandId ? String(event.data.commandId) : undefined;
            const { displayText, charts, cards, actionCards, quickActions, teamStatusCards, bundleSplitCards } = parseAiResponse(rawContent);
            accumulatedText = displayText;
            setMessages(prev => prev.map(m => m.id === aiMsgId
              ? { ...m, text: accumulatedText, reportType: reportTypeToDownload, charts, cards, actionCards, quickActions, teamStatusCards, bundleSplitCards, agentCommandId: commandId }
              : m));
          } else if (event.type === 'error') {
            accumulatedText = String(event.data.message || '智能分析暂时异常，请稍后再试。');
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: accumulatedText } : m));
          }
        },
        () => {
          // done — SSE 流结束后，异步调用 hyper-advisor 做风险/模拟/澄清增强
          setIsTyping(false);
          if (accumulatedText) speak(accumulatedText);
          // 异步增强：不阻塞主答复显示
          intelligenceApi.hyperAdvisorAsk(advisorSessionId, contextualText).then(resp => {
            const ha: HyperAdvisorResponse | undefined = (resp as any)?.code === 200
              ? (resp as any).data : ((resp as any)?.data || resp) as HyperAdvisorResponse;
            if (!ha) return;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              riskIndicators: ha.riskIndicators,
              simulation: ha.simulation,
              needsClarification: ha.needsClarification,
              traceId: ha.traceId,
              advisorSessionId: ha.sessionId,
              userQuery: text,
            } : m));
          }).catch(() => { /* 增强失败静默降级 */ });
        },
        async (err) => {
          // SSE 失败，fallback 到同步接口
          console.warn('SSE stream failed, falling back to sync:', err);
          if (streamStarted) {
            // 流已经开始了部分数据，直接报错
            setMessages(prev => prev.map(m => m.id === aiMsgId
              ? { ...m, text: accumulatedText || '网络中断，请重试 🌧️' }
              : m));
            setIsTyping(false);
            return;
          }
          try {
            const payload = normalizeXiaoyunChatPayload(await intelligenceApi.aiAdvisorChat(contextualText));
            const rawAnswer = payload?.answer || '当前还没拿到有效分析结果，请换个问法或稍后重试。';
            const displayAnswer = payload?.displayAnswer || rawAnswer;
            const commandId = payload?.commandId;
            const { displayText, charts, cards: parsedCards, actionCards, quickActions, teamStatusCards, bundleSplitCards } = parseAiResponse(rawAnswer);
            const cards = payload?.cards || [];
            setMessages(prev => {
              const existing = prev.find(m => m.id === aiMsgId);
              if (existing) {
                return prev.map(m => m.id === aiMsgId ? {
                  ...m,
                  text: displayAnswer || displayText,
                  intent: payload?.source,
                  reportType: reportTypeToDownload,
                  charts,
                  cards: cards.length ? cards : parsedCards,
                  actionCards,
                  quickActions,
                  teamStatusCards,
                  bundleSplitCards,
                  agentCommandId: commandId,
                } : m);
              }
              return [...prev, {
                id: aiMsgId,
                role: 'ai' as const,
                text: displayAnswer || displayText,
                intent: payload?.source,
                reportType: reportTypeToDownload,
                charts,
                cards: cards.length ? cards : parsedCards,
                actionCards,
                quickActions,
                teamStatusCards,
                bundleSplitCards,
                agentCommandId: commandId,
              }];
            });
            speak(displayAnswer || displayText);
          } catch (syncErr) {
            console.error('Sync fallback also failed:', syncErr);
            setMessages(prev => [...prev, { id: aiMsgId, role: 'ai' as const, text: '当前连不到数据服务，请稍后再试。' }]);
          } finally {
            setIsTyping(false);
          }
        },
      );
      streamAbortRef.current = ctrl;
    } catch (error) {
      console.error('AI Query Error:', error);
      setMessages(prev => [...prev, {
        id: aiMsgId,
        role: 'ai',
        text: '当前连不到数据服务，请稍后再试。'
      }]);
      setIsTyping(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['.xlsx', '.xls', '.csv', '.jpg', '.jpeg', '.png', '.gif', '.pdf'];
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!allowed.includes(ext)) { alert('只支持 Excel（xlsx/xls）、CSV、图片和 PDF 文件'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('文件大小不能超过 10MB'); return; }
    setAttachedFile(file);
    e.target.value = '';
  };

  /** Stage10 — 语音录入：WebSpeechAPI 识别 → POST /intelligence/voice/command → 显示回答并朗读 */
  const handleVoiceInput = () => {
    // @ts-ignore – SpeechRecognition 在部分 TS 版本下需要忽略
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
  };

  const handleSendWithAttachment = async () => {
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
        setMessages(prev => [...prev, {
          id: `a-doc-${Date.now()}`,
          role: 'ai' as const,
          text: aiText,
          purchaseDocCard,
        }]);
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
  };

  const handleShowAgentTrace = async (commandId?: string) => {
    if (!commandId) return;
    try {
      const res = await intelligenceApi.getAiAgentTraceDetail(commandId) as unknown as { data?: { data?: { logs?: AiTraceCardData['logs']; count?: number } } };
      const data = res?.data?.data;
      setMessages(prev => [...prev, {
        id: `trace-${commandId}-${Date.now()}`,
        role: 'ai' as const,
        text: '这是刚才这次处理的执行过程，我帮你整理成步骤了。',
        agentTraceCard: {
          commandId,
          logs: Array.isArray((data as { logs?: unknown[] })?.logs) ? (data as { logs: AiTraceCardData['logs'] }).logs : [],
          count: typeof (data as { count?: unknown })?.count === 'number' ? (data as { count: number }).count : undefined,
        },
      }]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '执行轨迹查询失败');
    }
  };

  const handleShowRecentTraces = async () => {
    try {
      const res = await intelligenceApi.getAiAgentRecentTraces({ limit: 8 }) as unknown as { data?: { data?: Array<Record<string, unknown>> } };
      const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
      const text = rows.length
        ? `最近小云处理记录：\n${rows.map((item, index) => `${index + 1}. ${String(item.status || '已记录')} · ${String(item.createdAt || '时间未记录')}`).join('\n')}`
        : '最近还没有可用的小云执行记录。';
      setMessages(prev => [...prev, { id: `recent-traces-${Date.now()}`, role: 'ai' as const, text }]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '最近执行记录查询失败');
    }
  };

  const openTraceCenter = (commandId?: string) => {
    const search = commandId ? `?commandId=${encodeURIComponent(commandId)}` : '';
    setIsOpen(false);
    navigate(`${paths.cockpitTrace}${search}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (attachedFile) { void handleSendWithAttachment(); } else { void handleSend(); }
    }
  };

  const speak = (text: string) => speakText(text, isMuted);

  const jumpToIntelligenceCenter = (_query: string) => {
    setIsOpen(false);
    // 如果已经在智能驾驶舱，不跨路由跳转仅提示
    if (location.pathname !== '/cockpit') {
      navigate('/cockpit');
    }
  };

  return (
    <div className={styles.assistantWrapper}>
      {/* 弹出的对话面板 */}
      {isOpen && (
        <div className={styles.chatPanel}>
          {/* Header */}
          <div className={styles.panelHeader}>
            <div className={styles.avatarContainer}>
              <CuteCloudTrigger size={40} active />
            </div>
            <div className={styles.headerText}>
              <div className={styles.headerTitle}>小云 智能助理</div>
              <div className={styles.headerSubtitle}>云裳智链 · 实时判断与执行协作</div>
            </div>
            <div className={styles.headerActions}>
              {isMuted ? (
                <AudioMutedOutlined
                  className={styles.headerActionBtn}
                  onClick={() => setIsMuted(false)}
                  title="取消静音"
                />
              ) : (
                <SoundOutlined
                  className={styles.headerActionBtn}
                  onClick={() => setIsMuted(true)}
                  title="静音"
                />
              )}
              <ClearOutlined
                className={styles.headerActionBtn}
                onClick={() => {
                  const newId = genSessionId();
                  saveSession(newId);
                  setAdvisorSessionId(newId);
                  setMessages([INITIAL_MSG]);
                  setPendingItems([]);
                  setInputValue('');
                  setHasFetchedMood(false);
                  historyFetchedRef.current = true; // 防止重新加载旧历史
                }}
                title="清空对话"
              />
              <CloseOutlined
                className={`${styles.headerActionBtn} ${styles.closeBtnIcon}`}
                onClick={() => setIsOpen(false)}
                title="关闭"
              />
            </div>
          </div>

          {/* Chat List */}
          <div className={styles.chatArea} ref={chatAreaRef}>
            {/* 预警待办 - 每日可关闭，下一天重新显示 */}
            {messages.length === 1 && visiblePendingItems.length > 0 && (
              <div className={styles.pendingItems}>
                {visiblePendingItems.map((item: any) => {
                  const dl = item.daysLeft;
                  const status = dl < 0 ? `已逾期${Math.abs(dl)}天` : dl === 0 ? '今天到期' : `剩${dl}天`;
                  return (
                    <div key={item.orderNo} className={styles.pendingItem} style={{position:'relative'}}
                      onClick={() => { setIsOpen(false); navigate(`/production?orderNo=${encodeURIComponent(item.orderNo)}`); }}
                    >
                      <span>⚠️</span>
                      <span style={{flex:1}}>{item.orderNo}{item.styleNo ? `（${item.styleNo}）` : ''} — {status}，进度{item.progress}%</span>
                      <span style={{color:'#1890ff',fontSize:11}}>查看 →</span>
                      <button
                        className={styles.pendingDismissBtn}
                        onClick={(e) => dismissPendingItem(item.orderNo, e)}
                        title="今日不再提醒"
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}
            {messages.length === 1 && (
              <>
                <div className={styles.quickHint}>
                  直接自然语言输入就可以，下面只是常用示例
                </div>
                <div className={styles.suggestionChips}>
                  {SUGGESTIONS.map(q => (
                    <div key={q} className={styles.chip} onClick={() => handleSend(q)}>
                      {q}
                    </div>
                  ))}
                </div>
              </>
            )}

            {messages.map(msg => (
              <div
                key={msg.id}
                className={`${styles.messageRow} ${msg.role === 'ai' ? styles.rowAi : styles.rowUser}`}
              >
                {msg.role === 'ai' && (
                  <div className={styles.messageAvatar}>
                    <XiaoyunCloudAvatar size={24} active />
                  </div>
                )}

                <div className={`${styles.messageBubble} ${msg.role === 'ai' ? styles.bubbleAi : styles.bubbleUser}`}>
                  {msg.role === 'ai' ? (
                    <div
                      className={styles.mdContent}
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(renderSimpleMarkdown(
                          msg.text.includes('【推荐追问】：')
                            ? msg.text.split('【推荐追问】：')[0]
                            : msg.text
                        ))
                      }}
                    />
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                  )}
                  {msg.text.includes('【推荐追问】：') && (
                    <div className={styles.recommendWrapper}>
                      <div className={styles.recommendTitle}>你可以接着问：</div>
                      <div className={styles.recommendPills}>
                        {msg.text.split('【推荐追问】：')[1].split('|').map((q, idx) => {
                          const question = q.trim();
                          if (!question) return null;
                          return (
                            <div
                              key={idx}
                              className={styles.recommendPill}
                              onClick={() => handleSend(question)}
                            >
                              {question}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 如果命中高级业务Intent，提示去全屏的太空舱查看完整看板 */}
                  {msg.role === 'ai' && msg.intent && (
                    <div
                      className={styles.intentWidgetHint}
                      onClick={() => jumpToIntelligenceCenter(msg.text)}
                    >
                      <ExportOutlined /> 在智能驾驶舱展开查看完整图表
                    </div>
                  )}

                  {/* 针对生成的报表，展示下载按钮 */}
                  {msg.role === 'ai' && msg.reportType && (
                    <div style={{ marginTop: 12 }}>
                      <button
                        className={styles.reportDownloadBtn}
                        disabled={!!downloadingType}
                        onClick={() => handleDownloadReport(msg.reportType!)}
                        style={{ width: '100%', marginBottom: 0 }}
                      >
                        {downloadingType === msg.reportType ? <LoadingOutlined /> : <DownloadOutlined />}
                        <span>下载{msg.reportType === 'daily' ? '运营日报' : msg.reportType === 'weekly' ? '运营周报' : '运营月报'}</span>
                      </button>
                    </div>
                  )}
                  {/* 内嵌迷你图表 */}
                  {msg.role === 'ai' && !!msg.charts?.length && (
                    <div className={styles.chartsWrapper}>
                      {msg.charts.map((chart, i) => <MiniChartWidget key={i} chart={chart} />)}
                    </div>
                  )}
                  {msg.role === 'ai' && !!msg.cards?.length && (
                    <div className={styles.teamStatusWrapper}>
                      {msg.cards.map((card, i) => (
                        <XiaoyunInsightCard
                          key={`${card.title ?? 'insight'}-${i}`}
                          compact
                          card={card}
                          onNavigate={(path) => {
                            const knownPrefixes = ['/production', '/finance', '/warehouse', '/intelligence', '/system', '/dashboard', '/style', '/crm', '/procurement', '/basic'];
                            const safePath = path && knownPrefixes.some(prefix => path.startsWith(prefix)) ? path : '/production';
                            setIsOpen(false);
                            navigate(safePath);
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {/* 任务流操作卡片 */}
                  {msg.role === 'ai' && !!msg.actionCards?.length && (
                    <div className={styles.actionCardsWrapper}>
                      {msg.actionCards.map((card, i) => (
                        <ActionCardWidget
                          key={i}
                          card={card}
                          onUrgeOrderSaved={() => void handleSend(`订单 ${card.orderNo ?? card.orderId} 出货信息已更新`)}
                          onAction={(type, path, orderId) => {
                            if (type === 'navigate' && path) {
                              // 路径白名单校验，防止 AI 生成不存在的路由导致页面不存在错误
                              const knownPrefixes = ['/production', '/finance', '/warehouse', '/intelligence', '/system', '/dashboard', '/style', '/crm', '/procurement', '/basic'];
                              const safePath = knownPrefixes.some(p => path.startsWith(p)) ? path : '/production';
                              setIsOpen(false);
                              navigate(safePath);
                            }
                            else if (type === 'mark_urgent' && orderId) { void handleSend(`把订单 ${orderId} 标记为紧急`); }
                            else { void handleSend(`执行操作：${card.title}`); }
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {msg.role === 'ai' && !!msg.teamStatusCards?.length && (
                    <div className={styles.teamStatusWrapper}>
                      {msg.teamStatusCards.map((card, i) => (
                        <TeamStatusCardWidget
                          key={`${card.orderNo ?? 'team'}-${i}`}
                          card={card}
                          onNavigate={(path) => {
                            const knownPrefixes = ['/production', '/finance', '/warehouse', '/intelligence', '/system', '/dashboard', '/style', '/crm', '/procurement', '/basic'];
                            const safePath = path && knownPrefixes.some(prefix => path.startsWith(prefix)) ? path : '/production';
                            setIsOpen(false);
                            navigate(safePath);
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {msg.role === 'ai' && !!msg.bundleSplitCards?.length && (
                    <div className={styles.teamStatusWrapper}>
                      {msg.bundleSplitCards.map((card, i) => (
                        <BundleSplitCardWidget
                          key={`${card.sourceBundleId ?? card.rootBundleId ?? 'split'}-${i}`}
                          card={card}
                          onNavigateToCutting={(splitCard) => {
                            const orderNo = splitCard.orderNo;
                            const bundleIds = (splitCard.bundles || [])
                              .filter((item) => item.splitStatus === 'split_child' && item.bundleId)
                              .map((item) => item.bundleId);
                            const query = new URLSearchParams();
                            if (bundleIds.length) {
                              query.set('bundleIds', bundleIds.join(','));
                              query.set('autoPrint', '1');
                            }
                            const next = orderNo ? `/production/cutting/task/${encodeURIComponent(orderNo)}${query.toString() ? `?${query.toString()}` : ''}` : paths.cutting;
                            setIsOpen(false);
                            navigate(next);
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {msg.role === 'ai' && msg.purchaseDocCard && (
                    <div className={styles.teamStatusWrapper}>
                      <PurchaseDocCardWidget
                        card={msg.purchaseDocCard}
                        onAutoAction={async (mode, card) => {
                          try {
                            const result = await intelligenceApi.autoExecutePurchaseDoc({
                              docId: card.docId,
                              orderNo: card.orderNo,
                              warehouseLocation: mode === 'inbound' ? '默认仓' : undefined,
                              confirmInbound: mode === 'inbound',
                            });
                            setMessages(prev => prev.map(item => item.id === msg.id ? {
                              ...item,
                              text: mode === 'inbound' ? '我已经根据这张采购单据执行到货并入库。' : '我已经根据这张采购单据执行自动到货。',
                              purchaseDocCard: result as PurchaseDocCardData,
                            } : item));
                          } catch (error) {
                            message.error(error instanceof Error ? error.message : '采购单据自动执行失败');
                          }
                        }}
                      />
                    </div>
                  )}
                  {msg.role === 'ai' && msg.agentCommandId && (
                    <div className={styles.quickActionsRow}>
                      <button className={styles.actionBtn} onClick={() => void handleShowAgentTrace(msg.agentCommandId)}>
                        查看执行轨迹
                      </button>
                      <button className={styles.actionBtn} onClick={() => openTraceCenter(msg.agentCommandId)}>
                        打开独立页
                      </button>
                      <button className={styles.actionBtn} onClick={() => void handleShowRecentTraces()}>
                        最近执行记录
                      </button>
                    </div>
                  )}
                  {msg.role === 'ai' && msg.agentTraceCard && (
                    <div className={styles.teamStatusWrapper}>
                      <AiTraceCardWidget card={msg.agentTraceCard} />
                    </div>
                  )}
                  {/* ACTIONS_JSON 快捷操作按钮 */}
                  {msg.role === 'ai' && !!msg.quickActions?.length && (
                    <div className={styles.quickActionsRow}>
                      {msg.quickActions.map((action, i) => (
                        <button
                          key={i}
                          className={`${styles.actionBtn} ${action.style === 'danger' ? styles.actionBtnDanger : styles.actionBtnPrimary}`}
                          onClick={() => handleSend(action.label)}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* ── Traceable Advice 卡片渲染 ── */}
                  {msg.role === 'ai' && msg.traceableAdvice && (
                    <div style={{ marginTop: 12, padding: 12, background: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, border: '1px solid rgba(0, 229, 255, 0.2)' }}>
                      <div style={{ fontWeight: 'bold', color: '#00e5ff', marginBottom: 8, fontSize: 14 }}>
                        {msg.traceableAdvice.title}
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <details style={{ cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                          <summary style={{ outline: 'none', userSelect: 'none' }}>🔍 查看评估依据</summary>
                          <ul style={{ marginTop: 8, paddingLeft: 20, color: 'rgba(255,255,255,0.8)' }}>
                            {msg.traceableAdvice.reasoningChain?.map((reason, idx) => (
                              <li key={idx} style={{ marginBottom: 4 }}>{reason}</li>
                            ))}
                          </ul>
                        </details>
                      </div>

                      {msg.traceableAdvice.proposedActions && msg.traceableAdvice.proposedActions.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {msg.traceableAdvice.proposedActions.map((action, idx) => (
                            <Tooltip key={idx} title={action.riskWarning || '点击执行'}>
                              <button
                                className={styles.actionBtn}
                                style={{
                                  background: action.actionCommand === 'IGNORE' ? 'rgba(255,255,255,0.1)' : 'rgba(0, 229, 255, 0.1)',
                                  borderColor: action.actionCommand === 'IGNORE' ? 'transparent' : 'rgba(0, 229, 255, 0.3)',
                                  color: action.actionCommand === 'IGNORE' ? 'rgba(255,255,255,0.6)' : '#00e5ff'
                                }}
                                onClick={() => {
                                  if (action.actionCommand === 'IGNORE') {
                                    handleSend('我忽略了这条建议。');
                                  } else {
                                    handleSend(`执行操作：${action.label}`);
                                    // 这里可以扩展实际的 API 调用
                                  }
                                }}
                              >
                                {action.label}
                              </button>
                            </Tooltip>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── hyper-advisor 增强区域 ── */}
                  {msg.role === 'ai' && msg.needsClarification && <ClarificationCard />}
                  {msg.role === 'ai' && !!msg.riskIndicators?.length && <RiskIndicatorWidget items={msg.riskIndicators} />}
                  {msg.role === 'ai' && msg.simulation && <SimulationWidget data={msg.simulation} />}
                  {msg.role === 'ai' && msg.traceId && <FeedbackWidget msg={msg} onFeedback={handleAdvisorFeedback} />}
                </div>

                {/* 语音播报小按钮(仅AI部分) */}
                {msg.role === 'ai' && (
                  <button className={styles.speechBtn} onClick={() => speak(msg.text)} title="朗读回答">
                    <SoundOutlined />
                  </button>
                )}
              </div>
            ))}

            {/* Loading Indicator */}
            {isTyping && (
              <div className={`${styles.messageRow} ${styles.rowAi}`}>
                <div className={styles.messageAvatar}>
                  <XiaoyunCloudAvatar size={28} active loading />
                </div>
                <div className={`${styles.messageBubble} ${styles.bubbleAi}`}>
                  <div className={styles.typingText}>小云正在处理，请稍等一下…</div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className={styles.inputArea}>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              accept=".xlsx,.xls,.csv,.jpg,.jpeg,.png,.gif,.pdf"
              onChange={handleFileSelect}
            />
            {attachedFile && (
              <div className={styles.attachChip}>
                <span>📎 {attachedFile.name}</span>
                <button className={styles.attachChipRemove} onClick={() => setAttachedFile(null)}>×</button>
              </div>
            )}
            <div className={styles.inputRow}>
              <button
                className={styles.uploadBtn}
                title="上传文件（Excel/CSV/图片/PDF）"
                onClick={() => fileInputRef.current?.click()}
                disabled={isTyping || uploadingFile}
              >
                <PaperClipOutlined />
              </button>
              <button
                className={`${styles.uploadBtn} ${styles.traceBtn}`}
                title="查看AI记录"
                onClick={() => openTraceCenter()}
                disabled={isTyping || uploadingFile}
              >
                AI记录
              </button>
              <input
                ref={inputRef}
                type="text"
                className={styles.chatInput}
                placeholder="直接说需求，也可以上传采购单据让我自动识别、到货或入库"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isTyping || uploadingFile}
              />
              <button
                className={styles.voiceBtn}
                title="语音输入（点击后说话）"
                onClick={handleVoiceInput}
                disabled={isTyping || isRecording}
                style={{ color: isRecording ? '#f5222d' : undefined }}
              >
                {isRecording ? <LoadingOutlined spin /> : <SoundOutlined />}
                <span>语音</span>
              </button>
              <button
                className={styles.sendBtn}
                onClick={() => attachedFile ? void handleSendWithAttachment() : void handleSend()}
                disabled={(!inputValue.trim() && !attachedFile) || isTyping || uploadingFile}
              >
                {uploadingFile ? <LoadingOutlined /> : <SendOutlined />}
                <span>{uploadingFile ? '处理中' : '发送'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 悬浮图标开关 */}
      {!isOpen && (
        <div
          className={styles.triggerBtn}
          onClick={() => setIsOpen(true)}
          title="召唤小云智能助手"
        >
          <CuteCloudTrigger size={56} />
          {visiblePendingItems.length > 0 && (
            <span className={styles.triggerBadge}>{visiblePendingItems.length}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalAiAssistant;
