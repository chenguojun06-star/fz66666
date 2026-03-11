import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Input, Spin, Tag, message } from 'antd';
import {
  RobotOutlined,
  SendOutlined,
  CloseOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { intelligenceApi as executionApi } from '@/services/intelligenceApi';
import { intelligenceApi, type NlQueryResponse } from '@/services/intelligence/intelligenceApi';
import './FloatingAiChat.css';

interface ChatMsg {
  role: 'user' | 'ai';
  content: string;
  suggestions?: string[];
  actions?: ActionBtn[];
}

interface ActionBtn {
  label: string;
  action: string;
  targetId?: string;
  reason?: string;
}

// 从 AI 响应中提取可执行动作按钮
function extractActions(intent: string, data: Record<string, unknown>): ActionBtn[] {
  const items = (
    (data?.orders ?? data?.items ?? data?.overdueOrders ?? data?.riskOrders ?? []) as any[]
  ).slice(0, 3);

  if (!items.length) return [];

  if (intent === 'overdue') {
    return items.map((o: any) => ({
      label: `催单 ${o.orderNo ?? o.id ?? ''}`,
      action: 'order:expedite',
      targetId: String(o.id ?? o.orderId ?? ''),
      reason: '逾期催单',
    })).filter(a => a.targetId);
  }
  if (intent === 'risk') {
    return items.map((o: any) => ({
      label: `暂停 ${o.orderNo ?? o.id ?? ''}`,
      action: 'order:hold',
      targetId: String(o.id ?? o.orderId ?? ''),
      reason: '高风险暂停评估',
    })).filter(a => a.targetId);
  }
  return [];
}

const QUICK_QUESTIONS = [
  '哪些订单快逾期了？',
  '今天有哪些生产异常？',
  '各工厂当前产能？',
  '高风险订单有哪些？',
];

const FloatingAiChat: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);

  // 加载待审批命令数量作为徽标
  useEffect(() => {
    executionApi.getPendingCommands()
      .then(r => setPendingCount(r?.totalCount ?? 0))
      .catch(() => {});
    const t = setInterval(() => {
      executionApi.getPendingCommands()
        .then(r => setPendingCount(r?.totalCount ?? 0))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  // 打开时自动聚焦输入框
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open]);

  // 消息更新时滚到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const sendQuestion = useCallback(async (q: string) => {
    const text = q.trim();
    if (!text || loading) return;
    setInput('');
    setMsgs(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const res = await intelligenceApi.nlQuery({ question: text });
      // api 拦截器已解包：res = { code, data: NlQueryResponse }
      const nlr: NlQueryResponse = (res as any).data ?? res;
      const actions = extractActions(nlr.intent, nlr.data ?? {});
      setMsgs(prev => [
        ...prev,
        {
          role: 'ai',
          content: nlr.answer ?? '暂无回答',
          suggestions: nlr.suggestions,
          actions,
        },
      ]);
    } catch {
      setMsgs(prev => [
        ...prev,
        { role: 'ai', content: '暂时无法处理，请稍后再试。' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const handleAction = async (btn: ActionBtn) => {
    try {
      await executionApi.executeCommand({
        action: btn.action,
        targetId: btn.targetId,
        reason: btn.reason,
        source: 'chat',
        requiresApproval: true,
      });
      message.success(`「${btn.label}」已提交审批`);
    } catch {
      message.error('提交失败，请稍后重试');
    }
  };

  // ── 悬浮按钮 (关闭状态) ──
  if (!open) {
    return (
      <div className="fai-fab" onClick={() => setOpen(true)} title="AI助手 — 问我任何问题">
        <RobotOutlined className="fai-fab-icon" />
        {pendingCount > 0 && (
          <span className="fai-fab-badge">{pendingCount > 99 ? '99+' : pendingCount}</span>
        )}
      </div>
    );
  }

  // ── 展开面板 ──
  return (
    <div className="fai-panel">
      {/* 标题栏 */}
      <div className="fai-header">
        <RobotOutlined className="fai-header-icon" />
        <span className="fai-header-title">AI助手</span>
        {pendingCount > 0 && (
          <Tag color="orange" className="fai-pending-tag">{pendingCount} 待审批</Tag>
        )}
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          className="fai-close-btn"
          onClick={() => setOpen(false)}
        />
      </div>

      {/* 消息区 */}
      <div className="fai-body">
        {msgs.length === 0 && (
          <div className="fai-welcome">
            <p className="fai-welcome-text">你好！我是 AI 助手，可以查询订单、生产进度、异常预警，或帮你执行操作。</p>
            <div className="fai-quick-btns">
              {QUICK_QUESTIONS.map(q => (
                <button key={q} className="fai-quick-btn" onClick={() => sendQuestion(q)}>
                  <QuestionCircleOutlined style={{ marginRight: 4 }} />{q}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={`fai-msg fai-msg--${m.role}`}>
            {m.role === 'ai' && <RobotOutlined className="fai-ai-avatar" />}
            <div className="fai-bubble">
              <pre className="fai-text">{m.content}</pre>
              {/* 建议问题 */}
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="fai-suggestions">
                  {m.suggestions.slice(0, 3).map(s => (
                    <button key={s} className="fai-suggest-btn" onClick={() => sendQuestion(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {/* 可执行操作按钮 */}
              {m.actions && m.actions.length > 0 && (
                <div className="fai-actions">
                  {m.actions.map(a => (
                    <Button
                      key={a.label}
                      size="small"
                      type="primary"
                      ghost
                      className="fai-action-btn"
                      onClick={() => handleAction(a)}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="fai-msg fai-msg--ai">
            <RobotOutlined className="fai-ai-avatar" />
            <div className="fai-bubble fai-bubble--loading">
              <Spin size="small" />
              <span style={{ marginLeft: 8, color: '#888' }}>正在思考…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="fai-footer">
        <Input
          ref={inputRef}
          className="fai-input"
          placeholder="问我任何问题，例如：有哪些高风险订单？"
          value={input}
          onChange={e => setInput(e.target.value)}
          onPressEnter={() => sendQuestion(input)}
          disabled={loading}
          suffix={
            <Button
              type="text"
              size="small"
              icon={<SendOutlined />}
              disabled={!input.trim() || loading}
              onClick={() => sendQuestion(input)}
            />
          }
        />
      </div>
    </div>
  );
};

export default FloatingAiChat;
