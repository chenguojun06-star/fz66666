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
];

function MiniCloud({ size = 50 }) {
  const s = size / 50;
  return (
    <div style={{ position: 'relative', width: 50 * s, height: 50 * s, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        position: 'absolute', inset: 4 * s, borderRadius: 500, background: 'radial-gradient(circle, rgba(74,140,255,0.22), rgba(74,140,255,0.04) 66%, transparent 78%)',
        animation: 'glowPulse 5.2s ease-in-out infinite',
      }} />
      <div style={{ position: 'relative', width: 40 * s, height: 29 * s, animation: 'floatSoft 4.8s ease-in-out infinite' }}>
        <div style={{ position: 'absolute', width: 13 * s, height: 13 * s, left: 4 * s, top: 10 * s, borderRadius: '50%', background: 'var(--color-bg-light)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 3px 7px rgba(var(--color-primary-rgb),0.14)' }} />
        <div style={{ position: 'absolute', width: 17 * s, height: 17 * s, left: 11 * s, top: 3 * s, borderRadius: '50%', background: 'var(--color-bg-light)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 3px 7px rgba(var(--color-primary-rgb),0.14)' }} />
        <div style={{ position: 'absolute', width: 12 * s, height: 12 * s, right: 4 * s, top: 11 * s, borderRadius: '50%', background: 'var(--color-bg-light)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 3px 7px rgba(var(--color-primary-rgb),0.14)' }} />
        <div style={{ position: 'absolute', left: 5 * s, right: 5 * s, bottom: 3 * s, height: 12 * s, borderRadius: 500, background: 'var(--color-bg-light)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 3px 7px rgba(var(--color-primary-rgb),0.14)' }} />
        <div style={{ position: 'absolute', top: 14 * s, left: 12 * s, width: 5 * s, height: 7 * s, borderRadius: 500, background: 'var(--color-primary)', animation: 'cloudBlink 6.6s ease-in-out infinite', overflow: 'hidden' }}>
          <div style={{ width: 2 * s, height: 2 * s, margin: '1px 0 0 1px', borderRadius: '50%', background: 'rgba(255,255,255,0.96)', animation: 'eyeHighlightTwinkle 4.2s ease-in-out infinite' }} />
        </div>
        <div style={{ position: 'absolute', top: 14 * s, right: 12 * s, width: 5 * s, height: 7 * s, borderRadius: 500, background: 'var(--color-primary)', animation: 'cloudBlink 6.6s ease-in-out infinite', overflow: 'hidden' }}>
          <div style={{ width: 2 * s, height: 2 * s, margin: '1px 0 0 1px', borderRadius: '50%', background: 'rgba(255,255,255,0.96)', animation: 'eyeHighlightTwinkle 4.2s ease-in-out infinite' }} />
        </div>
        <div style={{ position: 'absolute', left: '50%', bottom: 5 * s, width: 12 * s, height: 6 * s, marginLeft: -6 * s, borderBottom: `2px solid var(--color-primary)`, borderRadius: '0 0 12px 12px', animation: 'cloudSmileTalk 3.8s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', width: 4 * s, height: 4 * s, background: 'var(--color-warning)', transform: 'rotate(45deg)', left: 2 * s, top: 4 * s, animation: 'sparkleBlink 2s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', width: 4 * s, height: 4 * s, background: 'var(--color-warning)', transform: 'rotate(45deg)', right: 1 * s, top: 3 * s, animation: 'sparkleBlink 2s ease-in-out infinite 0.6s' }} />
      </div>
    </div>
  );
}

export { MiniCloud };

const CHAT_STORAGE_KEY = 'h5_ai_chat_messages';
const MAX_STORED_MESSAGES = 20;

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

export default function AiAssistantFloat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => loadStoredMessages());
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [pendingImage, setPendingImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef(null);
  const sendingRef = useRef(false);
  const user = useAuthStore((s) => s.user);
  const scanResultData = useGlobalStore(s => s.scanResultData);
  const aiStream = useAiChatStream();

  useEffect(() => { storeMessages(messages); }, [messages]);

  const currentPageContext = (() => {
    const path = window.location.pathname;
    if (path.includes('/scan')) return 'scan_page';
    if (path.includes('/work')) return 'work_page';
    if (path.includes('/warehouse')) return 'warehouse_page';
    if (path.includes('/dashboard')) return 'dashboard_page';
    if (path.includes('/admin')) return 'admin_page';
    if (path.includes('/cutting')) return 'cutting_page';
    if (path.includes('/procurement')) return 'procurement_page';
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

  useEffect(() => {
    return () => { aiStream.abort(); };
  }, []);

  useEffect(() => {
    if (open && !messages.length) {
      const name = user?.name || user?.realName || user?.username || '用户';
      setMessages([{ role: 'ai', text: `Hi ${name}，这里是小云帮助中心。\n\n你可以：\n· 打字提问\n· 拍照识别\n· 语音输入` }]);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamingText]);

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
      if (e?.message !== 'cancel') {
        toast.error('拍照失败，请重试');
      }
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

  const [isMgr, setIsMgr] = useState(false);

  useEffect(() => {
    setIsMgr(isManagerLevel());
  }, []);

  const handleSend = useCallback(async (text) => {
    const msg = (text || inputText).trim();
    if ((!msg && !pendingImage) || sendingRef.current) return;
    sendingRef.current = true;
    setInputText('');
    voice.stop();
    setSending(true);
    setStreamingText('');

    let imageUrl = null;
    if (pendingImage) {
      imageUrl = await uploadPendingImage();
      if (pendingImage && !imageUrl) { setSending(false); sendingRef.current = false; return; }
    }

    const displayText = imageUrl ? (msg || '请看这张图片') : msg;
    setMessages((prev) => [...prev, { role: 'user', text: displayText, image: imageUrl || (pendingImage?.url || null) }]);

    const chatContext = isMgr ? 'manager_assistant' : 'worker_assistant';
    let fullText = '';
    let aiMsgAdded = false;
    try {
      const streamParams = { question: msg, pageContext: `${chatContext}:${currentPageContext}`, imageUrl };
      if (scanResultData) {
        if (scanResultData.orderNo) streamParams.orderNo = scanResultData.orderNo;
        if (scanResultData.processName) streamParams.processName = scanResultData.processName;
        if (scanResultData.progressStage) streamParams.stage = scanResultData.progressStage;
      }
      await aiStream.startStream(
        streamParams,
        {
          onEvent: (event) => {
            if (event.type === 'text') { fullText = event.text; setStreamingText(fullText); }
          },
          onComplete: (finalText) => {
            if (aiMsgAdded) return;
            aiMsgAdded = true;
            setStreamingText('');
            setMessages((prev) => [...prev, { role: 'ai', text: finalText || fullText || '（无回复）' }]);
            setSending(false);
            sendingRef.current = false;
            setPendingImage(null);
          },
          onError: () => {
            if (aiMsgAdded) return;
            aiMsgAdded = true;
            setMessages((prev) => [...prev, { role: 'ai', text: '抱歉，小云暂时无法回复，请稍后再试。' }]);
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
        setMessages((prev) => [...prev, { role: 'ai', text: '抱歉，小云暂时无法回复，请稍后再试。' }]);
      }
      setSending(false);
      sendingRef.current = false;
      setPendingImage(null);
    }
  }, [inputText, sending, pendingImage, isMgr]);

  const prompts = isMgr ? QUICK_PROMPTS_ADMIN : QUICK_PROMPTS_WORKER;

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
        boxShadow: '0 4px 20px rgba(59,130,246,0.3)',
        cursor: 'pointer', touchAction: 'none',
        border: '2px solid rgba(59,130,246,0.15)',
        transition: 'left 0.3s ease',
      }}
    >
      <MiniCloud size={50} />
    </div>
  ) : (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-page)', zIndex: 99999, display: 'flex', flexDirection: 'column' }}>
      <div className="chat-header">
        <button onClick={() => { setOpen(false); voice.stop(); }} className="chat-close-btn">✕</button>
        <MiniCloud size={28} />
        <span className="chat-header-title">小云帮助中心</span>
      </div>

      <div ref={scrollRef} className="chat-msg-scroll">
        {messages.map((msg, i) => {
          const parsed = msg.role === 'ai' && msg.text ? parseAiResponse(msg.text) : null;
          return (
            <div key={i} className={`chat-msg-row ${msg.role === 'user' ? 'user' : ''}`}>
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
                                  {act.label || act.command}
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
                              {(card.source || card.confidence) && (
                                <div style={{ fontSize: 10, color: '#bfbfbf', marginTop: 4, display: 'flex', gap: 6 }}>
                                  {card.source && <span>来源:{card.source}</span>}
                                  {card.confidence && <span>{card.confidence}</span>}
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
                            <div style={{ fontSize: 11, color: '#8c8c8c' }}>类型：{chart.chartType || 'chart'}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {parsed.followUpActions.length > 0 && (
                      <div className="ai-followup-actions">
                        {parsed.followUpActions.map((fa, fi) => (
                          <button key={fi} className="ai-followup-btn"
                            onClick={() => handleSend(fa.label)}>
                            {fa.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {parsed.clarificationHints && parsed.clarificationHints.length > 0 && (
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
                  </>
                ) : msg.text}
              </div>
            </div>
          );
        })}
        {streamingText && (
          <div className="chat-msg-row">
            <div className="chat-bubble ai">{streamingText}<span className="cursor-blink">▌</span></div>
          </div>
        )}
        {sending && !streamingText && (
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
