import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Badge } from 'antd';
import api, { ApiResult } from '../../utils/api';
import { sysNoticeApi, urgeApi } from '../../services/production/productionApi';
import { useUser } from '../../utils/AuthContext';
import type { SysNotice } from '../../services/production/productionApi';
import { useAiPatrol, RISK_TYPE_LABELS } from '@/modules/production/pages/Production/List/hooks/useAiPatrol';
import XiaoyunCloudAvatar from '../common/XiaoyunCloudAvatar';
import XiaoyunInsightCard, { type XiaoyunInsightCardData } from '../common/XiaoyunInsightCard';

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
const NOTICE_POLL_INTERVAL = 60_000;
const MAX_BACKOFF = 5 * 60_000;

const SmartAlertBell: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [events, setEvents] = useState<UrgentEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchedToday, setFetchedToday] = useState('');
  const [myNotices, setMyNotices] = useState<SysNotice[]>([]);
  const [_myUnreadCount, setMyUnreadCount] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(loadDismissed);
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<Set<number>>(loadDismissedNotices);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const fetchedTodayRef = useRef(fetchedToday);
  fetchedTodayRef.current = fetchedToday;
  const briefRef = useRef(brief);
  briefRef.current = brief;
  const userRef = useRef(user);
  userRef.current = user;

  const { patrolSummary, fetchForOrders: fetchPatrolRiskData } = useAiPatrol();

  const visibleEvents = useMemo(() => events.filter(ev => !dismissedIds.has(ev.id)), [events, dismissedIds]);
  const visibleNotices = useMemo(() => myNotices.filter(n => !dismissedNoticeIds.has(n.id)), [myNotices, dismissedNoticeIds]);

  const alertCount = visibleEvents.length + (patrolSummary?.pendingCount ?? 0);
  const unreadNoticeCount = visibleNotices.filter(n => !n.isRead).length;

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
      const bothFailed = noticesRes.status === 'rejected' && countRes.status === 'rejected';
      return bothFailed ? 'failed' : 'ok';
    } catch {
      return 'failed';
    }
  }, []);

  const abortRef = useRef<AbortController | null>(null);
  const fetchData = useCallback(async () => {
    const today = new Date().toDateString();
    if (fetchedTodayRef.current === today && briefRef.current) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const u = userRef.current;
      const factoryId = (u as any)?.factoryId || undefined;
      const isManagerLevel = !!(u as any)?.isSuperAdmin || !!(u as any)?.isTenantOwner
        || ['admin', '管理员', '管理'].some(k => ((u as any)?.role || '').toLowerCase().includes(k));
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
  }, []);

  const fetchPatrolData = useCallback(async () => {
    try {
      await fetchPatrolRiskData([]);
    } catch { /* silent fail */ }
  }, [fetchPatrolRiskData]);

  const noticeFailRef = useRef(0);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleNoticePoll = useCallback(() => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    const delay = noticeFailRef.current === 0
      ? NOTICE_POLL_INTERVAL
      : Math.min(NOTICE_POLL_INTERVAL * Math.pow(2, noticeFailRef.current - 1), MAX_BACKOFF);
    noticeTimerRef.current = setTimeout(async () => {
      const result = await fetchMyNotices();
      if (result === 'failed') {
        noticeFailRef.current += 1;
      } else {
        noticeFailRef.current = 0;
      }
      scheduleNoticePoll();
    }, delay);
  }, [fetchMyNotices]);

  useEffect(() => {
    fetchData();
    fetchPatrolData();
    void fetchMyNotices().then((result) => {
      if (result === 'failed') noticeFailRef.current += 1;
      else noticeFailRef.current = 0;
      scheduleNoticePoll();
    });
    const timer = setInterval(() => setFetchedToday(''), 10 * 60 * 1000);
    return () => {
      clearInterval(timer);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      abortRef.current?.abort();
    };
  }, [fetchData, fetchMyNotices, fetchPatrolData, scheduleNoticePoll]);

  useEffect(() => {
    if (!fetchedToday) { fetchData(); fetchPatrolData(); }
  }, [fetchedToday, fetchData, fetchPatrolData]);

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

  // 消除单条我的通知（localStorage 每日持久化，隔天重新检测）
  const dismissNotice = useCallback((id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedNoticeIds(prev => {
      const next = new Set([...prev, id]);
      saveDismissedNotices(next);
      return next;
    });
  }, []);

  const markAllNoticesRead = useCallback(() => {
    const unreadIds = myNotices.filter(n => !n.isRead).map(n => n.id);
    if (unreadIds.length === 0) return;
    Promise.allSettled(unreadIds.map(id => sysNoticeApi.markRead(id)))
      .then(() => fetchMyNotices())
      .catch(() => {});
    setDismissedNoticeIds(prev => {
      const next = new Set([...prev, ...unreadIds]);
      saveDismissedNotices(next);
      return next;
    });
  }, [myNotices, fetchMyNotices]);

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
    if (!open) { fetchData(); fetchPatrolData(); }
    setOpen(v => !v);
  };

  // ── 渲染 ──────────────────────────────────────────────────
  const patrolSeverityColor = (severity: string) => {
    if (severity === 'HIGH') return '#cf1322';
    if (severity === 'MEDIUM') return '#fa8c16';
    return '#faad14';
  };

  const riskLevel = (brief?.overdueOrderCount ?? 0) > 0 || (patrolSummary?.highRiskPending ?? 0) > 0 ? 'high'
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
          <div className="sap-loading">
            <XiaoyunCloudAvatar size={34} active loading />
            <span>小云正在整理提醒，请稍等一下…</span>
          </div>
        )}

        {!loading && (
          <div className="sap-body-scroll">

            {/* ── AI 巡检简报 ── */}
            {patrolSummary && (patrolSummary.autoExecutedToday > 0 || patrolSummary.recentActions.length > 0) && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <RobotOutlined style={{ color: '#722ed1' }} /> AI巡检简报
                  {patrolSummary.autoExecutedToday > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#722ed1', background: '#f9f0ff', borderRadius: 10, padding: '1px 8px' }}>
                      今日自动执行 {patrolSummary.autoExecutedToday} 次
                    </span>
                  )}
                  {patrolSummary.highRiskPending > 0 && (
                    <Badge count={patrolSummary.highRiskPending} size="small"
                      style={{ marginLeft: 8, background: '#cf1322', boxShadow: 'none' }} />
                  )}
                </div>
                {patrolSummary.recentActions.slice(0, 5).map((action, idx) => (
                  <div key={idx} className="sap-event-row" style={{ cursor: 'default' }}>
                    <span className="sap-event-dot"
                      style={{ background: patrolSeverityColor(action.issueSeverity) }} />
                    <span className="sap-event-title">
                      {RISK_TYPE_LABELS[action.issueType] || action.issueType}: {action.detectedIssue}
                    </span>
                    <span style={{
                      fontSize: 11,
                      color: action.status === 'PENDING' ? '#fa8c16' : '#722ed1',
                      marginLeft: 'auto',
                      flexShrink: 0,
                    }}>
                      {action.status === 'PENDING' ? '待处理' : '已执行'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ── 首要关注订单 ── */}
            {brief?.topPriorityOrder && !dismissedIds.has('topPriority') && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <AlertOutlined style={{ color: '#6d28d9' }} /> 首要关注
                  <span style={{ marginLeft: 6, fontSize: 14, color: 'var(--color-text-tertiary)' }}>点 × 今日不再提醒</span>
                </div>
                <div
                className="sap-priority-card"
                onClick={() => goTo(`/production?orderNo=${brief.topPriorityOrder?.orderNo ?? ''}`)}
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
                  <span style={{ marginLeft: 6, fontSize: 14, color: 'var(--color-text-tertiary)' }}>点 × 今日不再提醒，明日自动重检</span>
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

            {/* ── 提醒建议 ── */}
            {brief?.suggestions && brief.suggestions.length > 0 && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <CheckCircleOutlined style={{ color: '#0284c7' }} /> 提醒建议
                  <span style={{ marginLeft: 6, fontSize: 14, color: 'var(--color-text-tertiary)' }}>点 × 今日不再提醒</span>
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
                  <span style={{ color: '#d46b08' }}></span> 我的通知
                  {unreadNoticeCount > 0 && (
                    <span style={{ marginLeft: 4, fontSize: 11, background: '#ffa940', color: '#fff', borderRadius: 10, padding: '1px 8px' }}>
                      {unreadNoticeCount} 未读
                    </span>
                  )}
                  {unreadNoticeCount > 1 && (
                    <button
                      className="sap-mark-all-read-btn"
                      onClick={(e) => { e.stopPropagation(); markAllNoticesRead(); }}
                      title="一键全部已读"
                    >
                      全部已读
                    </button>
                  )}
                </div>
                {visibleNotices.slice(0, 8).map(n => (
                  <div key={n.id} className="sap-notice-row"
                    style={{
                      background: n.isRead ? '#fafafa' : '#fff7e6',
                      borderLeft: `3px solid ${n.isRead ? '#ddd' : n.actionType === 'urge_order' ? '#cf1322' : '#ffa940'}`,
                    }}
                    onClick={() => {
                      if (!n.isRead) {
                        sysNoticeApi.markRead(n.id).then(() => fetchMyNotices()).catch((err) => { console.warn('[SmartAlert] 标记已读失败:', err?.message || err); });
                      }
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: n.isRead ? 400 : 600, color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: 14, color: '#888', marginTop: 1 }}>
                        {n.fromName} · {n.createdAt?.slice(5, 16)}
                      </div>
                      {n.actionType === 'urge_order' && n.urgeRecordId && !n.isRead && (
                        <UrgeReplyInline
                          urgeRecordId={n.urgeRecordId}
                          orderNo={n.orderNo}
                          onReplied={() => {
                            sysNoticeApi.markRead(n.id).then(() => fetchMyNotices()).catch(() => {});
                            setDismissedNoticeIds(prev => {
                              const next = new Set([...prev, n.id]);
                              saveDismissedNotices(next);
                              return next;
                            });
                          }}
                        />
                      )}
                    </div>
                    {!n.isRead && (
                      <button
                        className="sap-notice-read-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          sysNoticeApi.markRead(n.id).then(() => fetchMyNotices()).catch((err) => { console.warn('[SmartAlert] 标记已读失败:', err?.message || err); });
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

          </div>
        )}
      </div>
    </div>
  );
};

// ─── 小统计格子 ───────────────────────────────────────────

const UrgeReplyInline: React.FC<{
  urgeRecordId: string;
  orderNo: string;
  onReplied: () => void;
}> = ({ urgeRecordId, orderNo, onReplied }) => {
  const [replyContent, setReplyContent] = React.useState('');
  const [expectedShipDate, setExpectedShipDate] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = async () => {
    if (!replyContent.trim() && !expectedShipDate) return;
    setSubmitting(true);
    try {
      await urgeApi.reply(urgeRecordId, replyContent, expectedShipDate || undefined);
      setSubmitted(true);
      onReplied();
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ fontSize: 12, color: '#389e0d', marginTop: 4 }}>
        ✅ 已回复
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
        <input
          type="date"
          value={expectedShipDate}
          onChange={(e) => setExpectedShipDate(e.target.value)}
          style={{ fontSize: 12, padding: '2px 4px', border: '1px solid #d9d9d9', borderRadius: 4, width: 130 }}
          placeholder="预计出货日"
        />
        <input
          type="text"
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          placeholder="回复备注..."
          style={{ fontSize: 12, padding: '2px 4px', border: '1px solid #d9d9d9', borderRadius: 4, flex: 1, minWidth: 80 }}
        />
      </div>
      <button
        onClick={() => void handleSubmit()}
        disabled={submitting || (!replyContent.trim() && !expectedShipDate)}
        style={{
          fontSize: 11,
          padding: '2px 8px',
          background: '#cf1322',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? '提交中...' : '回复催单'}
      </button>
    </div>
  );
};

export default SmartAlertBell;
