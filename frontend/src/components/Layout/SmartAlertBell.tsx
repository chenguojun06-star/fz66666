import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  RobotOutlined,
  SendOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Badge, Input, Spin } from 'antd';
import api, { ApiResult } from '../../utils/api';
import { intelligenceApi, sysNoticeApi } from '../../services/production/productionApi';
import { normalizeXiaoyunChatPayload } from '@/services/intelligence/xiaoyunChatAdapter';
import { buildXiaoyunPopupIntroMessage } from './xiaoyunPopupPresenter';
import { useAuth } from '../../utils/AuthContext';
import type { SysNotice } from '../../services/production/productionApi';
import XiaoyunInsightCard, { type XiaoyunInsightCardData } from '../common/XiaoyunInsightCard';

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
  decisionCards?: XiaoyunInsightCardData[];
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
  cards?: XiaoyunInsightCardData[];
}

// 建议词跟路径映射表（只保留纯导航类，AI能回答的问题统一走 askAi）
const SUGGESTION_NAV: Record<string, string> = {
  '整体情况怎么样？': '/dashboard',
  '有逾期订单吗？': '/production',
};

const choose = (seed: number, variants: string[]) => {
  if (!variants.length) return '';
  return variants[Math.abs(seed) % variants.length];
};

// 根据事件类型获取跳转路径
const getEventNav = (ev: UrgentEvent): string => {
  if (ev.type === 'overdue')   return `/production?orderNo=${ev.orderNo}`;
  if (ev.type === 'defective') return `/production/warehousing?orderNo=${ev.orderNo}`;
  if (ev.type === 'approval')  return '/finance/center?tab=factory';
  if (ev.type === 'material')  return '/warehouse/material';
  return '/dashboard';
};
// ─── localStorage 每日 dismiss 辅助 ─────────────────────────
const _sapDismissKey = () => `sap_dismissed_${new Date().toISOString().slice(0, 10)}`;
const loadDismissed = (): Set<string> => {
  try {
    const raw = localStorage.getItem(_sapDismissKey());
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
};
const saveDismissed = (ids: Set<string>) => {
  try { localStorage.setItem(_sapDismissKey(), JSON.stringify([...ids])); } catch { /* ok */ }
};

const _sapNoticeDismissKey = () => `sap_dismissed_notices_${new Date().toISOString().slice(0, 10)}`;
const loadDismissedNotices = (): Set<number> => {
  try {
    const raw = localStorage.getItem(_sapNoticeDismissKey());
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch { return new Set(); }
};
const saveDismissedNotices = (ids: Set<number>) => {
  try { localStorage.setItem(_sapNoticeDismissKey(), JSON.stringify([...ids])); } catch { /* ok */ }
};

// ─── 主组件 ─────────────────────────────────────────────────
const SmartAlertBell: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [events, setEvents] = useState<UrgentEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const introMessage = useMemo(() => buildXiaoyunPopupIntroMessage(brief, events), [brief, events]);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    { role: 'ai', content: introMessage.content, suggestions: introMessage.suggestions, cards: introMessage.cards },
  ]);
  const [fetchedToday, setFetchedToday] = useState('');
  const [myNotices, setMyNotices] = useState<SysNotice[]>([]);
  const [_myUnreadCount, setMyUnreadCount] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(loadDismissed);
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<Set<number>>(loadDismissedNotices);
  const aiChatEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // 过滤掉今天已消除的事件（隔天自动恢复检测）
  const visibleEvents = events.filter(ev => !dismissedIds.has(ev.id));
  // 过滤掉已消除的我的通知（内存状态，刷新页面后重新检测）
  const visibleNotices = myNotices.filter(n => !dismissedNoticeIds.has(n.id));

  // 徽章数 = 面板里还没被 × 关掉的可交互事件总数
  // 只统计 visibleEvents（已过 dismissedIds 过滤），关一条减一，全关归零
  // 不再加 overdueOrderCount / highRiskOrderCount：这两个是后端原始数字，
  // 面板里无对应删除按钮，会导致 badge 永远不归零（"关了信息但数字不消"的问题）
  // 通知不计入徽章（避免 30 条未读把计数顶到 99+）
  const alertCount = visibleEvents.length;

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
      const factoryId = (user as any)?.factoryId || undefined;
      // 仅管理员/老板/工厂账号才拉取公司/工厂级数据；普通员工（worker等）只看"我的通知"
      const isManagerLevel = !!(user as any)?.isSuperAdmin || !!(user as any)?.isTenantOwner
        || ['admin', '管理员', '管理'].some(k => ((user as any)?.role || '').toLowerCase().includes(k));
      if (!factoryId && !isManagerLevel) {
        setFetchedToday(today);
        return;
      }
      const [briefRes, eventsRes] = await Promise.allSettled([
        api.get('/dashboard/daily-brief', { signal: ac.signal, params: factoryId ? { factoryId } : undefined }) as Promise<ApiResult<BriefData>>,
        api.get('/dashboard/urgent-events', { signal: ac.signal, params: factoryId ? { factoryId } : undefined }) as Promise<ApiResult<UrgentEvent[]>>,
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
  }, [fetchedToday, brief, user]);

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
  }, []);

  // fetchedToday 清空后立即重拉
  useEffect(() => {
    if (!fetchedToday) fetchData();
  }, [fetchedToday, fetchData]);

  useEffect(() => {
    setAiMessages(prev => {
      if (prev.length !== 1 || prev[0]?.role !== 'ai') {
        return prev;
      }
      return [{
        role: 'ai',
        content: introMessage.content,
        suggestions: introMessage.suggestions,
        cards: introMessage.cards,
      }];
    });
  }, [introMessage]);

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

  // 消除单条我的通知（localStorage 每日持久化，隔天重新检测）
  const dismissNotice = useCallback((id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedNoticeIds(prev => {
      const next = new Set([...prev, id]);
      saveDismissedNotices(next);
      return next;
    });
  }, []);

  // 消除单条事件（当天不再显示，隔天重新检测）
  const dismissEvent = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }, []);

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
      const payload = normalizeXiaoyunChatPayload(await intelligenceApi.aiAdvisorChat(q));
      if (payload?.answer) {
        setAiMessages(prev => [...prev, {
          role: 'ai',
          content: payload.displayAnswer || payload.answer,
          suggestions: payload.suggestions || [],
          cards: payload.cards || [],
        }]);
      } else {
        setAiMessages(prev => [...prev, { role: 'ai', content: '这句我还没拿到足够上下文。你可以换成“先看哪几单最急”这种问法。' }]);
      }
    } catch {
      setAiMessages(prev => [...prev, { role: 'ai', content: '我这边暂时连不到分析服务，稍后再问一次就好。' }]);
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


            {/* ── 首要关注订单 ── */}
            {brief?.topPriorityOrder && !dismissedIds.has('topPriority') && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <AlertOutlined style={{ color: '#6d28d9' }} /> 首要关注
                  <span style={{ marginLeft: 6, fontSize: 10, color: '#999' }}>点 × 今日不再提醒</span>
                </div>
                <div
                className="sap-priority-card"
                onClick={() => goTo(`/production?orderNo=${brief.topPriorityOrder.orderNo}`)}
                style={{ cursor: 'pointer', position: 'relative' }}
                title="点击查看该订单"
              >
                  <button
                    className="sap-event-dismiss-btn"
                    style={{ position: 'absolute', top: 6, right: 6 }}
                    onClick={(e) => dismissEvent('topPriority', e)}
                    title="今日不再提醒（明天会重新检测）"
                  >
                    <CloseOutlined style={{ fontSize: 9 }} />
                  </button>
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
            {visibleEvents.length > 0 && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <ExclamationCircleOutlined style={{ color: '#ef4444' }} /> 待处理事项
                  <span style={{ marginLeft: 6, fontSize: 10, color: '#999' }}>点 × 今日不再提醒，明日自动重检</span>
                </div>
                {visibleEvents.slice(0, 6).map(ev => (
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
                    <button
                      className="sap-event-dismiss-btn"
                      onClick={(e) => dismissEvent(ev.id, e)}
                      title="今日不再提醒（明天会重新检测）"
                    >
                      <CloseOutlined style={{ fontSize: 9 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ── 智能建议 ── */}
            {brief?.suggestions && brief.suggestions.length > 0 && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <CheckCircleOutlined style={{ color: '#0284c7' }} /> 智能建议
                  <span style={{ marginLeft: 6, fontSize: 10, color: '#999' }}>点 × 今日不再提醒</span>
                </div>
                {brief.decisionCards && brief.decisionCards.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {brief.decisionCards.slice(0, 3).map((card, i) => dismissedIds.has(`decisionCard_${i}`) ? null : (
                      <div key={`${card.title}-${i}`} className="sap-dismissible" style={{ position: 'relative' }}>
                        <button
                          className="sap-event-dismiss-btn"
                          style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}
                          onClick={(e) => dismissEvent(`decisionCard_${i}`, e)}
                          title="今日不再提醒（明天会重新检测）"
                        >
                          <CloseOutlined style={{ fontSize: 9 }} />
                        </button>
                        <XiaoyunInsightCard
                          compact
                          onNavigate={goTo}
                          card={{
                            ...card,
                            source: card.source || '实时数据推演',
                            confidence: card.confidence || ((brief.overdueOrderCount || 0) + (brief.highRiskOrderCount || 0) > 0 ? '建议优先处理' : '可执行建议'),
                            summary: card.summary || choose((brief.overdueOrderCount || 0) * 11 + (brief.highRiskOrderCount || 0) * 7 + i, [
                              '有风险点，先处理影响最大的。',
                              '先做优先级收口，再展开细项。',
                              '先压关键风险，后续更顺。',
                            ]),
                            labels: {
                              summary: '现状',
                              painPoint: '关注点',
                              execute: '下一步',
                              evidence: '数据',
                              note: '补充',
                              ...card.labels,
                            },
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  brief.suggestions.slice(0, 3).map((s, i) => dismissedIds.has(`suggestion_${i}`) ? null : (
                    <div key={i} className="sap-suggestion" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>· {s}</span>
                      <button
                        className="sap-event-dismiss-btn"
                        style={{ opacity: 1 }}
                        onClick={(e) => dismissEvent(`suggestion_${i}`, e)}
                        title="今日不再提醒（明天会重新检测）"
                      >
                        <CloseOutlined style={{ fontSize: 9 }} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── 我的通知 ── */}
            {visibleNotices.length > 0 && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <span style={{ color: '#d46b08' }}>📤</span> 我的通知
                  {visibleNotices.filter(n => !n.isRead).length > 0 && (
                    <span style={{ marginLeft: 4, fontSize: 10, background: '#ffa940', color: '#fff', borderRadius: 8, padding: '0 5px' }}>
                      {visibleNotices.filter(n => !n.isRead).length} 未读
                    </span>
                  )}
                  <span style={{ marginLeft: 6, fontSize: 10, color: '#999' }}>点 × 关闭该条</span>
                </div>
                {visibleNotices.slice(0, 8).map(n => (
                  <div key={n.id} className="sap-notice-row"
                    style={{
                      background: n.isRead ? '#fafafa' : '#fff7e6',
                      borderLeft: `3px solid ${n.isRead ? '#ddd' : '#ffa940'}`,
                    }}
                    onClick={() => {
                      if (!n.isRead) {
                        sysNoticeApi.markRead(n.id).then(() => fetchMyNotices()).catch(() => {});
                      }
                    }}
                  >
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
                        className="sap-notice-read-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          sysNoticeApi.markRead(n.id).then(() => fetchMyNotices()).catch(() => {});
                          setDismissedNoticeIds(prev => {
                            const next = new Set([...prev, n.id]);
                            saveDismissedNotices(next);
                            return next;
                          });
                        }}
                      >
                        已读
                      </button>
                    )}
                    <button
                      className="sap-notice-dismiss-btn"
                      onClick={(e) => dismissNotice(n.id, e)}
                      title="关闭该通知"
                    >
                      <CloseOutlined style={{ fontSize: 9 }} />
                    </button>
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
                      {msg.role === 'ai' && msg.cards && msg.cards.length > 0 && (
                        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                          {msg.cards.map((card, cardIndex) => (
                            <XiaoyunInsightCard
                              key={`${card.title}-${cardIndex}`}
                              compact
                              card={card}
                              onNavigate={goTo}
                            />
                          ))}
                        </div>
                      )}
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
                  placeholder="直接问风险、瓶颈、进度或处理动作"
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

export default SmartAlertBell;
