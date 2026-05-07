import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { useGlobalStore } from '@/stores/globalStore';
import { isManagerLevel } from '@/utils/permission';
import { toast } from '@/utils/uiHelper';
import useVoiceInput from '@/hooks/useVoiceInput';
import useAiChatStream from '@/hooks/useAiChatStream';
import useCameraCapture from '@/hooks/useCameraCapture';
import Icon from '@/components/Icon';
import { parseAiResponse } from '@/utils/chatParser';
import StepWizardCard from '@/components/StepWizardCard';

const QUICK_PROMPTS_WORKER = [
  { label: '我的任务', text: '我今天负责的生产任务是什么？' },
  { label: '扫码记录', text: '帮我查一下我最近的扫码记录' },
  { label: '订单进度', text: '我负责的订单当前进度怎么样？' },
];
const QUICK_PROMPTS_ADMIN = [
  { label: '📋 下单', text: '帮我下单' },
  { label: '👕 借调样衣', text: '帮我借调样衣' },
  { label: '生成日报', text: '帮我汇总今日日报' },
  { label: '风险订单', text: '当前有哪些逾期或高风险订单？' },
  { label: '今日扫码', text: '今天工厂扫码情况如何？' },
  { label: '样衣进度', text: '当前样衣开发进度如何？' },
  { label: '利润估算', text: '帮我估算本月利润' },
  { label: '面料缺口', text: '当前有哪些面料缺口？' },
];

const TOOL_NAME_MAP = {
  production_progress: '生产进度', order_edit: '订单编辑', inventory_query: '库存查询',
  deep_analysis: '深度分析', ai_create_order: 'AI建单', sample_loan: '样衣借调',
  urge_order: '催单', scan_undo: '扫码撤回', batch_close: '批量关单',
  wage_approve: '工资审批', quality_check: '质检审核', factory_bottleneck: '工厂瓶颈',
  material_shortage: '面料缺口', overdue_analysis: '逾期分析', profit_estimation: '利润估算',
  factory_leaderboard: '工厂排行', finance_audit: '财务审计', defect_heatmap: '次品热力图',
  smart_notification: '智能通知', self_healing: '自愈修复', ai_patrol: 'AI巡检',
  forecast: '预测分析', health_index: '健康指数', action_center: '行动中心',
  sample_workflow: '样衣工作流', sample_loan_query: '样衣借还', sample_stock: '样衣库存',
  sample_delay: '样衣延期',
};

const MOOD_CONFIG = {
  urgent: { emoji: '🔴', label: '紧急', color: '#ff4d4f' },
  curious: { emoji: '🟡', label: '关注', color: '#fa8c16' },
  success: { emoji: '🟢', label: '顺利', color: '#52c41a' },
  normal: { emoji: '🔵', label: '正常', color: '#1677ff' },
};

function MiniCloud({ size = 50, mood = 'normal' }) {
  const s = size / 50;
  const moodColor = MOOD_CONFIG[mood]?.color || MOOD_CONFIG.normal.color;
  return (
    <div style={{ position: 'relative', width: 50 * s, height: 50 * s, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        position: 'absolute', inset: 4 * s, borderRadius: 500,
        background: `radial-gradient(circle, ${moodColor}33, ${moodColor}08 66%, transparent 78%)`,
        animation: 'glowPulse 5.2s ease-in-out infinite',
      }} />
      <div style={{ position: 'relative', width: 40 * s, height: 29 * s, animation: 'floatSoft 4.8s ease-in-out infinite' }}>
        <div style={{ position: 'absolute', width: 13 * s, height: 13 * s, left: 4 * s, top: 10 * s, borderRadius: '50%', background: 'var(--color-bg-light)', boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), 0 3px 7px ${moodColor}22` }} />
        <div style={{ position: 'absolute', width: 17 * s, height: 17 * s, left: 11 * s, top: 3 * s, borderRadius: '50%', background: 'var(--color-bg-light)', boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), 0 3px 7px ${moodColor}22` }} />
        <div style={{ position: 'absolute', width: 12 * s, height: 12 * s, right: 4 * s, top: 11 * s, borderRadius: '50%', background: 'var(--color-bg-light)', boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), 0 3px 7px ${moodColor}22` }} />
        <div style={{ position: 'absolute', left: 5 * s, right: 5 * s, bottom: 3 * s, height: 12 * s, borderRadius: 500, background: 'var(--color-bg-light)', boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), 0 3px 7px ${moodColor}22` }} />
        <div style={{ position: 'absolute', top: 14 * s, left: 12 * s, width: 5 * s, height: 7 * s, borderRadius: 500, background: moodColor, animation: 'cloudBlink 6.6s ease-in-out infinite', overflow: 'hidden' }}>
          <div style={{ width: 2 * s, height: 2 * s, margin: '1px 0 0 1px', borderRadius: '50%', background: 'rgba(255,255,255,0.96)', animation: 'eyeHighlightTwinkle 4.2s ease-in-out infinite' }} />
        </div>
        <div style={{ position: 'absolute', top: 14 * s, right: 12 * s, width: 5 * s, height: 7 * s, borderRadius: 500, background: moodColor, animation: 'cloudBlink 6.6s ease-in-out infinite', overflow: 'hidden' }}>
          <div style={{ width: 2 * s, height: 2 * s, margin: '1px 0 0 1px', borderRadius: '50%', background: 'rgba(255,255,255,0.96)', animation: 'eyeHighlightTwinkle 4.2s ease-in-out infinite' }} />
        </div>
        <div style={{ position: 'absolute', left: '50%', bottom: 5 * s, width: 12 * s, height: 6 * s, marginLeft: -6 * s, borderBottom: `2px solid ${moodColor}`, borderRadius: '0 0 12px 12px', animation: 'cloudSmileTalk 3.8s ease-in-out infinite' }} />
      </div>
    </div>
  );
}

export { MiniCloud };

const CHAT_STORAGE_KEY = 'h5_ai_chat_messages';
const SESSION_ID_KEY = 'h5_ai_session_id';
const MAX_STORED_MESSAGES = 30;

function loadStoredMessages() {
  try {
    const stored = sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (_) {}
  return [];
}

function storeMessages(messages) {
  try {
    const toStore = messages.slice(-MAX_STORED_MESSAGES);
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toStore));
  } catch (_) {}
}

function generateSessionId() {
  return 'h5_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function useTts() {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const playingIdRef = useRef(null);

  const speak = useCallback(async (text, msgId) => {
    if (!text || text.length < 2) return;
    if (playingIdRef.current === msgId) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      playingIdRef.current = null;
      setPlaying(false);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    try {
      const blob = await api.intelligence.ttsSpeak({ text: text.slice(0, 500) });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      playingIdRef.current = msgId;
      setPlaying(true);
      audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; playingIdRef.current = null; setPlaying(false); };
      audio.onerror = () => { URL.revokeObjectURL(url); audioRef.current = null; playingIdRef.current = null; setPlaying(false); };
      audio.play().catch(() => { setPlaying(false); });
    } catch (_) {
      setPlaying(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    playingIdRef.current = null;
    setPlaying(false);
  }, []);

  return { speak, stop, playing, playingId: playingIdRef.current };
}

function usePendingTasks() {
  const [tasks, setTasks] = useState(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.intelligence.getMyPendingTaskSummary();
      const data = res?.data || res || {};
      setTasks(data);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
    intervalRef.current = setInterval(fetchTasks, 60000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchTasks]);

  return { tasks, loading, refresh: fetchTasks };
}

function useMood() {
  const [mood, setMood] = useState('normal');
  const [greeting, setGreeting] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await api.intelligence.getMyPendingTaskSummary();
      const data = res?.data || res || {};
      const overdue = data.overdueOrders || 0;
      const highRisk = data.highRiskOrders || 0;
      if (overdue >= 5 || highRisk >= 3) setMood('urgent');
      else if (overdue > 0 || highRisk > 0) setMood('curious');
      else setMood('normal');
    } catch (_) {
      setMood('normal');
    }
    setGreeting(getGreeting());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { mood, greeting, refresh };
}

export default function AiAssistantFloat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => loadStoredMessages());
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [pendingImage, setPendingImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [currentTool, setCurrentTool] = useState(null);
  const [toolResults, setToolResults] = useState([]);
  const [isMgr, setIsMgr] = useState(false);
  const [advisorSessionId] = useState(() => sessionStorage.getItem(SESSION_ID_KEY) || (() => { const id = generateSessionId(); sessionStorage.setItem(SESSION_ID_KEY, id); return id; })());
  const scrollRef = useRef(null);
  const sendingRef = useRef(false);
  const user = useAuthStore((s) => s.user);
  const scanResultData = useGlobalStore(s => s.scanResultData);
  const aiStream = useAiChatStream();
  const tts = useTts();
  const { tasks, refresh: refreshTasks } = usePendingTasks();
  const { mood, greeting, refresh: refreshMood } = useMood();

  useEffect(() => { storeMessages(messages); }, [messages]);

  useEffect(() => { setIsMgr(isManagerLevel()); }, []);

  const currentPageContext = (() => {
    const path = window.location.pathname;
    if (path.includes('/scan')) return 'scan_page';
    if (path.includes('/work')) return 'work_page';
    if (path.includes('/warehouse')) return 'warehouse_page';
    if (path.includes('/dashboard')) return 'dashboard_page';
    if (path.includes('/admin')) return 'admin_page';
    if (path.includes('/cutting')) return 'cutting_page';
    if (path.includes('/procurement')) return 'procurement_page';
    if (path.includes('/style')) return 'style_page';
    if (path.includes('/sample')) return 'sample_page';
    if (path.includes('/intelligence')) return 'intelligence_page';
    return 'home_page';
  })();

  const [pos, setPos] = useState({ x: -1, y: -1 });
  const dragging = useRef(false);
  const startTouch = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  const voice = useVoiceInput({
    lang: 'zh-CN',
    continuous: false,
    onResult: (transcript) => setInputText(prev => prev + transcript),
  });

  const camera = useCameraCapture({ maxCount: 1, autoUpload: false });

  useEffect(() => {
    if (voice.error === 'NOT_SUPPORTED') toast.info('当前浏览器不支持语音识别，请使用Chrome浏览器');
    else if (voice.error === 'PERMISSION_DENIED') toast.error('请允许麦克风权限');
    else if (voice.error && voice.error !== 'NO_SPEECH' && voice.error !== 'aborted') toast.error('语音识别出错：' + voice.error);
  }, [voice.error]);

  useEffect(() => {
    if (pos.x === -1) {
      setPos({ x: window.innerWidth - 66, y: window.innerHeight * 0.55 });
    }
  }, []);

  useEffect(() => { return () => { aiStream.abort(); tts.stop(); }; }, []);

  useEffect(() => {
    if (open && !messages.length) {
      const name = user?.name || user?.realName || user?.username || '用户';
      const moodLabel = MOOD_CONFIG[mood]?.label || '';
      const moodEmoji = MOOD_CONFIG[mood]?.emoji || '';
      let greet = `${moodEmoji} ${greeting}，${name}！这里是小云帮助中心。`;
      if (mood === 'urgent') greet += '\n\n⚠️ 当前有紧急待办，建议优先处理！';
      greet += '\n\n你可以：\n· 打字提问\n· 📷 拍照识别\n· 🎤 语音输入\n· 🔊 点击喇叭朗读回复';
      setMessages([{ role: 'ai', text: greet, id: 'init' }]);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamingText, currentTool, toolResults]);

  const handleTouchStart = (e) => {
    e.stopPropagation();
    dragging.current = true;
    moved.current = false;
    const t = e.touches ? e.touches[0] : e;
    startTouch.current = { x: t.clientX, y: t.clientY };
    startPos.current = { ...pos };
  };

  const handleTouchMove = (e) => {
    if (!dragging.current) return;
    e.preventDefault();
    e.stopPropagation();
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - startTouch.current.x;
    const dy = t.clientY - startTouch.current.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved.current = true;
    const maxX = window.innerWidth - 56;
    const maxY = window.innerHeight - 56;
    setPos({
      x: Math.max(0, Math.min(maxX, startPos.current.x + dx)),
      y: Math.max(0, Math.min(maxY, startPos.current.y + dy)),
    });
  };

  const handleTouchEnd = (e) => {
    e.stopPropagation();
    dragging.current = false;
    const edgeX = pos.x > window.innerWidth / 2 ? window.innerWidth - 66 : 8;
    setPos((prev) => ({ ...prev, x: edgeX }));
    if (!moved.current) setOpen(true);
  };

  const handleClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!moved.current) setOpen(true);
  };

  const handleTakePhoto = async () => {
    try {
      const urls = await camera.captureFromCamera();
      if (urls && urls.length > 0) {
        setPendingImage({ url: urls[0], file: null });
      }
    } catch (e) {
      if (e?.message !== 'cancel') toast.error('拍照失败，请重试');
    }
  };

  const removePendingImage = () => {
    if (pendingImage?.url?.startsWith('blob:')) URL.revokeObjectURL(pendingImage.url);
    setPendingImage(null);
  };

  const uploadPendingImage = async () => {
    if (!pendingImage) return null;
    if (pendingImage.file) {
      setUploading(true);
      try { return await api.common.uploadImage(pendingImage.file); }
      catch (e) { toast.error('图片上传失败'); return null; }
      finally { setUploading(false); }
    }
    return pendingImage.url;
  };

  const handleSend = useCallback(async (text) => {
    const msg = (text || inputText).trim();
    if ((!msg && !pendingImage) || sendingRef.current) return;
    sendingRef.current = true;
    setInputText('');
    voice.stop();
    setSending(true);
    setStreamingText('');
    setCurrentTool(null);
    setToolResults([]);

    let imageUrl = null;
    if (pendingImage) {
      imageUrl = await uploadPendingImage();
      if (pendingImage && !imageUrl) { setSending(false); sendingRef.current = false; return; }
    }

    const displayText = imageUrl ? (msg || '请看这张图片') : msg;
    const userMsgId = 'u_' + Date.now();
    setMessages((prev) => [...prev, { role: 'user', text: displayText, image: imageUrl || (pendingImage?.url || null), id: userMsgId }]);

    const chatContext = isMgr ? 'manager_assistant' : 'worker_assistant';
    let fullText = '';
    let aiMsgAdded = false;
    const aiMsgId = 'ai_' + Date.now();

    try {
      const streamParams = {
        question: msg,
        pageContext: `${chatContext}:${currentPageContext}`,
        conversationId: advisorSessionId,
        imageUrl,
      };
      if (scanResultData) {
        if (scanResultData.orderNo) streamParams.orderNo = scanResultData.orderNo;
        if (scanResultData.processName) streamParams.processName = scanResultData.processName;
        if (scanResultData.progressStage) streamParams.stage = scanResultData.progressStage;
      }

      await aiStream.startStream(
        streamParams,
        {
          onEvent: (event) => {
            if (event.type === 'text') {
              fullText = event.text;
              setStreamingText(fullText);
            } else if (event.type === 'thinking') {
              setCurrentTool({ type: 'thinking' });
            } else if (event.type === 'tool_call') {
              const toolName = TOOL_NAME_MAP[event.name] || event.name || '处理中';
              setCurrentTool({ type: 'tool_call', name: toolName });
            } else if (event.type === 'tool_result') {
              setToolResults(prev => [...prev, { name: currentTool?.name || '工具', success: event.success !== false }]);
              setCurrentTool(null);
            }
          },
          onComplete: (finalText) => {
            if (aiMsgAdded) return;
            aiMsgAdded = true;
            setStreamingText('');
            setCurrentTool(null);
            const responseText = finalText || fullText || '（无回复）';
            setMessages((prev) => {
              const existing = prev.find(m => m.id === aiMsgId);
              if (existing) return prev.map(m => m.id === aiMsgId ? { ...m, text: responseText } : m);
              return [...prev, { role: 'ai', text: responseText, id: aiMsgId }];
            });
            setSending(false);
            sendingRef.current = false;
            setPendingImage(null);
            refreshMood();
          },
          onError: () => {
            if (aiMsgAdded) return;
            aiMsgAdded = true;
            setStreamingText('');
            setCurrentTool(null);
            setMessages((prev) => [...prev, { role: 'ai', text: '抱歉，小云暂时无法回复，请稍后再试。', id: aiMsgId }]);
            setSending(false);
            sendingRef.current = false;
            setPendingImage(null);
          },
          onFallback: async (q) => {
            if (isMgr) {
              try {
                const res = await api.intelligence.naturalLanguageExecute({ text: q });
                const r = res?.data || res;
                return r?.result || r?.message || r?.reply || '操作完成';
              } catch (_) {
                const res = await api.intelligence.aiAdvisorChat({ question: q, context: 'manager_assistant' });
                return res?.reply || res?.content || res?.message || '（无回应）';
              }
            } else {
              const res = await api.intelligence.aiAdvisorChat({ question: q, context: 'worker_assistant' });
              return res?.reply || res?.content || res?.message || '（无回应）';
            }
          },
        }
      );
    } catch (e) {
      if (!aiMsgAdded) {
        aiMsgAdded = true;
        setStreamingText('');
        setCurrentTool(null);
        setMessages((prev) => [...prev, { role: 'ai', text: '抱歉，小云暂时无法回复，请稍后再试。', id: aiMsgId }]);
      }
      setSending(false);
      sendingRef.current = false;
      setPendingImage(null);
    }
  }, [inputText, sending, pendingImage, isMgr, advisorSessionId, currentTool]);

  const handleFeedback = useCallback(async (msgId, helpful) => {
    try {
      await api.intelligence.feedback({ messageId: msgId, helpful, timestamp: Date.now() });
      toast.success('感谢反馈！');
    } catch (_) {}
  }, []);

  const prompts = isMgr ? QUICK_PROMPTS_ADMIN : QUICK_PROMPTS_WORKER;
  const pendingCount = tasks ? (tasks.overdueOrders || 0) + (tasks.highRiskOrders || 0) + (tasks.pendingQuality || 0) : 0;

  if (pos.x === -1) return null;

  const floatBtn = !open ? (
    <div
      className="ai-float-btn"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
      style={{
        position: 'fixed', left: pos.x, top: pos.y,
        width: 56, height: 56, borderRadius: '50%',
        background: 'var(--color-bg-card)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999,
        boxShadow: `0 4px 20px ${MOOD_CONFIG[mood]?.color || '#3b82f6'}44`,
        cursor: 'pointer', touchAction: 'none',
        border: `2px solid ${MOOD_CONFIG[mood]?.color || 'rgba(59,130,246,0.15)'}`,
        transition: 'left 0.3s ease',
      }}
    >
      <MiniCloud size={50} mood={mood} />
      {pendingCount > 0 && (
        <span style={{
          position: 'absolute', top: -2, right: -2,
          background: 'var(--color-danger)', color: '#fff',
          fontSize: 10, fontWeight: 700, minWidth: 16, height: 16,
          borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 4px', border: '2px solid var(--color-bg-card)',
        }}>{pendingCount > 9 ? '9+' : pendingCount}</span>
      )}
    </div>
  ) : (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-page)', zIndex: 99999, display: 'flex', flexDirection: 'column' }}>
      <div className="chat-header">
        <button onClick={() => { setOpen(false); voice.stop(); tts.stop(); }} className="chat-close-btn">✕</button>
        <MiniCloud size={28} mood={mood} />
        <span className="chat-header-title">小云帮助中心</span>
        <span style={{ fontSize: 11, color: MOOD_CONFIG[mood]?.color, marginLeft: 4 }}>{MOOD_CONFIG[mood]?.emoji}</span>
      </div>

      {pendingCount > 0 && (
        <div className="ai-pending-banner" onClick={() => handleSend('当前有哪些紧急待办？')}>
          <span style={{ marginRight: 6 }}>🔔</span>
          <span>你有 {pendingCount} 项待办需要处理</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-primary)' }}>查看 →</span>
        </div>
      )}

      <div ref={scrollRef} className="chat-msg-scroll">
        {messages.map((msg, i) => {
          const parsed = msg.role === 'ai' && msg.text ? parseAiResponse(msg.text) : null;
          return (
            <div key={msg.id || i} className={`chat-msg-row ${msg.role === 'user' ? 'user' : ''}`}>
              <div className={`chat-bubble ${msg.role === 'user' ? 'user' : 'ai'}`}>
                {msg.image && <img src={msg.image} alt="" className="chat-bubble-img" />}
                {parsed ? (
                  <>
                    <div className="ai-text-content" style={{ whiteSpace: 'pre-wrap' }}>{parsed.displayText}</div>
                    {parsed.actionCards.length > 0 && (
                      <div className="ai-action-cards">
                        {parsed.actionCards.map((card, ci) => (
                          <div key={ci} className="ai-action-card">
                            <div className="ai-action-card-title">⚡ {card.title}</div>
                            <div className="ai-action-card-btns">
                              {card.actions.map((act, ai) => (
                                <button key={ai} className="ai-action-btn"
                                  onClick={() => handleSend(act.label || act.command || '')}>
                                  {act.icon && <span>{act.icon}</span>} {act.label || act.command}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {parsed.insightCards.length > 0 && (
                      <div className="ai-insight-cards">
                        {parsed.insightCards.filter(c => c && c.title).map((card, ci) => {
                          const lvl = card.level || 'info';
                          const colorMap = { danger: '#ff4d4f', warning: '#fa8c16', success: '#52c41a', info: '#1677ff' };
                          const bgMap = { danger: '#fff1f0', warning: '#fff7e6', success: '#f6ffed', info: '#f0f5ff' };
                          return (
                            <div key={ci} className="ai-insight-card" style={{ borderLeft: `3px solid ${colorMap[lvl] || colorMap.info}`, background: bgMap[lvl] || bgMap.info, borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, color: colorMap[lvl] || colorMap.info }}>{card.title}</div>
                              {card.summary && <div style={{ fontSize: 12, color: '#333', marginTop: 2 }}>{card.summary}</div>}
                              {card.painPoint && <div style={{ fontSize: 12, color: '#cf1322', marginTop: 2 }}>⚠ {card.painPoint}</div>}
                              {card.execute && <div style={{ fontSize: 12, color: '#1677ff', marginTop: 2 }}>→ {card.execute}</div>}
                              {card.evidence && card.evidence.length > 0 && (
                                <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
                                  {card.evidence.slice(0, 3).map((e, ei) => <div key={ei}>· {e}</div>)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {parsed.charts.length > 0 && (
                      <div className="ai-chart-cards">
                        {parsed.charts.filter(c => c && c.title).map((chart, ci) => (
                          <div key={ci} className="ai-chart-card" style={{ background: '#f0f5ff', borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>📊 {chart.title}</div>
                            {chart.data && chart.data.length > 0 && (
                              <div style={{ marginTop: 4 }}>
                                {chart.data.slice(0, 5).map((d, di) => (
                                  <div key={di} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#595959', padding: '2px 0' }}>
                                    <span>{d.label || d.name || d.category || ''}</span>
                                    <span style={{ fontWeight: 600 }}>{d.value ?? d.count ?? ''}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>类型：{chart.chartType || 'chart'}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {parsed.followUpActions.length > 0 && (
                      <div className="ai-followup-actions">
                        <span className="ai-followup-label">💡 你可能还想</span>
                        {parsed.followUpActions.map((fa, fi) => (
                          <button key={fi} className="ai-followup-btn"
                            onClick={() => handleSend(fa.label)}>
                            {fa.icon && <span>{fa.icon}</span>} {fa.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {parsed.clarificationHints.length > 0 && (
                      <div className="ai-clarification" style={{ background: '#fff7e6', borderRadius: 6, padding: '8px 10px', marginTop: 6 }}>
                        <div style={{ fontSize: 12, color: '#d46b08', marginBottom: 4 }}>🤔 需要补充信息：</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {parsed.clarificationHints.map((hint, hi) => (
                            <button key={hi} className="ai-followup-btn" style={{ fontSize: 12 }}
                              onClick={() => handleSend(hint)}>{hint}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    {parsed.recommendPills.length > 0 && (
                      <div className="ai-recommend-pills">
                        <span className="ai-recommend-label">猜你想问</span>
                        {parsed.recommendPills.map((pill, pi) => (
                          <button key={pi} className="ai-recommend-pill"
                            onClick={() => handleSend(pill)}>
                            {pill}
                          </button>
                        ))}
                      </div>
                    )}
                    {parsed.stepWizardCards.length > 0 && parsed.stepWizardCards.map((wiz, wi) => (
                      <StepWizardCard key={wi} data={wiz} onSubmit={(cmd, params) => { if (!sendingRef.current) { let p = cmd; Object.entries(params).forEach(([k,v]) => { if (Array.isArray(v)) p += ' ' + v.join(','); else if (v !== undefined && v !== null && v !== '') p += ' ' + v; }); handleSend(p); } }} />
                    ))}
                    {msg.role === 'ai' && msg.id !== 'init' && (
                      <div className="ai-msg-actions">
                        <button className="ai-msg-action-btn" onClick={() => tts.speak(msg.text, msg.id)} title="朗读">
                          {tts.playing && tts.playingId === msg.id ? '⏹' : '🔊'}
                        </button>
                        <button className="ai-msg-action-btn" onClick={() => handleFeedback(msg.id, true)} title="有帮助">👍</button>
                        <button className="ai-msg-action-btn" onClick={() => handleFeedback(msg.id, false)} title="没帮助">👎</button>
                      </div>
                    )}
                  </>
                ) : msg.text}
                {msg.role === 'ai' && !parsed && msg.id !== 'init' && (
                  <div className="ai-msg-actions">
                    <button className="ai-msg-action-btn" onClick={() => tts.speak(msg.text, msg.id)} title="朗读">
                      {tts.playing && tts.playingId === msg.id ? '⏹' : '🔊'}
                    </button>
                    <button className="ai-msg-action-btn" onClick={() => handleFeedback(msg.id, true)} title="有帮助">👍</button>
                    <button className="ai-msg-action-btn" onClick={() => handleFeedback(msg.id, false)} title="没帮助">👎</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {currentTool && (
          <div className="chat-msg-row">
            <div className="chat-bubble ai" style={{ background: 'var(--xiaoyun-primary-bg)', fontSize: 12, padding: '6px 10px' }}>
              {currentTool.type === 'thinking' && '💭 小云正在整理思路...'}
              {currentTool.type === 'tool_call' && `🔧 小云正在处理：${currentTool.name}…`}
            </div>
          </div>
        )}
        {toolResults.length > 0 && (
          <div className="chat-msg-row">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {toolResults.map((tr, i) => (
                <span key={i} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: tr.success ? '#f6ffed' : '#fff1f0', color: tr.success ? '#52c41a' : '#ff4d4f', border: `1px solid ${tr.success ? '#b7eb8f' : '#ffa39e'}` }}>
                  {tr.success ? '✓' : '✗'} {tr.name}
                </span>
              ))}
            </div>
          </div>
        )}
        {streamingText && (
          <div className="chat-msg-row">
            <div className="chat-bubble ai">{streamingText}<span className="cursor-blink">▌</span></div>
          </div>
        )}
        {sending && !streamingText && !currentTool && (
          <div className="chat-msg-row">
            <div className="chat-bubble ai thinking">小云正在整理思路...</div>
          </div>
        )}
      </div>

      {!sending && messages.length <= 1 && (
        <div className="chat-quick-chips">
          {prompts.map((p) => (
            <button key={p.label} onClick={() => handleSend(p.text)} className="chat-chip">{p.label}</button>
          ))}
        </div>
      )}

      {!sending && messages.length > 1 && (
        <div className="chat-context-chips">
          {isMgr && <button className="chat-chip" onClick={() => handleSend('当前有哪些逾期或高风险订单？')}>⚠️ 风险订单</button>}
          {isMgr && <button className="chat-chip" onClick={() => handleSend('帮我估算本月利润')}>💰 利润估算</button>}
          <button className="chat-chip" onClick={() => handleSend('当前面料缺口情况')}>📦 面料缺口</button>
          <button className="chat-chip" onClick={() => handleSend('帮我汇总今日日报')}>📋 日报</button>
        </div>
      )}

      {pendingImage && (
        <div className="chat-pending-image">
          <img src={pendingImage.url} alt="" className="chat-pending-img" />
          <span className="chat-pending-image-text">已选图片，发送时将上传识别</span>
          <button onClick={removePendingImage} className="chat-pending-image-del">✕</button>
        </div>
      )}

      <div className="chat-input-bar">
        <button onClick={handleTakePhoto} disabled={sending || uploading}
          className="chat-tool-btn" title="拍照">
          <Icon name="camera" size={18} color="var(--color-text-secondary)" />
        </button>
        <button onClick={voice.toggle} disabled={sending}
          className={`chat-tool-btn${voice.listening ? ' active' : ''}`}
          title="语音输入">
          <Icon name={voice.listening ? 'micOff' : 'mic'} size={18} color={voice.listening ? 'var(--color-error)' : 'var(--color-text-secondary)'} />
        </button>
        <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={voice.listening ? '正在聆听...' : '输入关键字查询内部资料'}
          disabled={sending}
          className="chat-input-field" />
        <button onClick={() => handleSend()} disabled={(!inputText.trim() && !pendingImage) || sending || uploading}
          className="chat-send-btn">
          {uploading ? '上传中' : '发送'}
        </button>
      </div>
    </div>
  );

  return createPortal(floatBtn, document.body);
}
