import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Input, Button, Spin, Tag, Alert } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { NlQueryResponse } from '@/services/production/productionApi';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  confidence?: number;
  suggestions?: string[];
  data?: Record<string, unknown>;
}

const NlQueryPanel: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'ai', content: '你好！我是 AI 决策助手。你可以用自然语言提问，例如：\n• "今天产量多少？"\n• "哪个工厂效率最高？"\n• "逾期订单有几个？"' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.nlQuery({ question: q }) as any;
      const d: NlQueryResponse | null = res?.data ?? null;
      if (d) {
        setMessages(prev => [...prev, {
          role: 'ai',
          content: d.answer,
          confidence: d.confidence,
          suggestions: d.suggestions,
          data: d.data,
        }]);
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: '抱歉，未能理解你的提问。' }]);
      }
    } catch (e: any) {
      setError(e?.message || '查询失败');
      setMessages(prev => [...prev, { role: 'ai', content: '出错了，请稍后再试。' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const handleSuggestion = (s: string) => {
    setInput(s);
  };

  return (
    <div className="intelligence-panel nl-panel">
      <div className="chat-container">
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-bubble ${msg.role}`}>
            <div className="chat-avatar">
              {msg.role === 'ai' ? <RobotOutlined /> : <UserOutlined />}
            </div>
            <div className="chat-body">
              <div className="chat-text" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
              {msg.confidence !== undefined && (
                <div className="chat-meta">
                  <Tag color={msg.confidence >= 80 ? 'green' : msg.confidence >= 50 ? 'orange' : 'red'}>
                    置信度 {msg.confidence}%
                  </Tag>
                </div>
              )}
              {msg.data && Object.keys(msg.data).length > 0 && (
                <div className="chat-data">
                  {Object.entries(msg.data).map(([k, v]) => (
                    <Tag key={k} color="blue">{k}: {String(v)}</Tag>
                  ))}
                </div>
              )}
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="chat-suggestions">
                  {msg.suggestions.map((s, si) => (
                    <Button key={si} size="small" type="dashed" onClick={() => handleSuggestion(s)}>{s}</Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-bubble ai">
            <div className="chat-avatar"><RobotOutlined /></div>
            <div className="chat-body"><Spin size="small" /> <span style={{ marginLeft: 8 }}>思考中...</span></div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      {error && <Alert type="error" message={error} style={{ marginBottom: 8 }} closable />}
      <div className="chat-input-row">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="输入你的问题…"
          onPressEnter={send}
          disabled={loading}
          style={{ flex: 1 }}
        />
        <Button type="primary" icon={<SendOutlined />} onClick={send} loading={loading}>发送</Button>
      </div>
    </div>
  );
};

export default NlQueryPanel;
