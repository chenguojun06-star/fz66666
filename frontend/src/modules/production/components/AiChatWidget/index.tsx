import React, { useState, useRef, useEffect } from 'react';
import { Button, Drawer, Input, Spin, Typography, Divider } from 'antd';
import { RobotOutlined, SendOutlined, CloseOutlined } from '@ant-design/icons';
import api from '../../../../utils/api';

const { Text, Paragraph } = Typography;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const WELCOME_MSG: ChatMessage = {
  role: 'assistant',
  content: '你好！我是 AI 跟单助手 🤖\n\n你可以问我：\n• 今天哪些订单风险最高？\n• 哪个工厂的进度最慢？\n• 帮我分析逾期原因。\n\n我会结合你当前的生产数据给出建议。',
  timestamp: Date.now(),
};

const AiChatWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 每次新消息后滚动到底部
  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  }, [messages, open]);

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: question, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post<{ answer: string }>(
        '/ai/chat',
        { question }
      );
      const answer = (res as any)?.answer ?? (res as any)?.data?.answer ?? '暂无回复，请重试。';
      setMessages(prev => [...prev, { role: 'assistant', content: answer, timestamp: Date.now() }]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '网络错误，请稍后再试。', timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* 悬浮按钮 */}
      <div
        className="ai-chat-fab"
        onClick={() => setOpen(true)}
        title="AI 跟单助手"
      >
        <RobotOutlined style={{ fontSize: 24, color: '#fff' }} />
      </div>

      {/* 对话抽屉 */}
      <Drawer
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RobotOutlined style={{ color: '#1677ff' }} />
            <span>AI 跟单助手</span>
            <span style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>由 DeepSeek 驱动</span>
          </span>
        }
        placement="right"
        width={420}
        open={open}
        onClose={() => setOpen(false)}
        closeIcon={<CloseOutlined />}
        styles={{
          body: { display: 'flex', flexDirection: 'column', padding: 0, height: '100%' },
          header: { borderBottom: '1px solid #f0f0f0', padding: '12px 16px' },
        }}
      >
        {/* 消息列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
                gap: 8,
                marginBottom: 14,
              }}
            >
              {/* 头像 */}
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  background: msg.role === 'user' ? '#1677ff' : '#f0f5ff',
                  color: msg.role === 'user' ? '#fff' : '#1677ff',
                }}
              >
                {msg.role === 'user' ? '我' : <RobotOutlined />}
              </div>

              {/* 气泡 */}
              <div
                style={{
                  maxWidth: '78%',
                  background: msg.role === 'user' ? '#1677ff' : '#f8f9ff',
                  color: msg.role === 'user' ? '#fff' : '#222',
                  borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                  padding: '8px 12px',
                  fontSize: 13,
                  lineHeight: 1.65,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* 思考中动画 */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div
                style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: '#f0f5ff', color: '#1677ff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <RobotOutlined />
              </div>
              <div style={{ background: '#f8f9ff', borderRadius: '4px 12px 12px 12px', padding: '8px 14px' }}>
                <Spin size="small" />
                <Text style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>思考中…</Text>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <Divider style={{ margin: 0 }} />

        {/* 输入区 */}
        <div style={{ padding: '10px 12px', background: '#fff', display: 'flex', gap: 8 }}>
          <Input.TextArea
            autoSize={{ minRows: 1, maxRows: 4 }}
            placeholder="问一问今天的生产情况… (Enter 发送)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            style={{ fontSize: 13, resize: 'none', flex: 1 }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={sendMessage}
            loading={loading}
            disabled={!input.trim()}
            style={{ alignSelf: 'flex-end', height: 34 }}
          />
        </div>
        <div style={{ padding: '4px 12px 8px', color: '#bbb', fontSize: 11, textAlign: 'center' }}>
          仅供参考，数据基于当前租户 · 不保存对话记录
        </div>
      </Drawer>
    </>
  );
};

export default AiChatWidget;
