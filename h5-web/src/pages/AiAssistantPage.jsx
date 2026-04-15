import { useState, useRef, useEffect } from 'react';
import api from '@/api';
import { isAdminOrSupervisor } from '@/utils/permission';
import { toast } from '@/utils/uiHelper';
import useVoiceInput from '@/hooks/useVoiceInput';

const WORKER_PROMPTS = [
  { label: '扫码规范', text: '请给我内部资料：扫码规范' },
  { label: '质检流程', text: '请给我内部资料：质检流程' },
  { label: '入库流程', text: '请给我内部资料：入库流程' },
  { label: '常见问题', text: '请给我内部资料：常见问题' },
];

const MANAGER_PROMPTS = [
  { label: '日报口径', text: '请给我内部资料：日报统计口径' },
  { label: '逾期定义', text: '请给我内部资料：逾期定义' },
  { label: '采购流程', text: '请给我内部资料：采购流程' },
  { label: '返修流程', text: '请给我内部资料：返修流程' },
];

const TOOL_NAMES = {
  tool_query_production_progress: '生产进度', tool_order_edit: '订单编辑',
  tool_query_warehouse_stock: '库存查询', tool_finished_product_stock: '成品库存',
  tool_deep_analysis: '深度分析', tool_knowledge_search: '知识搜索',
  tool_material_receive: '物料收货', tool_finished_outbound: '成品出库',
  tool_quality_inbound: '质检入库', tool_finance_workflow: '财务审批',
  tool_smart_report: '智能报表', tool_delay_trend: '延期趋势',
  tool_root_cause_analysis: '根因分析', tool_whatif: '假设模拟',
  tool_action_executor: '执行操作', tool_procurement: '采购管理',
};

function describeTool(name) {
  return TOOL_NAMES[name] || (name || '').replace(/^tool_/, '').replace(/_/g, '');
}

export default function AiAssistantPage() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingTool, setStreamingTool] = useState('');
  const [isManager, setIsManager] = useState(false);
  const [conversationId] = useState('h5_' + Date.now());
  const [quickPrompts, setQuickPrompts] = useState(WORKER_PROMPTS);
  const [dynamicSuggestions, setDynamicSuggestions] = useState([]);
  const [pendingImage, setPendingImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const streamTaskRef = useRef(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  const voice = useVoiceInput({
    lang: 'zh-CN',
    continuous: false,
    onResult: (transcript) => {
      setInputText(transcript);
    },
  });

  useEffect(() => {
    if (voice.error === 'NOT_SUPPORTED') {
      toast.info('当前浏览器不支持语音识别，请使用Chrome浏览器');
    } else if (voice.error === 'PERMISSION_DENIED') {
      toast.error('请允许麦克风权限');
    } else if (voice.error && voice.error !== 'NO_SPEECH' && voice.error !== 'aborted') {
      toast.error('语音识别出错：' + voice.error);
    }
  }, [voice.error]);

  useEffect(() => {
    const mgr = isAdminOrSupervisor();
    setIsManager(mgr);
    setQuickPrompts(mgr ? MANAGER_PROMPTS : WORKER_PROMPTS);
    setMessages([{ id: 'welcome', role: 'ai', text: '你好！这里是小云帮助中心。有什么可以帮你的？\n\n💡 你可以：\n· 打字提问\n· 📷 拍照识别（点击相机图标）\n· 🎤 语音输入（点击麦克风图标）' }]);
    api.intelligence.getMyPendingTaskSummary().then(res => {
      const data = res?.data || res;
      if (!data) return;
      const suggestions = [];
      if (data.overdueOrderCount > 0) suggestions.push({ label: '🚨 ' + data.overdueOrderCount + '个逾期', text: '当前有哪些逾期订单？帮我分析一下' });
      if (data.qualityTaskCount > 0) suggestions.push({ label: '📋 ' + data.qualityTaskCount + '个待质检', text: '有哪些待质检的任务？' });
      if (data.materialShortageCount > 0) suggestions.push({ label: '⚠️ 面料缺口', text: '当前有哪些面料缺口预警？' });
      if (suggestions.length > 0) setDynamicSuggestions(suggestions);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const chooseImage = async () => {
    if (sending || uploading) return;
    if (fileInputRef.current) {
      fileInputRef.current.click();
      return;
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const url = URL.createObjectURL(file);
    setPendingImage({ url, file });
  };

  const removePendingImage = () => {
    if (pendingImage?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(pendingImage.url);
    }
    setPendingImage(null);
  };

  const uploadPendingImage = async () => {
    if (!pendingImage) return null;
    if (pendingImage.file) {
      setUploading(true);
      try {
        const url = await api.common.uploadImage(pendingImage.file);
        return url;
      } catch (e) {
        toast.error('图片上传失败');
        return null;
      } finally {
        setUploading(false);
      }
    }
    return pendingImage.url;
  };

  const _send = async (text, imageUrl) => {
    const displayText = imageUrl ? (text || '请看这张图片') : text;
    const userMsg = {
      id: Date.now() + '_u',
      role: 'user',
      text: displayText,
      image: imageUrl ? imageUrl : (pendingImage?.url || null),
    };
    const loadingId = Date.now() + '_l';
    setMessages(prev => [...prev, userMsg, { id: loadingId, role: 'ai', text: '', loading: true }]);
    setSending(true);
    setStreamingText('');
    setStreamingTool('');
    setPendingImage(null);

    let accumulatedText = '';
    let streamStarted = false;
    const chatContext = isManager ? 'manager_assistant' : 'worker_assistant';

    try {
      const streamPayload = {
        question: text || (imageUrl ? '请看这张图片' : ''),
        pageContext: chatContext,
        conversationId,
      };
      if (imageUrl) streamPayload.imageUrl = imageUrl;

      streamTaskRef.current = api.intelligence.aiAdvisorChatStream(
        streamPayload,
        (event) => {
          streamStarted = true;
          if (event.type === 'thinking') setStreamingTool('小云正在整理思路…');
          else if (event.type === 'tool_call') setStreamingTool('正在处理：' + describeTool(String(event.data?.tool || '')) + '…');
          else if (event.type === 'tool_result') setStreamingTool(event.data?.success ? '已完成，继续整理…' : '重新组织…');
          else if (event.type === 'answer') {
            const content = String(event.data?.content || '');
            if (content) { accumulatedText += content; setStreamingText(accumulatedText); setStreamingTool(''); }
          }
        },
        () => {
          streamTaskRef.current = null;
          const rawText = accumulatedText || '抱歉，我暂时无法回答这个问题。';
          setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, text: rawText, loading: false } : m));
          setSending(false);
          setStreamingText('');
          setStreamingTool('');
        },
        async (err) => {
          streamTaskRef.current = null;
          if (streamStarted && accumulatedText) {
            setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, text: accumulatedText, loading: false } : m));
            setSending(false); setStreamingText(''); setStreamingTool('');
            return;
          }
          try {
            let reply;
            const chatPayload = { message: text, conversationId, context: chatContext };
            if (imageUrl) chatPayload.imageUrl = imageUrl;
            if (isManager) {
              try { const res = await api.intelligence.naturalLanguageExecute({ text, conversationId }); reply = res?.message || res?.reply || res?.content || '操作完成'; }
              catch (_) { const res = await api.intelligence.aiAdvisorChat(chatPayload); reply = res?.reply || res?.content || res?.message || '（无回应）'; }
            } else {
              const res = await api.intelligence.aiAdvisorChat(chatPayload); reply = res?.reply || res?.content || res?.message || '（无回应）';
            }
            setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, text: reply, loading: false } : m));
          } catch (_) {
            setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, text: '服务暂时无法响应，请稍后再试。', loading: false } : m));
          } finally { setSending(false); setStreamingText(''); setStreamingTool(''); }
        }
      );
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, text: '服务暂时无法响应，请稍后再试。', loading: false } : m));
      setSending(false); setStreamingText(''); setStreamingTool('');
    }
  };

  const onSend = async () => {
    const text = inputText.trim();
    if ((!text && !pendingImage) || sending) return;
    setInputText('');
    voice.stop();
    let imageUrl = null;
    if (pendingImage) {
      imageUrl = await uploadPendingImage();
      if (pendingImage && !imageUrl) return;
    }
    _send(text, imageUrl);
  };

  const onQuickPrompt = (prompt) => {
    if (sending) return;
    setInputText(prompt.text);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {messages.map(m => (
          <div key={m.id} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8, padding: '0 4px' }}>
            <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: 12,
              background: m.role === 'user' ? 'var(--color-primary)' : 'var(--color-bg-light)',
              color: m.role === 'user' ? '#fff' : 'var(--color-text-primary)',
              fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {m.image && (
                <div style={{ marginBottom: 6 }}>
                  <img src={m.image} alt="上传图片" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, objectFit: 'cover' }} />
                </div>
              )}
              {m.loading ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ animation: 'wxspin 1s linear infinite', display: 'inline-block' }}>⟳</span> 思考中...
                </span>
              ) : m.text}
            </div>
          </div>
        ))}
        {streamingTool && (
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--color-text-secondary)', padding: 4 }}>{streamingTool}</div>
        )}
        {streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8, padding: '0 4px' }}>
            <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: 12, background: 'var(--color-bg-light)',
              fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{streamingText}</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {(quickPrompts.length > 0 || dynamicSuggestions.length > 0) && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 0', flexShrink: 0 }}>
          {[...dynamicSuggestions, ...quickPrompts].map((p, i) => (
            <button key={i} className="scan-type-chip" onClick={() => onQuickPrompt(p)}
              style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 16, border: '1px solid var(--color-border)',
                background: 'var(--color-bg-light)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {p.label}
            </button>
          ))}
        </div>
      )}

      {pendingImage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', flexShrink: 0, position: 'relative' }}>
          <img src={pendingImage.url} alt="待发送" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '2px solid var(--color-primary)' }} />
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>📷 已选图片，发送时将上传识别</span>
          <button onClick={removePendingImage} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, padding: '8px 0', flexShrink: 0, alignItems: 'center' }}>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
        <button onClick={chooseImage} disabled={sending || uploading}
          style={{ width: 40, height: 40, borderRadius: 20, border: '1px solid var(--color-border)',
            background: 'var(--color-bg-light)', fontSize: 18, cursor: sending ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: sending ? 0.5 : 1 }}
          title="拍照/选图">
          📷
        </button>
        <button onClick={voice.toggle} disabled={sending}
          style={{ width: 40, height: 40, borderRadius: 20, border: voice.listening ? '2px solid #ef4444' : '1px solid var(--color-border)',
            background: voice.listening ? '#fef2f2' : 'var(--color-bg-light)', fontSize: 18, cursor: sending ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            animation: voice.listening ? 'pulse 1.5s ease-in-out infinite' : 'none' }}
          title="语音输入">
          🎤
        </button>
        <input className="text-input" placeholder={voice.listening ? '正在聆听...' : '输入消息...'} value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && onSend()} style={{ flex: 1 }} />
        <button className="primary-button" onClick={onSend} disabled={sending || uploading}
          style={{ flexShrink: 0, minWidth: 56 }}>
          {uploading ? '上传中' : sending ? '...' : '发送'}
        </button>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
