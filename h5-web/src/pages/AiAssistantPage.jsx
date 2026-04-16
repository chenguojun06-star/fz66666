import { useState, useRef, useEffect, useCallback } from 'react';
import api from '@/api';
import { isManagerLevel } from '@/utils/permission';
import { toast } from '@/utils/uiHelper';
import useVoiceInput from '@/hooks/useVoiceInput';
import useAiChatStream from '@/hooks/useAiChatStream';
import Icon from '@/components/Icon';
import { parseAiResponse } from '@/utils/chatParser';

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
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const aiStream = useAiChatStream();

  const voice = useVoiceInput({
    lang: 'zh-CN',
    continuous: false,
    onResult: (transcript) => setInputText(transcript),
  });

  useEffect(() => {
    if (voice.error === 'NOT_SUPPORTED') toast.info('当前浏览器不支持语音识别，请使用Chrome浏览器');
    else if (voice.error === 'PERMISSION_DENIED') toast.error('请允许麦克风权限');
    else if (voice.error && voice.error !== 'NO_SPEECH' && voice.error !== 'aborted') toast.error('语音识别出错：' + voice.error);
  }, [voice.error]);

  useEffect(() => {
    const mgr = isManagerLevel();
    setIsManager(mgr);
    setQuickPrompts(mgr ? MANAGER_PROMPTS : WORKER_PROMPTS);
    setMessages([{ id: 'welcome', role: 'ai', text: '你好！这里是小云帮助中心。有什么可以帮你的？\n\n你可以：\n· 打字提问\n· 拍照识别\n· 语音输入' }]);
    api.intelligence.getMyPendingTaskSummary().then(res => {
      const data = res?.data || res;
      if (!data) return;
      const suggestions = [];
      if (data.overdueOrderCount > 0) suggestions.push({ label: data.overdueOrderCount + '个逾期', text: '当前有哪些逾期订单？帮我分析一下', alert: true });
      if (data.qualityTaskCount > 0) suggestions.push({ label: data.qualityTaskCount + '个待质检', text: '有哪些待质检的任务？', alert: true });
      if (data.materialShortageCount > 0) suggestions.push({ label: '面料缺口', text: '当前有哪些面料缺口预警？', alert: true });
      if (suggestions.length > 0) setDynamicSuggestions(suggestions);
    }).catch((e) => { console.error('getMyPendingTaskSummary failed:', e); });
    return () => { aiStream.abort(); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

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

  const _send = useCallback(async (text, imageUrl) => {
    const displayText = imageUrl ? (text || '请看这张图片') : text;
    const userMsg = { id: Date.now() + '_u', role: 'user', text: displayText, image: imageUrl ? imageUrl : (pendingImage?.url || null) };
    const loadingId = Date.now() + '_l';
    setMessages(prev => [...prev, userMsg, { id: loadingId, role: 'ai', text: '', loading: true }]);
    setSending(true);
    setStreamingText('');
    setStreamingTool('');
    setPendingImage(null);

    const chatContext = isManager ? 'manager_assistant' : 'worker_assistant';
    let aiMsgUpdated = false;

    const updateLoadingMsg = (newText) => {
      if (aiMsgUpdated) return;
      aiMsgUpdated = true;
      setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, text: newText, loading: false } : m));
      setSending(false); setStreamingText(''); setStreamingTool('');
    };

    try {
      await aiStream.startStream(
        { question: text, pageContext: chatContext, conversationId, imageUrl },
        {
          onEvent: (event) => {
            if (event.type === 'thinking') setStreamingTool('小云正在整理思路…');
            else if (event.type === 'tool_call') setStreamingTool('正在处理：' + describeTool(String(event.name || '')) + '…');
            else if (event.type === 'tool_result') setStreamingTool(event.success ? '已完成，继续整理…' : '重新组织…');
            else if (event.type === 'text') { setStreamingText(event.text); setStreamingTool(''); }
          },
          onComplete: (finalText) => {
            updateLoadingMsg(finalText || '抱歉，我暂时无法回答这个问题。');
          },
          onError: () => {
            updateLoadingMsg('服务暂时无法响应，请稍后再试。');
          },
          onFallback: async (q) => {
            let reply;
            const chatPayload = { question: q, conversationId, context: chatContext };
            if (imageUrl) chatPayload.imageUrl = imageUrl;
            if (isManager) {
              try { const res = await api.intelligence.naturalLanguageExecute({ text: q, conversationId }); reply = res?.message || res?.reply || res?.content || '操作完成'; }
              catch (_) { const res = await api.intelligence.aiAdvisorChat(chatPayload); reply = res?.reply || res?.content || res?.message || '（无回应）'; }
            } else {
              const res = await api.intelligence.aiAdvisorChat(chatPayload); reply = res?.reply || res?.content || res?.message || '（无回应）';
            }
            return reply;
          },
        }
      );
    } catch (err) {
      updateLoadingMsg('服务暂时无法响应，请稍后再试。');
    }
  }, [conversationId, isManager, pendingImage]);

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

  return (
    <div className="chat-wrapper">
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      {(dynamicSuggestions.length > 0) && (
        <div style={{ padding: '10px 12px 0' }}>
          <div className="alert-header">
            <Icon name="bell" size={12} /> 实时提醒
          </div>
          <div className="chat-quick-chips">
            {dynamicSuggestions.map((s, i) => (
              <button key={i} className="chat-chip alert" onClick={() => { if (!sending) { setInputText(s.text); } }}>{s.label}</button>
            ))}
          </div>
        </div>
      )}

      {quickPrompts.length > 0 && (
        <div className="chat-quick-chips" style={{ padding: '12px 12px 4px' }}>
          {quickPrompts.map((p, i) => (
            <button key={i} className="chat-chip" onClick={() => { if (!sending) setInputText(p.text); }}>{p.label}</button>
          ))}
        </div>
      )}

      <div className="chat-msg-list">
        {messages.map(m => {
          const parsed = m.role === 'ai' && m.text && !m.loading ? parseAiResponse(m.text) : null;
          return (
            <div key={m.id} className={`chat-msg-row ${m.role === 'user' ? 'user' : ''}`}>
              {m.role === 'ai' && <div className="chat-avatar ai"><Icon name="cloud" size={14} /></div>}
              <div className={`chat-bubble ${m.role === 'user' ? 'user' : 'ai'}`}>
                {m.image && <img src={m.image} alt="上传图片" />}
                {m.loading ? (
                  <span className="typing-indicator"><span>⟳</span> 思考中...</span>
                ) : parsed ? (
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
                                  onClick={() => { if (!sending) { setInputText(act.label || act.command || ''); } }}>
                                  {act.label || act.command}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {parsed.followUpActions.length > 0 && (
                      <div className="ai-followup-actions">
                        {parsed.followUpActions.map((fa, fi) => (
                          <button key={fi} className="ai-followup-btn"
                            onClick={() => { if (!sending) setInputText(fa.label); }}>
                            {fa.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {parsed.recommendPills.length > 0 && (
                      <div className="ai-recommend-pills">
                        <span className="ai-recommend-label">猜你想问</span>
                        {parsed.recommendPills.map((pill, pi) => (
                          <button key={pi} className="ai-recommend-pill"
                            onClick={() => { if (!sending) setInputText(pill); }}>
                            {pill}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : m.text}
              </div>
              {m.role === 'user' && <div className="chat-avatar user">我</div>}
            </div>
          );
        })}
        {streamingTool && <div className="chat-streaming-tool">{streamingTool}</div>}
        {streamingText && (
          <div className="chat-msg-row">
            <div className="chat-avatar ai"><Icon name="cloud" size={14} /></div>
            <div className="chat-bubble ai">{streamingText}<span className="cursor-blink-page">▍</span></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {pendingImage && (
        <div className="chat-pending-image">
          <img src={pendingImage.url} alt="待发送" />
          <span className="chat-pending-image-text">已选图片，发送时将上传识别</span>
          <button className="chat-pending-image-del" onClick={removePendingImage}><Icon name="x" size={14} /></button>
        </div>
      )}

      <div className="chat-input-bar">
        <button className="chat-tool-btn" onClick={() => fileInputRef.current?.click()} disabled={sending || uploading} title="拍照/选图">
          <Icon name="camera" size={18} />
        </button>
        <button className={`chat-tool-btn${voice.listening ? ' active' : ''}`} onClick={voice.toggle} disabled={sending} title="语音输入">
          <Icon name={voice.listening ? 'micOff' : 'mic'} size={18} />
        </button>
        <input className="chat-input-field" placeholder={voice.listening ? '正在聆听...' : '输入消息...'} value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && onSend()} />
        <button className="chat-send-btn" onClick={onSend} disabled={sending || uploading}>
          {uploading ? '上传中' : sending ? '...' : '发送'}
        </button>
      </div>
    </div>
  );
}
