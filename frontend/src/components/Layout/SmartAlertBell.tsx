import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  InboxOutlined,
  RobotOutlined,
  ScanOutlined,
  SendOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Badge, Input, Spin } from 'antd';
import api, { ApiResult } from '../../utils/api';
import { intelligenceApi, sysNoticeApi } from '../../services/production/productionApi';
import type { SysNotice } from '../../services/production/productionApi';

// ─── 数据类型 ────────────────────────────────────────────────
interface TopPriorityOrder {
  orderNo: string;
  styleNo: string;
  factoryName: string;
  progress: number;
  daysLeft: number;
}

interface BriefData {
  date: string;
  yesterdayWarehousingCount: number;
  yesterdayWarehousingQuantity: number;
  todayScanCount: number;
  overdueOrderCount: number;
  highRiskOrderCount: number;
  topPriorityOrder?: TopPriorityOrder;
  suggestions: string[];
}

interface UrgentEvent {
  id: string;
  type: 'overdue' | 'defective' | 'approval' | 'material';
  title: string;
  orderNo: string;
  time: string;
}

interface AiMessage {
  role: 'user' | 'ai';
  content: string;
  suggestions?: string[];
}

const AI_WELCOME = '👋 我是内置AI助手，可回答整体情况、逾期预警、工厂进度等问题。';
const AI_DEFAULT_SUGGESTIONS = ['整体情况怎么样？', '有逾期订单吗？', '工厂进度怎么样？', '有瓶颈吗？'];
// 建议词跟路径映射表（只保留纯导航类，AI能回答的问题统一走 askAi）
const SUGGESTION_NAV: Record<string, string> = {
  '整体情况怎么样？': '/dashboard',
  '有逾期订单吗？': '/production',
};

// 根据事件类型获取跳转路径
const getEventNav = (ev: UrgentEvent): string => {
  if (ev.type === 'overdue')   return `/production?orderNo=${ev.orderNo}`;
  if (ev.type === 'defective') return `/production/warehousing?orderNo=${ev.orderNo}`;
  if (ev.type === 'approval')  return '/finance/center?tab=factory';
  if (ev.type === 'material')  return '/warehouse/material';
  return '/dashboard';
};
// ─── 主组件 ─────────────────────────────────────────────────
const SmartAlertBell: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [events, setEvents] = useState<UrgentEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    { role: 'ai', content: AI_WELCOME, suggestions: AI_DEFAULT_SUGGESTIONS },
  ]);
  const [fetchedToday, setFetchedToday] = useState('');
  const [myNotices, setMyNotices] = useState<SysNotice[]>([]);
  const [myUnreadCount, setMyUnreadCount] = useState(0);
  const aiChatEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // 总预警数 = 逾期 + 高风险 + 紧急事件 + 个人未读通知
  const alertCount =
    (brief?.overdueOrderCount ?? 0) +
    (brief?.highRiskOrderCount ?? 0) +
    events.length +
    myUnreadCount;

  // 拉取「我的通知」
  const fetchMyNotices = useCallback(async () => {
    try {
      const [noticesRes, countRes] = await Promise.allSettled([
        sysNoticeApi.getMyNotices() as Promise<any>,
        sysNoticeApi.getUnreadCount() as Promise<any>,
      ]);
      if (noticesRes.status === 'fulfilled' && noticesRes.value?.data) {
        setMyNotices(noticesRes.value.data);
      }
      if (countRes.status === 'fulfilled' && countRes.value?.data?.count !== undefined) {
        setMyUnreadCount(Number(countRes.value.data.count));
      }
    } catch { /* ignore */ }
  }, []);

  // ── 拉取数据（每天只拉一次，展开时也重拉）──
  const abortRef = useRef<AbortController | null>(null);
  const fetchData = useCallback(async () => {
    const today = new Date().toDateString();
    if (fetchedToday === today && brief) return; // 今天已拉过
    // 取消前一个未完成请求，避免竞态
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const [briefRes, eventsRes] = await Promise.allSettled([
        api.get('/dashboard/daily-brief', { signal: ac.signal }) as Promise<ApiResult<BriefData>>,
        api.get('/dashboard/urgent-events', { signal: ac.signal }) as Promise<ApiResult<UrgentEvent[]>>,
      ]);
      if (ac.signal.aborted) return;
      if (briefRes.status === 'fulfilled' && briefRes.value.code === 200) {
        setBrief(briefRes.value.data ?? null);
      }
      if (eventsRes.status === 'fulfilled' && eventsRes.value.code === 200) {
        setEvents(eventsRes.value.data ?? []);
      }
      setFetchedToday(today);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [fetchedToday, brief]);

  // 每 10 分钟后台静默刷新；每 60 秒轮询我的通知
  useEffect(() => {
    fetchData();
    fetchMyNotices();
    const timer = setInterval(() => setFetchedToday(''), 10 * 60 * 1000);
    const noticeTimer = setInterval(fetchMyNotices, 60 * 1000);
    return () => {
      clearInterval(timer);
      clearInterval(noticeTimer);
      abortRef.current?.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fetchedToday 清空后立即重拉
  useEffect(() => {
    if (!fetchedToday) fetchData();
  }, [fetchedToday, fetchData]);

  // 点击面板外关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Escape 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // 自动滚到底
  useEffect(() => {
    if (open) aiChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, open]);

  // 跳转辅助：关闭面板并导航
  const goTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  // 点击按钮时先拉数据
  const handleToggle = () => {
    if (!open) fetchData();
    setOpen(v => !v);
  };

  // AI 问答 — 使用系统内置 Intelligence API，无需外部 Key
  const askAi = async (question?: string) => {
    const q = (question ?? aiInput).trim();
    if (!q || aiLoading) return;
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', content: q }]);
    setAiLoading(true);
    try {
      const res = await intelligenceApi.aiAdvisorChat(q) as any;
      const d = res?.data ?? res ?? null;
      if (d && d.answer) {
        setAiMessages(prev => [...prev, {
          role: 'ai',
          content: d.answer,
          suggestions: [],
        }]);
      } else {
        setAiMessages(prev => [...prev, { role: 'ai', content: '抱歉，暂时无法理解该问题。' }]);
      }
    } catch {
      setAiMessages(prev => [...prev, { role: 'ai', content: 'AI 暂时不可用，请稍后再试。' }]);
    } finally {
      setAiLoading(false);
    }
  };

  // ── 渲染 ──────────────────────────────────────────────────
  const riskLevel = (brief?.overdueOrderCount ?? 0) > 0 ? 'high'
    : (brief?.highRiskOrderCount ?? 0) > 0 ? 'mid'
    : 'ok';

  const dotColor = riskLevel === 'high' ? '#ef4444'
    : riskLevel === 'mid' ? '#f59e0b'
    : '#22c55e';

  return (
    <div className="smart-alert-wrap">
      {/* ── 按钮 ── */}
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={`smart-alert-btn${open ? ' open' : ''}`}
        title="今日跟踪预警"
      >
        <span className="smart-alert-btn-icon">
          <ThunderboltOutlined style={{ fontSize: 15 }} />
          {alertCount > 0 && (
            <span className="smart-alert-dot" style={{ background: dotColor }} />
          )}
        </span>
        <span className="smart-alert-btn-label">
          <span className="smart-alert-btn-sub">AI助手</span>
          <span className="smart-alert-btn-main">今日预警</span>
        </span>
        {alertCount > 0 && (
          <Badge
            count={alertCount}
            size="small"
            style={{ marginLeft: 4, background: dotColor, boxShadow: 'none' }}
          />
        )}
      </button>

      {/* ── 下滑面板 ── */}
      <div
        ref={panelRef}
        className={`smart-alert-panel${open ? ' visible' : ''}`}
      >
        {/* 面板头 */}
        <div className="sap-header">
          <div className="sap-title">
            <ThunderboltOutlined style={{ color: '#6d28d9' }} />
            <span>今日跟踪预警</span>
            {brief?.date && <span className="sap-date">{brief.date}</span>}
          </div>
          <button className="sap-close" onClick={() => setOpen(false)}>
            <CloseOutlined style={{ fontSize: 12 }} />
          </button>
        </div>

        {loading && (
          <div className="sap-loading"><Spin size="small" /><span>加载中…</span></div>
        )}

        {!loading && (
          <>
            {/* ── 数字统计行 ── */}
            {brief && (
              <div className="sap-stats">
                <StatCell
                  icon={<ExclamationCircleOutlined />}
                  label="逾期订单"
                  value={brief.overdueOrderCount}
                  color="#ef4444"
                  alert={brief.overdueOrderCount > 0}
                />
                <StatCell
                  icon={<WarningOutlined />}
                  label="高风险"
                  value={brief.highRiskOrderCount}
                  color="#f59e0b"
                  alert={brief.highRiskOrderCount > 0}
                />
                <StatCell
                  icon={<InboxOutlined />}
                  label="昨日入库"
                  value={`${brief.yesterdayWarehousingCount}单`}
                  color="#6d28d9"
                />
                <StatCell
                  icon={<ScanOutlined />}
                  label="今日扫码"
                  value={`${brief.todayScanCount}次`}
                  color="#0284c7"
                />
              </div>
            )}

            {/* ── 首要关注订单 ── */}
            {brief?.topPriorityOrder && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <AlertOutlined style={{ color: '#6d28d9' }} /> 首要关注
                </div>
                <div
                className="sap-priority-card"
                onClick={() => goTo(`/production?orderNo=${brief.topPriorityOrder.orderNo}`)}
                style={{ cursor: 'pointer' }}
                title="点击查看该订单"
              >
                  <div className="sap-priority-row">
                    <span className="sap-priority-no">{brief.topPriorityOrder.orderNo}</span>
                    <span className="sap-priority-factory">{brief.topPriorityOrder.factoryName}</span>
                  </div>
                  <div className="sap-priority-bar-wrap">
                    <div
                      className="sap-priority-bar"
                      style={{ width: `${brief.topPriorityOrder.progress}%` }}
                    />
                    <span className="sap-priority-pct">{brief.topPriorityOrder.progress}%</span>
                    <span
                      className="sap-priority-days"
                      style={{ color: brief.topPriorityOrder.daysLeft <= 3 ? '#ef4444' : '#888' }}
                    >
                      剩 {brief.topPriorityOrder.daysLeft} 天
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── 紧急事件列表 ── */}
            {events.length > 0 && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <ExclamationCircleOutlined style={{ color: '#ef4444' }} /> 待处理事项
                </div>
                {events.slice(0, 4).map(ev => (
                  <div
                    key={ev.id}
                    className="sap-event-row"
                    onClick={() => goTo(getEventNav(ev))}
                    style={{ cursor: 'pointer' }}
                    title="点击前往处理"
                  >
                    <span className="sap-event-dot" />
                    <span className="sap-event-title">{ev.title}</span>
                    <span className="sap-event-time">{ev.time}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── 智能建议 ── */}
            {brief?.suggestions && brief.suggestions.length > 0 && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <CheckCircleOutlined style={{ color: '#0284c7' }} /> 智能建议
                </div>
                {brief.suggestions.slice(0, 3).map((s, i) => (
                  <div key={i} className="sap-suggestion">· {s}</div>
                ))}
              </div>
            )}

            {/* ── 我的通知 ── */}
            {myNotices.length > 0 && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <span style={{ color: '#d46b08' }}>📤</span> 我的通知
                  {myUnreadCount > 0 && (
                    <span style={{ marginLeft: 4, fontSize: 10, background: '#ffa940', color: '#fff', borderRadius: 8, padding: '0 5px' }}>
                      {myUnreadCount} 未读
                    </span>
                  )}
                </div>
                {myNotices.slice(0, 5).map(n => (
                  <div key={n.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 6,
                    padding: '5px 6px', marginBottom: 2,
                    background: n.isRead ? '#fafafa' : '#fff7e6',
                    borderRadius: 5, borderLeft: `3px solid ${n.isRead ? '#ddd' : '#ffa940'}`,
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    if (!n.isRead) {
                      sysNoticeApi.markRead(n.id).then(() => fetchMyNotices()).catch(() => {});
                    }
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: n.isRead ? 400 : 600, color: '#333', lineHeight: 1.4 }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>
                        {n.fromName} · {n.createdAt?.slice(5, 16)}
                      </div>
                    </div>
                    {!n.isRead && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          sysNoticeApi.markRead(n.id).then(() => fetchMyNotices()).catch(() => {});
                        }}
                        style={{
                          flexShrink: 0, fontSize: 10, padding: '1px 5px', cursor: 'pointer',
                          background: '#fff', border: '1px solid #ffa940', borderRadius: 4,
                          color: '#d46b08',
                        }}
                      >
                        已读
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

          {/* ── AI 助手区 —— 使用系统内置 Intelligence API，无需外部 Key ── */}
            <div className="sap-ai-zone">
              <div className="sap-ai-label">
                <RobotOutlined style={{ color: '#6d28d9', marginRight: 4 }} />
                <span>AI 跟单助手（系统内置）</span>
              </div>
              {/* 对话历史 */}
              <div className="sap-ai-chat-history">
                {aiMessages.map((msg, i) => (
                  <div key={i} className={`sap-ai-msg sap-ai-msg-${msg.role}`}>
                    {msg.role === 'ai' && (
                      <span className="sap-ai-msg-avatar"><RobotOutlined /></span>
                    )}
                    <div className="sap-ai-msg-bubble">
                      <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                      {/* 建议词 */}
                      {msg.role === 'ai' && msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="sap-ai-suggestions">
                          {msg.suggestions.map((s, si) => (
                            <button
                              key={si}
                              className="sap-ai-suggestion-btn"
                              onClick={() => {
                                const navPath = SUGGESTION_NAV[s];
                                if (navPath) {
                                  goTo(navPath);
                                } else {
                                  askAi(s);
                                }
                              }}
                              disabled={aiLoading}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="sap-ai-msg sap-ai-msg-ai">
                    <span className="sap-ai-msg-avatar"><RobotOutlined /></span>
                    <div className="sap-ai-msg-bubble sap-ai-thinking">
                      <Spin size="small" style={{ marginRight: 6 }} /><span>思考中…</span>
                    </div>
                  </div>
                )}
                <div ref={aiChatEndRef} />
              </div>
              {/* 输入框 */}
              <div className="sap-ai-input-row">
                <Input
                  size="small"
                  placeholder="问今日风险、订单进度…"
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onPressEnter={() => askAi()}
                  disabled={aiLoading}
                  style={{ fontSize: 12, flex: 1, minWidth: 0, width: '100%' }}
                />
                <button
                  className="sap-ai-send"
                  onClick={() => askAi()}
                  disabled={!aiInput.trim() || aiLoading}
                >
                  <SendOutlined style={{ fontSize: 12 }} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── 小统计格子 ───────────────────────────────────────────
const StatCell: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  alert?: boolean;
  onClick?: () => void;
}> = ({ icon, label, value, color, alert, onClick }) => (
  <div
    className={`sap-stat-cell${alert ? ' alert' : ''}${onClick ? ' clickable' : ''}`}
    style={{ '--sap-cell-color': color, cursor: onClick ? 'pointer' : 'default' } as React.CSSProperties}
    onClick={onClick}
    title={onClick ? '点击查看详情' : undefined}
  >
    <span className="sap-stat-icon" style={{ color }}>{icon}</span>
    <span className="sap-stat-val" style={{ color: alert ? color : '#111' }}>{value}</span>
    <span className="sap-stat-label">{label}</span>
  </div>
);

export default SmartAlertBell;
