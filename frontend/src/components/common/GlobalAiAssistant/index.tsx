import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  SendOutlined,
  CloseOutlined,
  SoundOutlined,
  ExportOutlined,
  DownloadOutlined,
  LoadingOutlined,
  AudioMutedOutlined,
  ClearOutlined
} from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import api from '@/utils/api';
import styles from './index.module.css';

/** 轻量 Markdown → HTML（仅处理 AI 常用的格式） */
function renderSimpleMarkdown(text: string): string {
  // 先保护代码块
  const codeBlocks: string[] = [];
  let s = text.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(code.trim());
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });
  // 按行处理
  const lines = s.split('\n');
  const html: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw;
    // 标题
    if (/^###\s+(.+)/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<strong style="display:block;margin:8px 0 4px;font-size:14px">${RegExp.$1}</strong>`);
      continue;
    }
    if (/^##\s+(.+)/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<strong style="display:block;margin:10px 0 4px;font-size:15px">${RegExp.$1}</strong>`);
      continue;
    }
    if (/^#\s+(.+)/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<strong style="display:block;margin:12px 0 6px;font-size:16px">${RegExp.$1}</strong>`);
      continue;
    }
    // 无序列表
    if (/^[-*]\s+(.+)/.test(line)) {
      if (!inList) { html.push('<ul style="margin:4px 0;padding-left:20px">'); inList = true; }
      html.push(`<li>${inlineFmt(RegExp.$1)}</li>`);
      continue;
    }
    // 有序列表
    if (/^\d+\.\s+(.+)/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<div style="margin:2px 0">${inlineFmt(line)}</div>`);
      continue;
    }
    if (inList) { html.push('</ul>'); inList = false; }
    // 空行
    if (!line.trim()) { html.push('<br/>'); continue; }
    // 普通段落
    html.push(`<div style="margin:2px 0">${inlineFmt(line)}</div>`);
  }
  if (inList) html.push('</ul>');
  let result = html.join('');
  // 还原代码块
  result = result.replace(/__CODE_BLOCK_(\d+)__/g, (_, i) =>
    `<pre style="background:#f5f5f5;padding:8px;border-radius:6px;overflow-x:auto;font-size:12px;margin:6px 0"><code>${escHtml(codeBlocks[Number(i)])}</code></pre>`
  );
  return result;
}
function inlineFmt(s: string): string {
  return escHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>');
}
function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

interface Message {
  id: string;
  role: 'ai' | 'user';
  text: string;
  intent?: string;
  hasSpeech?: boolean;
  reportType?: 'daily' | 'weekly' | 'monthly';
}

const INITIAL_MSG: Message = {
  id: 'init-msg',
  role: 'ai',
  text: 'Hi 👋 欢迎使用云裳智链！我是您的专属管家「小云」☁️。\n您可以随时问我：',
};

const SUGGESTIONS = [
  '📄 智能日报', '📅 智能周报', '📊 智能月报',
  '🚨 逾期风险及解决方案', '📉 效率低谷与分析', '📦 面料库存缺口速查',
  '🔍 成本异常追踪分析', '🤖 智能派工推荐', '🏭 工厂综合表现'
];

type CloudMood = 'normal' | 'curious' | 'urgent' | 'error' | 'success';

// 超级可爱的表情云朵组件
const CuteCloudTrigger = ({ size = 52, active = false, mood = 'normal', loading = false, interacting = false }: { size?: number, active?: boolean, mood?: CloudMood, loading?: boolean, interacting?: boolean }) => {
  const isUrgent = mood === 'urgent';
  const isError = mood === 'error';
  const isSuccess = mood === 'success';
  const isCurious = mood === 'curious';

  let bodyAnim = styles.cloudBodyNormal;
  if (isUrgent) bodyAnim = styles.cloudBodyUrgent;
  if (isError) bodyAnim = styles.cloudBodyError;
  if (isSuccess) bodyAnim = styles.cloudBodySuccess;
  if (active || interacting) bodyAnim = styles.cloudBodyInteract;

  const stop1 = isUrgent ? "#fff0f0" : isError ? "#f2f5f8" : "#ffffff";
  const stop2 = isUrgent ? "#ffccc7" : isError ? "#d9e2ec" : "#dcf0ff";

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0px 6px 12px rgba(24,144,255,0.4))' }}>
      <defs>
        <linearGradient id={`cloudGrad-${mood}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={stop1} style={{ transition: 'stop-color 0.3s' }} />
          <stop offset="100%" stopColor={stop2} style={{ transition: 'stop-color 0.3s' }} />
        </linearGradient>

        <clipPath id="leftEyeClip">
           <rect x="36" y="38" width="20" height="24" className={styles.eyelidLeft} />
        </clipPath>
        <clipPath id="rightEyeClip">
           <rect x="60" y="38" width="20" height="24" className={styles.eyelidRight} />
        </clipPath>
      </defs>

      <g transform={active ? "translate(0, 0)" : "translate(0, 5)"}>
        <g className={bodyAnim}>
           {/* 软萌云朵基础层 */}
           <path d="M 30 65 A 15 15 0 0 1 30 35 A 18 18 0 0 1 60 25 A 22 22 0 0 1 85 50 A 15 15 0 0 1 85 75 L 30 75 A 15 15 0 0 1 30 65 Z" fill={`url(#cloudGrad-${mood})`} style={{ transition: 'fill 0.3s' }} />

           {isUrgent && (
             <path d="M 78 35 Q 78 40 76 42 Q 74 40 74 35 Q 74 30 76 28 Q 78 30 78 35 Z" fill="#69c0ff" opacity="0.8" className={styles.sweatAnim} />
           )}
           {isSuccess && (
             <g className={styles.starsAnim}>
                <path d="M 20 30 L 22 35 L 27 35 L 23 38 L 25 43 L 20 40 L 15 43 L 17 38 L 13 35 L 18 35 Z" fill="#ffdd00" />
                <path d="M 85 25 L 86 28 L 89 28 L 87 30 L 88 33 L 85 31 L 82 33 L 83 30 L 81 28 L 84 28 Z" fill="#ff7a45" />
             </g>
           )}

           {isUrgent && (
             <g stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round">
               <path d="M 40 45 L 48 48" />
               <path d="M 68 48 L 76 45" />
             </g>
           )}
           {isCurious && (
             <g stroke="#4B6685" strokeWidth="2" strokeLinecap="round">
               <path d="M 42 46 L 48 45" />
               <path d="M 68 45 L 74 46" />
             </g>
           )}

           {loading ? (
              <g stroke="#1890ff" strokeWidth="2.5" fill="none" strokeLinecap="round">
                <path d="M 46 50 A 4 4 0 1 1 45.9 50" className={styles.spinLeft} />
                <path d="M 70 50 A 4 4 0 1 1 69.9 50" className={styles.spinRight} />
              </g>
           ) : isError ? (
              <g>
                <path d="M 42 50 Q 46 45 50 50" fill="none" stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M 66 50 Q 70 45 74 50" fill="none" stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round" />
                <ellipse cx="46" cy="56" rx="2" ry="3" fill="#69c0ff" className={styles.tearTear} />
                <ellipse cx="70" cy="56" rx="2" ry="3" fill="#69c0ff" className={styles.tearTear} style={{ animationDelay: '0.5s' }} />
              </g>
           ) : isSuccess ? (
              <g fill="#ffbb96">
                 <path d="M 46 46 L 48 49 L 51 49 L 49 51 L 50 54 L 46 52 L 42 54 L 43 51 L 41 49 L 44 49 Z" />
                 <path d="M 70 46 L 72 49 L 75 49 L 73 51 L 74 54 L 70 52 L 66 54 L 67 51 L 65 49 L 68 49 Z" />
              </g>
           ) : (
              <g className={(interacting || active) ? styles.eyeFollowMouse : ''}>
                <g clipPath="url(#leftEyeClip)">
                  <circle cx={isCurious ? "48" : "46"} cy="50" r={isUrgent ? "5" : "6"} fill="#4B6685" style={{ transition: 'all 0.3s' }} />
                  <circle cx={isCurious ? "47" : "44"} cy="48" r={isUrgent ? "1.5" : "2"} fill="#ffffff" style={{ transition: 'all 0.3s' }} />
                  <circle cx={isCurious ? "49" : "47"} cy="52" r="1" fill="#ffffff" opacity="0.8" />
                </g>
                <g clipPath="url(#rightEyeClip)">
                  <circle cx={isCurious ? "68" : "70"} cy="50" r={isUrgent ? "5" : "6"} fill="#4B6685" style={{ transition: 'all 0.3s' }} />
                  <circle cx={isCurious ? "67" : "68"} cy="48" r={isUrgent ? "1.5" : "2"} fill="#ffffff" style={{ transition: 'all 0.3s' }} />
                  <circle cx={isCurious ? "69" : "71"} cy="52" r="1" fill="#ffffff" opacity="0.8" />
                </g>
              </g>
           )}

           {(!isError && !loading) && (
              <g opacity={isCurious ? "0.4" : "0.9"}>
                <ellipse cx="38" cy="58" rx="6" ry="3.5" fill={isUrgent ? "#ff4d4f" : "#FFA5BB"} className={styles.blushAnim} style={{ transition: 'fill 0.3s' }} />
                <ellipse cx="78" cy="58" rx="6" ry="3.5" fill={isUrgent ? "#ff4d4f" : "#FFA5BB"} className={styles.blushAnim} style={{ transition: 'fill 0.3s' }} />
              </g>
           )}

           <g>
             {loading ? (
               <line x1="56" y1="56" x2="60" y2="56" stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round" />
             ) : isUrgent ? (
               <ellipse cx="58" cy="57" rx="2.5" ry="3.5" fill="none" stroke="#4B6685" strokeWidth="2" />
             ) : isError ? (
               <path d="M 55 58 Q 58 55 61 58" fill="none" stroke="#4B6685" strokeWidth="2.5" strokeLinecap="round" />
             ) : isSuccess ? (
               <path d="M 54 54 Q 58 62 62 54" fill="#FF8CA3" stroke="#FF8CA3" strokeWidth="1" strokeLinecap="round" />
             ) : (
               <path d="M 54 55 Q 58 60 62 55" fill="none" stroke="#FF8CA3" strokeWidth="2.5" strokeLinecap="round" style={{ transition: 'all 0.3s' }} />
             )}
           </g>
        </g>
      </g>
    </svg>
  );
};

const GlobalAiAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [_mood, setMood] = useState<CloudMood>('normal');
  const [messages, setMessages] = useState<Message[]>([INITIAL_MSG]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasFetchedMood, setHasFetchedMood] = useState(false);
  const [pendingItems, setPendingItems] = useState<Array<{orderNo: string; styleNo: string; factoryName: string; progress: number; daysLeft: number}>>([]);
  const [downloadingType, setDownloadingType] = useState<string | null>(null);

  useEffect(() => {
    if (hasFetchedMood) return;
    const fetchStatus = async () => {
      try {
        setHasFetchedMood(true);
        const res = await api.get('/dashboard/daily-brief');
        // @ts-ignore
        const actualData = res?.code === 200 ? res.data : (res?.data || res);
        if (actualData) {
          const { overdueOrderCount = 0, highRiskOrderCount = 0, todayScanCount = 0, pendingItems: apiPendingItems = [], topPriorityOrder } = actualData;
          let newMood: CloudMood = 'normal';
          let greeting = INITIAL_MSG.text;

          // 存储待办详情供 UI 展示
          if (apiPendingItems && apiPendingItems.length > 0) {
            setPendingItems(apiPendingItems);
          } else if (topPriorityOrder) {
            setPendingItems([topPriorityOrder]);
          }

          if (overdueOrderCount >= 5 || highRiskOrderCount >= 3) {
            newMood = 'urgent';
            const topHint = topPriorityOrder ? `最紧急：${topPriorityOrder.orderNo}（${topPriorityOrder.daysLeft < 0 ? '已逾期' + Math.abs(topPriorityOrder.daysLeft) + '天' : '剩' + topPriorityOrder.daysLeft + '天'}，进度${topPriorityOrder.progress}%）` : '';
            greeting = `Hi 👋 紧急告警！发现 ${overdueOrderCount + highRiskOrderCount} 个待办异常！${topHint}\n小云有点着急，建议优先处理哦！`;
          } else if (overdueOrderCount > 0 || highRiskOrderCount > 0) {
            newMood = 'curious';
            const topHint = topPriorityOrder ? `\n📌 ${topPriorityOrder.orderNo}（${topPriorityOrder.styleNo || ''}）${topPriorityOrder.daysLeft < 0 ? '已逾期' + Math.abs(topPriorityOrder.daysLeft) + '天' : '还剩' + topPriorityOrder.daysLeft + '天'}，进度${topPriorityOrder.progress}%` : '';
            greeting = `Hi 👋 小云提醒您，有 ${overdueOrderCount + highRiskOrderCount} 个待办需要关注：${topHint}`;
          } else if (todayScanCount > 100) {
            newMood = 'success';
            greeting = `Hi 👋 太棒啦！今天货期大盘非常健康，大家干劲满满呢！小云给您比心🤩 需要看点什么数据吗：`;
          } else {
            newMood = 'normal';
            greeting = `Hi 👋 欢迎使用云裳智链！今天货期状态平稳，一切顺利哦！\n您可以随时问我：`;
            // 时间彩蛋
            const hour = new Date().getHours();
            if (hour >= 0 && hour < 6) {
               greeting = `夜深了，系统仍在运转，小云陪您一起加班 🌙... 辛苦啦，需要帮您查什么吗？`;
            } else if (hour >= 12 && hour <= 14) {
               greeting = `中午好 ☀️ 吃过午饭了吗？小云刚刚伸了个懒腰，随时准备为您服务！`;
            } else if (hour >= 19) {
               greeting = `晚上好！今天的工作马上要收尾了，小云为您站好最后一班岗 🚀`;
            }
          }
          setMood(newMood);
          setMessages([{ ...INITIAL_MSG, text: greeting }]);
        }
      } catch (err) {
        console.error('Failed to fetch system mood', err);
        setMood('normal');
        setMessages([{ ...INITIAL_MSG, text: `Hi 👋 小云为您服务！网络好像开了个小差，但我依然在哦！\n您可以随时问我：` }]);
      }
    };
    fetchStatus();
  }, [hasFetchedMood]);

  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

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

  const handleSend = async (manualText?: string) => {
    const text = (manualText || inputValue).trim();
    if (!text || isTyping) return;

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

      const ctrl = intelligenceApi.aiAdvisorChatStream(
        text,
        (event) => {
          streamStarted = true;
          if (event.type === 'thinking') {
            toolStatus = `🧠 思考中（第${event.data.iteration || 1}轮）...`;
            setMessages(prev => {
              const existing = prev.find(m => m.id === aiMsgId);
              if (existing) {
                return prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m);
              }
              return [...prev, { id: aiMsgId, role: 'ai' as const, text: toolStatus }];
            });
          } else if (event.type === 'tool_call') {
            toolStatus = `🔍 正在调用 ${event.data.tool || '工具'}...`;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m));
          } else if (event.type === 'tool_result') {
            const ok = event.data.success ? '✅' : '❌';
            toolStatus = `${ok} ${event.data.tool || '工具'}调用完成`;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: toolStatus } : m));
          } else if (event.type === 'answer') {
            accumulatedText = String(event.data.content || '');
            setMessages(prev => prev.map(m => m.id === aiMsgId
              ? { ...m, text: accumulatedText, reportType: reportTypeToDownload }
              : m));
          } else if (event.type === 'error') {
            accumulatedText = String(event.data.message || '小云遇到了一点问题 🌧️');
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: accumulatedText } : m));
          }
        },
        () => {
          // done
          setIsTyping(false);
          if (accumulatedText) speak(accumulatedText);
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
            // @ts-ignore
            const res = await intelligenceApi.aiAdvisorChat(text);
            // @ts-ignore
            const resultData: any = res?.code === 200 ? res.data : (res?.data || res);
            const answer = resultData?.answer || '抱歉呀😜，小云还在思考中…';
            setMessages(prev => {
              const existing = prev.find(m => m.id === aiMsgId);
              if (existing) {
                return prev.map(m => m.id === aiMsgId ? { ...m, text: answer, intent: resultData?.source, reportType: reportTypeToDownload } : m);
              }
              return [...prev, { id: aiMsgId, role: 'ai' as const, text: answer, intent: resultData?.source, reportType: reportTypeToDownload }];
            });
            speak(answer);
          } catch (syncErr) {
            console.error('Sync fallback also failed:', syncErr);
            setMessages(prev => [...prev, { id: aiMsgId, role: 'ai' as const, text: '网络似乎有点小波动，小云暂时连不到数据中心了 🌧️ 请稍后再试！' }]);
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
        text: '网络似乎有点小波动，小云暂时连不到数据中心了 🌧️ 请稍后再试！'
      }]);
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  // 语音播报方法
  const speak = (text: string) => {
    if (isMuted) return;
    if ('speechSynthesis' in window) {
      // 停止当前播报
      window.speechSynthesis.cancel();
      // 提取纯文本（过滤掉表情和特殊符号以便播报）
      const cleanText = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/gu, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'zh-CN';

      // 寻找好听的中文女声
      const voices = window.speechSynthesis.getVoices();

      const preferredVoices = [
        'xiaoxiao', 'ting', 'yaoyao', 'mei-jia', 'lili', 'shanshan', 'female'
      ];

      let selectedVoice = undefined;
      for (const vName of preferredVoices) {
        selectedVoice = voices.find(v => v.lang.includes('zh') && v.name.toLowerCase().includes(vName));
        if (selectedVoice) break;
      }

      // 兜底找一个中文声音
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.includes('zh'));
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      // 调整为呆萌可爱的声音（调高音调更精神/可爱）
      utterance.rate = 1.05;    // 语速微微加快
      utterance.pitch = 1.25;   // 音调稍高更可爱
      utterance.volume = 0.9;

      window.speechSynthesis.speak(utterance);
    }
  };

  const jumpToIntelligenceCenter = (_query: string) => {
    setIsOpen(false);
    // 如果已经在智能驾驶舱，不跨路由跳转仅提示
    if (location.pathname !== '/intelligence/center') {
      navigate('/intelligence/center');
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
              <div className={styles.headerSubtitle}>云裳智链 · 实时数据支持</div>
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
                  setMessages([INITIAL_MSG]);
                  setPendingItems([]);
                  setInputValue('');
                  setHasFetchedMood(false);
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
            {/* Suggestion Chips - 像原来的智能顾问一样 */}
            {messages.length === 1 && pendingItems.length > 0 && (
              <div className={styles.pendingItems}>
                {pendingItems.map((item: any) => {
                  const dl = item.daysLeft;
                  const status = dl < 0 ? `已逾期${Math.abs(dl)}天` : dl === 0 ? '今天到期' : `剩${dl}天`;
                  return (
                    <div key={item.orderNo} className={styles.pendingItem}
                      onClick={() => handleSend(`帮我分析订单 ${item.orderNo} 的详细情况和风险`)}
                    >
                      <span>⚠️</span>
                      <span style={{flex:1}}>{item.orderNo}{item.styleNo ? `（${item.styleNo}）` : ''} — {status}，进度{item.progress}%</span>
                      <span style={{color:'#1890ff',fontSize:11}}>查看 →</span>
                    </div>
                  );
                })}
              </div>
            )}
            {messages.length === 1 && (
              <div className={styles.suggestionChips}>
                {SUGGESTIONS.map(q => (
                  <div key={q} className={styles.chip} onClick={() => handleSend(q)}>
                    {q}
                  </div>
                ))}
              </div>
            )}

            {messages.map(msg => (
              <div
                key={msg.id}
                className={`${styles.messageRow} ${msg.role === 'ai' ? styles.rowAi : styles.rowUser}`}
              >
                {msg.role === 'ai' && (
                  <div className={styles.messageAvatar}>
                    <CuteCloudTrigger size={24} active />
                  </div>
                )}

                <div className={`${styles.messageBubble} ${msg.role === 'ai' ? styles.bubbleAi : styles.bubbleUser}`}>
                  {msg.role === 'ai' ? (
                    <div
                      className={styles.mdContent}
                      dangerouslySetInnerHTML={{
                        __html: renderSimpleMarkdown(
                          msg.text.includes('【推荐追问】：')
                            ? msg.text.split('【推荐追问】：')[0]
                            : msg.text
                        )
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
                  <CuteCloudTrigger size={24} active />
                </div>
                <div className={`${styles.messageBubble} ${styles.bubbleAi}`}>
                  <div className={styles.typingIndicator}>
                    <div className={styles.typingDot} />
                    <div className={styles.typingDot} />
                    <div className={styles.typingDot} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className={styles.inputArea}>
            <input
              ref={inputRef}
              type="text"
              className={styles.chatInput}
              placeholder="想问什么？回车发送..."
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isTyping}
            />
            <button
              className={styles.sendBtn}
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || isTyping}
            >
              <SendOutlined />
            </button>
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
        </div>
      )}
    </div>
  );
};

export default GlobalAiAssistant;
