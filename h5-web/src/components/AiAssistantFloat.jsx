import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { isAdminOrSupervisor } from '@/utils/permission';

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
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const user = useAuthStore((s) => s.user);

  const [pos, setPos] = useState({ x: -1, y: -1 });
  const dragging = useRef(false);
  const startTouch = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  useEffect(() => {
    if (pos.x === -1) {
      setPos({ x: window.innerWidth - 66, y: window.innerHeight * 0.55 });
    }
  }, []);

  useEffect(() => {
    if (open && !messages.length) {
      const name = user?.name || user?.realName || user?.username || '用户';
      setMessages([{ role: 'ai', text: `Hi ${name}，这里是小云帮助中心。` }]);
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

  const handleSend = useCallback(async (text) => {
    const msg = (text || inputText).trim();
    if (!msg || sending) return;
    setInputText('');
    setSending(true);
    setStreamingText('');
    setMessages((prev) => [...prev, { role: 'user', text: msg }]);

    let fullText = '';
    try {
      await new Promise((resolve, reject) => {
        const handle = api.intelligence.aiAdvisorChatStream(
          { question: msg, pageContext: window.location.pathname },
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
  }, [inputText, sending]);

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
      }}
    >
      <MiniCloud size={50} />
    </div>
  ) : (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg-page)', zIndex: 99999, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'var(--color-bg-card)', borderBottom: '1px solid var(--color-border)', paddingTop: 'calc(12px + var(--safe-area-top, 0px))' }}>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-primary)', padding: '4px 8px' }}>✕</button>
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
            }}>{msg.text}</div>
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

      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', paddingBottom: 'calc(8px + var(--safe-area-bottom, 0px))', background: 'var(--color-bg-card)', borderTop: '1px solid var(--color-border)' }}>
        <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="输入关键字查询内部资料，如：扫码规范、质检流程" disabled={sending}
          style={{ flex: 1, border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px 14px', fontSize: 14, background: 'var(--color-bg-light)' }} />
        <button onClick={() => handleSend()} disabled={!inputText.trim() || sending}
          style={{ padding: '10px 16px', borderRadius: 12, border: 'none', background: (!inputText.trim() || sending) ? 'var(--color-bg-gray)' : 'var(--color-primary)', color: (!inputText.trim() || sending) ? 'var(--color-text-disabled)' : '#fff', fontWeight: 700, cursor: (!inputText.trim() || sending) ? 'not-allowed' : 'pointer' }}>
          发送
        </button>
      </div>
    </div>
  );

  return createPortal(floatBtn, document.body);
}
