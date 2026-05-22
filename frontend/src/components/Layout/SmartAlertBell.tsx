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
import { sysNoticeApi } from '../../services/production/productionApi';
import { useUser } from '../../utils/AuthContext';
import { getPatrolSummary, type PatrolSummary } from '../../services/intelligenceApi';
import type { SysNotice } from '../../services/production/productionApi';
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

const getEventNav = (ev: UrgentEvent): string => {
  if (ev.type === 'overdue')   return `/production?orderNo=${ev.orderNo}`;
  if (ev.type === 'defective') return `/production/warehousing?orderNo=${ev.orderNo}`;
  if (ev.type === 'approval')  return '/finance/center?tab=factory';
  if (ev.type === 'material')  return '/warehouse/material';
  return '/dashboard';
};
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

const NOTICE_POLL_INTERVAL = 60_000;
const MAX_BACKOFF = 5 * 60_000;

const RISK_TYPE_LABELS: Record<string, string> = {
  DEADLINE_RISK: '浜ゆ湡椋庨櫓',
  FACTORY_SILENCE: '宸ュ巶娌夐粯',
  QUALITY_SPIKE: '璐ㄩ噺寮傚父',
  CORRELATED_RISK: '澶氶噸椋庨櫓',
};

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
  const [patrolSummary, setPatrolSummary] = useState<PatrolSummary | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const fetchedTodayRef = useRef(fetchedToday);
  fetchedTodayRef.current = fetchedToday;
  const briefRef = useRef(brief);
  briefRef.current = brief;
  const userRef = useRef(user);
  userRef.current = user;

  const visibleEvents = useMemo(() => events.filter(ev => !dismissedIds.has(ev.id)), [events, dismissedIds]);
  const visibleNotices = useMemo(() => myNotices.filter(n => !dismissedNoticeIds.has(n.id)), [myNotices, dismissedNoticeIds]);

  const patrolAlertCount = (patrolSummary?.pendingCount ?? 0) + (patrolSummary?.highRiskPending ?? 0);
  const alertCount = visibleEvents.length + patrolAlertCount;

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

  const fetchPatrolData = useCallback(async () => {
    try {
      const summary = await getPatrolSummary();
      if (summary) setPatrolSummary(summary);
    } catch {
      // silently fail
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
        || ['admin', '绠＄悊鍛?, '绠＄悊'].some(k => ((u as any)?.role || '').toLowerCase().includes(k));
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
  }, [fetchData, fetchMyNotices, scheduleNoticePoll, fetchPatrolData]);

  useEffect(() => {
    if (!fetchedToday) fetchData();
  }, [fetchedToday, fetchData]);

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const dismissNotice = useCallback((id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedNoticeIds(prev => {
      const next = new Set([...prev, id]);
      saveDismissedNotices(next);
      return next;
    });
  }, []);

  const dismissEvent = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }, []);

  const goTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const handleToggle = () => {
    if (!open) {
      fetchData();
      fetchPatrolData();
    }
    setOpen(v => !v);
  };

  const riskLevel = (patrolSummary?.highRiskPending ?? 0) > 0 ? 'high'
    : (brief?.overdueOrderCount ?? 0) > 0 ? 'high'
    : (patrolSummary?.pendingCount ?? 0) > 0 ? 'mid'
    : (brief?.highRiskOrderCount ?? 0) > 0 ? 'mid'
    : 'ok';

  const dotColor = riskLevel === 'high' ? '#ef4444'
    : riskLevel === 'mid' ? '#f59e0b'
    : '#22c55e';

  const patrolSeverityColor = (severity: string) => {
    if (severity === 'HIGH') return '#ef4444';
    if (severity === 'MEDIUM') return '#f59e0b';
    return '#22c55e';
  };

  return (
    <div className="smart-alert-wrap">
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={`smart-alert-btn${open ? ' open' : ''}`}
        title="浠婃棩璺熻釜棰勮"
      >
        <span className="smart-alert-btn-icon">
          <ThunderboltOutlined style={{ fontSize: 15 }} />
          {alertCount > 0 && (
            <span className="smart-alert-dot" style={{ background: dotColor }} />
          )}
        </span>
        <span className="smart-alert-btn-label">
          <span className="smart-alert-btn-main">浠婃棩棰勮</span>
        </span>
        {alertCount > 0 && (
          <Badge
            count={alertCount}
            style={{ marginLeft: 4, background: dotColor, boxShadow: 'none' }}
          />
        )}
      </button>

      <div
        ref={panelRef}
        className={`smart-alert-panel${open ? ' visible' : ''}`}
      >
        <div className="sap-header">
          <div className="sap-title">
            <ThunderboltOutlined style={{ color: '#6d28d9' }} />
            <span>浠婃棩璺熻釜棰勮</span>
            {brief?.date && <span className="sap-date">{brief.date}</span>}
          </div>
          <button className="sap-close" onClick={() => setOpen(false)}>
            <CloseOutlined style={{ fontSize: 12 }} />
          </button>
        </div>

        {loading && (
          <div className="sap-loading">
            <XiaoyunCloudAvatar size={34} active loading />
            <span>灏忎簯姝ｅ湪鏁寸悊鎻愰啋锛岃绋嶇瓑涓€涓嬧€?/span>
          </div>
        )}

        {!loading && (
          <>

            {patrolSummary && (patrolSummary.pendingCount > 0 || patrolSummary.autoExecutedToday > 0 || patrolSummary.highRiskPending > 0) && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <RobotOutlined style={{ color: '#7c3aed' }} /> AI宸℃绠€鎶?                </div>
                <div style={{ padding: '8px 12px', background: '#f5f3ff', borderRadius: 6, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {patrolSummary.highRiskPending > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                      <span style={{ fontSize: 13, color: '#333' }}><b>{patrolSummary.highRiskPending}</b> 楂橀闄╁緟澶勭悊</span>
                    </div>
                  )}
                  {patrolSummary.pendingCount > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                      <span style={{ fontSize: 13, color: '#333' }}><b>{patrolSummary.pendingCount}</b> 寰呭鐞?/span>
                    </div>
                  )}
                  {patrolSummary.autoExecutedToday > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                      <span style={{ fontSize: 13, color: '#333' }}><b>{patrolSummary.autoExecutedToday}</b> 宸茶嚜鍔ㄥ鐞?/span>
                    </div>
                  )}
                </div>
                {patrolSummary.recentActions && patrolSummary.recentActions.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {patrolSummary.recentActions.slice(0, 3).map((action, idx) => (
                      <div
                        key={idx}
                        className="sap-event-row"
                        onClick={() => {
                          if (action.targetType === 'order') goTo(`/production?orderNo=${action.targetId}`);
                        }}
                        style={{ cursor: 'pointer', padding: '4px 8px' }}
                        title="鐐瑰嚮鏌ョ湅璁㈠崟璇︽儏"
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: patrolSeverityColor(action.issueSeverity), display: 'inline-block', marginRight: 6 }} />
                        <span style={{ fontSize: 12, color: '#555', flex: 1 }}>{RISK_TYPE_LABELS[action.issueType] || action.issueType} 路 {action.detectedIssue}</span>
                        <span style={{ fontSize: 11, color: '#999' }}>{action.targetId}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {brief?.topPriorityOrder && !dismissedIds.has('topPriority') && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <AlertOutlined style={{ color: '#6d28d9' }} /> 棣栬鍏虫敞
                  <span style={{ marginLeft: 6, fontSize: 12, color: '#999' }}>鐐?脳 浠婃棩涓嶅啀鎻愰啋</span>
                </div>
                <div
                className="sap-priority-card"
                onClick={() => goTo(`/production?orderNo=${brief.topPriorityOrder?.orderNo ?? ''}`)}
                style={{ cursor: 'pointer', position: 'relative' }}
                title="鐐瑰嚮鏌ョ湅璇ヨ鍗?
              >
                  <button
                    className="sap-event-dismiss-btn"
                    style={{ position: 'absolute', top: 6, right: 6 }}
                    onClick={(e) => dismissEvent('topPriority', e)}
                    title="浠婃棩涓嶅啀鎻愰啋锛堟槑澶╀細閲嶆柊妫€娴嬶級"
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
                      鍓?{brief.topPriorityOrder.daysLeft} 澶?                    </span>
                  </div>
                </div>
              </div>
            )}

            {visibleEvents.length > 0 && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <ExclamationCircleOutlined style={{ color: '#ef4444' }} /> 寰呭鐞嗕簨椤?                  <span style={{ marginLeft: 6, fontSize: 12, color: '#999' }}>鐐?脳 浠婃棩涓嶅啀鎻愰啋锛屾槑鏃ヨ嚜鍔ㄩ噸妫€</span>
                </div>
                {visibleEvents.slice(0, 6).map(ev => (
                  <div
                    key={ev.id}
                    className="sap-event-row"
                    onClick={() => goTo(getEventNav(ev))}
                    style={{ cursor: 'pointer' }}
                    title="鐐瑰嚮鍓嶅線澶勭悊"
                  >
                    <span className="sap-event-dot" />
                    <span className="sap-event-title">{ev.title}</span>
                    <span className="sap-event-time">{ev.time}</span>
                    <button
                      className="sap-event-dismiss-btn"
                      onClick={(e) => dismissEvent(ev.id, e)}
                      title="浠婃棩涓嶅啀鎻愰啋锛堟槑澶╀細閲嶆柊妫€娴嬶級"
                    >
                      <CloseOutlined style={{ fontSize: 9 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {brief?.suggestions && brief.suggestions.length > 0 && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <CheckCircleOutlined style={{ color: '#0284c7' }} /> 鎻愰啋寤鸿
                  <span style={{ marginLeft: 6, fontSize: 12, color: '#999' }}>鐐?脳 浠婃棩涓嶅啀鎻愰啋</span>
                </div>
                {brief.decisionCards && brief.decisionCards.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {brief.decisionCards.slice(0, 3).map((card, i) => dismissedIds.has(`decisionCard_${i}`) ? null : (
                      <div key={`${card.title}-${i}`} className="sap-dismissible" style={{ position: 'relative' }}>
                        <button
                          className="sap-event-dismiss-btn"
                          style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}
                          onClick={(e) => dismissEvent(`decisionCard_${i}`, e)}
                          title="浠婃棩涓嶅啀鎻愰啋锛堟槑澶╀細閲嶆柊妫€娴嬶級"
                        >
                          <CloseOutlined style={{ fontSize: 9 }} />
                        </button>
                        <XiaoyunInsightCard
                          compact
                          onNavigate={goTo}
                          card={{
                            ...card,
                            source: card.source || '瀹炴椂鏁版嵁鎺ㄦ紨',
                            confidence: card.confidence || ((brief.overdueOrderCount || 0) + (brief.highRiskOrderCount || 0) > 0 ? '寤鸿浼樺厛澶勭悊' : '鍙墽琛屽缓璁?),
                            summary: card.summary || choose((brief.overdueOrderCount || 0) * 11 + (brief.highRiskOrderCount || 0) * 7 + i, [
                              '鏈夐闄╃偣锛屽厛澶勭悊褰卞搷鏈€澶х殑銆?,
                              '鍏堝仛浼樺厛绾ф敹鍙ｏ紝鍐嶅睍寮€缁嗛」銆?,
                              '鍏堝帇鍏抽敭椋庨櫓锛屽悗缁洿椤恒€?,
                            ]),
                            labels: {
                              summary: '鐜扮姸',
                              painPoint: '鍏虫敞鐐?,
                              execute: '涓嬩竴姝?,
                              evidence: '鏁版嵁',
                              note: '琛ュ厖',
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
                      <span>路 {s}</span>
                      <button
                        className="sap-event-dismiss-btn"
                        style={{ opacity: 1 }}
                        onClick={(e) => dismissEvent(`suggestion_${i}`, e)}
                        title="浠婃棩涓嶅啀鎻愰啋锛堟槑澶╀細閲嶆柊妫€娴嬶級"
                      >
                        <CloseOutlined style={{ fontSize: 9 }} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {visibleNotices.length > 0 && (
              <div className="sap-section">
                <div className="sap-section-title">
                  <span style={{ color: '#d46b08' }}></span> 鎴戠殑閫氱煡
                  {visibleNotices.filter(n => !n.isRead).length > 0 && (
                    <span style={{ marginLeft: 4, fontSize: 12, background: '#ffa940', color: '#fff', borderRadius: 8, padding: '0 5px' }}>
                      {visibleNotices.filter(n => !n.isRead).length} 鏈
                    </span>
                  )}
                  <span style={{ marginLeft: 6, fontSize: 12, color: '#999' }}>鐐?脳 鍏抽棴璇ユ潯</span>
                </div>
                {visibleNotices.slice(0, 8).map(n => (
                  <div key={n.id} className="sap-notice-row"
                    style={{
                      background: n.isRead ? '#fafafa' : '#fff7e6',
                      borderLeft: `3px solid ${n.isRead ? '#ddd' : '#ffa940'}`,
                    }}
                    onClick={() => {
                      if (!n.isRead) {
                        sysNoticeApi.markRead(n.id).then(() => fetchMyNotices()).catch((err) => { console.warn('[SmartAlert] 鏍囪宸茶澶辫触:', err?.message || err); });
                      }
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: n.isRead ? 400 : 600, color: '#333', lineHeight: 1.4 }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 1 }}>
                        {n.fromName} 路 {n.createdAt?.slice(5, 16)}
                      </div>
                    </div>
                    {!n.isRead && (
                      <button
                        className="sap-notice-read-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          sysNoticeApi.markRead(n.id).then(() => fetchMyNotices()).catch((err) => { console.warn('[SmartAlert] 鏍囪宸茶澶辫触:', err?.message || err); });
                          setDismissedNoticeIds(prev => {
                            const next = new Set([...prev, n.id]);
                            saveDismissedNotices(next);
                            return next;
                          });
                        }}
                      >
                        宸茶
                      </button>
                    )}
                    <button
                      className="sap-notice-dismiss-btn"
                      onClick={(e) => dismissNotice(n.id, e)}
                      title="鍏抽棴璇ラ€氱煡"
                    >
                      <CloseOutlined style={{ fontSize: 9 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
};

export default SmartAlertBell;