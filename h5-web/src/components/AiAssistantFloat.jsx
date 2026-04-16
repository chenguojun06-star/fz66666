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

const QUICK_PROMPTS_WORKER = [
  { label: '我的任务', text: '我今天负责的生产任务是什么？' },
  { label: '扫码记录', text: '帮我查一下我最近的扫码记录' },
  { label: '订单进度', text: '我负责的订单当前进度怎么样？' },
];
const QUICK_PROMPTS_ADMIN = [
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

export default function AiAssistantFloat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [pendingImage, setPendingImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef(null);
  const user = useAuthStore((s) => s.user);
  const scanResultData = useGlobalStore(s => s.scanResultData);
  const aiStream = useAiChatStream();

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
    if ((!msg && !pendingImage) || sending) return;
    setInputText('');
    voice.stop();
    setSending(true);
    setStreamingText('');

    let imageUrl = null;
    if (pendingImage) {
      imageUrl = await uploadPendingImage();
      if (pendingImage && !imageUrl) { setSending(false); return; }
    }

    const displayText = imageUrl ? (msg || '请看这张图片') : msg;
    setMessages((prev) => [...prev, { role: 'user', text: displayText, image: imageUrl || (pendingImage?.url || null) }]);

    const chatContext = isMgr ? 'manager_assistant' : 'worker_assistant';
    let fullText = '';
    try {
      const streamParams = { question: msg, pageContext: chatContext, imageUrl };
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
            setStreamingText('');
            setMessages((prev) => [...prev, { role: 'ai', text: finalText || fullText || '（无回复）' }]);
            setSending(false);
            setPendingImage(null);
          },
          onError: () => {
            setMessages((prev) => [...prev, { role: 'ai', text: '抱歉，小云暂时无法回复，请稍后再试。' }]);
            setSending(false);
            setPendingImage(null);
          },
          onFallback: async (q) => {
            if (isMgr) {
              try {
                const res = await api.intelligence.naturalLanguageExecute({ text: q });
                const r = res?.data || res;
                return r?.result || r?.message || r?.reply || '操作完成';
              } catch (_) {
                const res = await api.intelligence.aiAdvisorChat({ message: q, context: 'manager_assistant' });
                return res?.reply || res?.content || res?.message || '（无回应）';
              }
            } else {
              const res = await api.intelligence.aiAdvisorChat({ message: q, context: 'worker_assistant' });
              return res?.reply || res?.content || res?.message || '（无回应）';
            }
          },
        }
      );
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'ai', text: '抱歉，小云暂时无法回复，请稍后再试。' }]);
      setSending(false);
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
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg-row ${msg.role === 'user' ? 'user' : ''}`}>
            <div className={`chat-bubble ${msg.role === 'user' ? 'user' : 'ai'}`}>
              {msg.image && <img src={msg.image} alt="" className="chat-bubble-img" />}
              {msg.text}
            </div>
          </div>
        ))}
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
