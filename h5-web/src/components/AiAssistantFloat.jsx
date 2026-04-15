import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { isAdminOrSupervisor } from '@/utils/permission';
import { toast } from '@/utils/uiHelper';
import useVoiceInput from '@/hooks/useVoiceInput';
import Icon from '@/components/Icon';

const QUICK_PROMPTS_WORKER = ['内部资料: 扫码规范', '内部资料: 质检流程', '内部资料: 入库流程', '内部资料: 常见问题'];
const QUICK_PROMPTS_ADMIN = ['内部资料: 日报口径', '内部资料: 逾期定义', '内部资料: 采购流程', '内部资料: 返修流程'];

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
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const user = useAuthStore((s) => s.user);

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
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
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

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setPendingImage({ url: URL.createObjectURL(file), file });
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

    let fullText = '';
    try {
      await new Promise((resolve, reject) => {
        const streamPayload = { question: msg || (imageUrl ? '请看这张图片' : ''), pageContext: window.location.pathname };
        if (imageUrl) streamPayload.imageUrl = imageUrl;

        const handle = api.intelligence.aiAdvisorChatStream(
          streamPayload,
          (data) => {
            if (data.type === 'answer' && data.content) { fullText += data.content; setStreamingText(fullText); }
            else if (data.type === 'tool_call') { fullText += `\n🔧 调用工具: ${data.toolName || data.tool || ''}\n`; setStreamingText(fullText); }
            else if (data.type === 'tool_result' && data.content) { fullText += `📋 ${data.content}\n`; setStreamingText(fullText); }
          },
          () => { setStreamingText(''); setMessages((prev) => [...prev, { role: 'ai', text: fullText || '（无回复）' }]); resolve(); },
          (err) => {
            setStreamingText('');
            if (fullText) { setMessages((prev) => [...prev, { role: 'ai', text: fullText }]); resolve(); }
            else {
              api.intelligence.naturalLanguageExecute({ query: msg }).then((res) => {
                const r = res?.data || res;
                setMessages((prev) => [...prev, { role: 'ai', text: r?.result || r?.message || '暂无回复' }]);
                resolve();
              }).catch(() => { setMessages((prev) => [...prev, { role: 'ai', text: '抱歉，小云暂时无法回复，请稍后再试。' }]); resolve(); });
            }
          }
        );
        abortRef.current = handle;
      });
    } catch (e) { /* handled */ }
    setSending(false);
    setPendingImage(null);
  }, [inputText, sending, pendingImage]);

  const prompts = isAdminOrSupervisor() ? QUICK_PROMPTS_ADMIN : QUICK_PROMPTS_WORKER;

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'var(--color-bg-card)', borderBottom: '1px solid var(--color-border)', paddingTop: 'calc(12px + var(--safe-area-top, 0px))' }}>
        <button onClick={() => { setOpen(false); voice.stop(); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-primary)', padding: '4px 8px' }}>✕</button>
        <MiniCloud size={28} />
        <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>小云帮助中心</span>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px', borderRadius: 16,
              background: msg.role === 'user' ? 'var(--color-primary)' : 'var(--color-bg-card)',
              color: msg.role === 'user' ? '#fff' : 'var(--color-text-primary)',
              fontSize: 14, lineHeight: 1.6, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.image && <img src={msg.image} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 6, display: 'block' }} />}
              {msg.text}
            </div>
          </div>
        ))}
        {streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: 16, background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {streamingText}<span style={{ animation: 'cursorBlink 1s step-end infinite' }}>▌</span>
            </div>
          </div>
        )}
        {sending && !streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div style={{ padding: '10px 14px', borderRadius: 16, background: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', fontSize: 14 }}>小云正在整理思路...</div>
          </div>
        )}
      </div>

      {!sending && messages.length <= 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px 8px' }}>
          {prompts.map((p) => (
            <button key={p} onClick={() => handleSend(p)} style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>{p}</button>
          ))}
        </div>
      )}

      {pendingImage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'var(--color-bg-light)' }}>
          <img src={pendingImage.url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-border)' }} />
          <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)' }}>已选图片，发送时将上传识别</span>
          <button onClick={removePendingImage} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 18 }}>✕</button>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />

      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', paddingBottom: 'calc(8px + var(--safe-area-bottom, 0px))', background: 'var(--color-bg-card)', borderTop: '1px solid var(--color-border)', alignItems: 'center' }}>
        <button onClick={() => fileInputRef.current?.click()} disabled={sending || uploading}
          style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-bg-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, opacity: (sending || uploading) ? 0.5 : 1 }}
          title="拍照/选图">
          <Icon name="camera" size={18} color="var(--color-text-secondary)" />
        </button>
        <button onClick={voice.toggle} disabled={sending}
          className={`chat-tool-btn${voice.listening ? ' active' : ''}`}
          style={{ width: 36, height: 36, borderRadius: 10, border: voice.listening ? '1px solid var(--color-error)' : '1px solid var(--color-border)', background: voice.listening ? 'rgba(239,68,68,0.1)' : 'var(--color-bg-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, opacity: sending ? 0.5 : 1 }}
          title="语音输入">
          <Icon name={voice.listening ? 'micOff' : 'mic'} size={18} color={voice.listening ? 'var(--color-error)' : 'var(--color-text-secondary)'} />
        </button>
        <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={voice.listening ? '正在聆听...' : '输入关键字查询内部资料'}
          disabled={sending}
          style={{ flex: 1, border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px 14px', fontSize: 14, background: 'var(--color-bg-light)', minWidth: 0 }} />
        <button onClick={() => handleSend()} disabled={(!inputText.trim() && !pendingImage) || sending || uploading}
          style={{ padding: '10px 16px', borderRadius: 12, border: 'none', background: ((!inputText.trim() && !pendingImage) || sending || uploading) ? 'var(--color-bg-gray)' : 'var(--color-primary)', color: ((!inputText.trim() && !pendingImage) || sending || uploading) ? 'var(--color-text-disabled)' : '#fff', fontWeight: 700, cursor: ((!inputText.trim() && !pendingImage) || sending || uploading) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
          {uploading ? '上传中' : '发送'}
        </button>
      </div>
    </div>
  );

  return createPortal(floatBtn, document.body);
}
