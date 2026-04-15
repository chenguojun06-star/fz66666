import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { isAdminOrSupervisor, getRoleDisplayName } from '@/utils/permission';
import { toast } from '@/utils/uiHelper';

const QUICK_PROMPTS_WORKER = [
  '内部资料: 扫码规范', '内部资料: 质检流程', '内部资料: 入库流程', '内部资料: 常见问题',
];
const QUICK_PROMPTS_ADMIN = [
  '内部资料: 日报口径', '内部资料: 逾期定义', '内部资料: 采购流程', '内部资料: 返修流程',
];

export default function AiAssistantFloat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (open && !messages.length) {
      const name = user?.name || user?.realName || user?.username || '用户';
      setMessages([{ role: 'ai', text: `Hi ${name}，这里是小云帮助中心。` }]);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamingText]);

  const handleSend = useCallback(async (text) => {
    const msg = (text || inputText).trim();
    if (!msg || sending) return;
    setInputText('');
    setSending(true);
    setStreamingText('');
    const userMsg = { role: 'user', text: msg };
    setMessages((prev) => [...prev, userMsg]);

    let fullText = '';
    try {
      const result = await new Promise((resolve, reject) => {
        const handle = api.intelligence.aiAdvisorChatStream(
          { question: msg, pageContext: window.location.pathname },
          (data) => {
            if (data.type === 'answer' && data.content) {
              fullText += data.content;
              setStreamingText(fullText);
            } else if (data.type === 'tool_call') {
              fullText += `\n🔧 调用工具: ${data.toolName || data.tool || ''}\n`;
              setStreamingText(fullText);
            } else if (data.type === 'tool_result' && data.content) {
              fullText += `📋 ${data.content}\n`;
              setStreamingText(fullText);
            }
          },
          () => {
            setStreamingText('');
            setMessages((prev) => [...prev, { role: 'ai', text: fullText || '（无回复）' }]);
            resolve(fullText);
          },
          (err) => {
            setStreamingText('');
            if (fullText) {
              setMessages((prev) => [...prev, { role: 'ai', text: fullText }]);
            } else {
              api.intelligence.naturalLanguageExecute({ query: msg })
                .then((res) => {
                  const r = res?.data || res;
                  setMessages((prev) => [...prev, { role: 'ai', text: r?.result || r?.message || '暂无回复' }]);
                })
                .catch(() => {
                  setMessages((prev) => [...prev, { role: 'ai', text: '抱歉，小云暂时无法回复，请稍后再试。' }]);
                });
            }
            reject(err);
          }
        );
        abortRef.current = handle;
      });
    } catch (e) { /* handled above */ }
    setSending(false);
  }, [inputText, sending]);

  const prompts = isAdminOrSupervisor() ? QUICK_PROMPTS_ADMIN : QUICK_PROMPTS_WORKER;

  if (!open) {
    return (
      <div
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', right: 16, bottom: 'calc(100px + var(--safe-area-bottom, 0px))',
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--color-primary)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, cursor: 'pointer', zIndex: 9000,
          boxShadow: '0 4px 16px rgba(var(--color-primary-rgb),0.4)',
        }}
      >
        ☁️
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--color-bg-page)', zIndex: 9001,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 16px', background: 'var(--color-bg-card)',
        borderBottom: '1px solid var(--color-border)',
        paddingTop: 'calc(12px + var(--safe-area-top, 0px))',
      }}>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-primary)' }}>✕</button>
        <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>☁️ 小云帮助中心</span>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 12,
          }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px', borderRadius: 16,
              background: msg.role === 'user' ? 'var(--color-primary)' : 'var(--color-bg-card)',
              color: msg.role === 'user' ? '#fff' : 'var(--color-text-primary)',
              fontSize: 'var(--font-size-sm)', lineHeight: 1.6,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px', borderRadius: 16,
              background: 'var(--color-bg-card)', color: 'var(--color-text-primary)',
              fontSize: 'var(--font-size-sm)', lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {streamingText}<span className="cursor-blink">▌</span>
            </div>
          </div>
        )}
        {sending && !streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
            <div style={{ padding: '10px 14px', borderRadius: 16, background: 'var(--color-bg-card)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              小云正在整理思路...
            </div>
          </div>
        )}
      </div>

      {!sending && messages.length <= 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px 8px' }}>
          {prompts.map((p) => (
            <button key={p} onClick={() => handleSend(p)}
              style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', fontSize: 'var(--font-size-xs)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              {p}
            </button>
          ))}
        </div>
      )}

      <div style={{
        display: 'flex', gap: 8, padding: '8px 16px',
        paddingBottom: 'calc(8px + var(--safe-area-bottom, 0px))',
        background: 'var(--color-bg-card)', borderTop: '1px solid var(--color-border)',
      }}>
        <input
          value={inputText} onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="输入关键字查询内部资料，如：扫码规范、质检流程"
          disabled={sending}
          style={{ flex: 1, border: '1px solid var(--color-border)', borderRadius: 12, padding: '10px 14px', fontSize: 14, background: 'var(--color-bg-light)' }}
        />
        <button onClick={() => handleSend()} disabled={!inputText.trim() || sending}
          style={{
            padding: '10px 16px', borderRadius: 12, border: 'none',
            background: (!inputText.trim() || sending) ? 'var(--color-bg-gray)' : 'var(--color-primary)',
            color: (!inputText.trim() || sending) ? 'var(--color-text-disabled)' : '#fff',
            fontWeight: 700, cursor: (!inputText.trim() || sending) ? 'not-allowed' : 'pointer',
          }}>
          发送
        </button>
      </div>

      <style>{`.cursor-blink{animation:blink 1s step-end infinite}@keyframes blink{50%{opacity:0}}`}</style>
    </div>
  );
}
