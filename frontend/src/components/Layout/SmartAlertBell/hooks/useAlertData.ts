import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { ApiResult } from '../../../../utils/api';
import { sysNoticeApi } from '../../../../services/production/productionApi';
import { useUser } from '../../../../utils/AuthContext';
import type { SysNotice } from '../../../../services/production/productionApi';
import { useAiPatrol } from '@/modules/production/pages/Production/List/hooks/useAiPatrol';
import type { BriefData, UrgentEvent } from '../types';
import {
  loadDismissed,
  loadDismissedNotices,
  saveDismissed,
  saveDismissedNotices,
  NOTICE_POLL_INTERVAL,
  MAX_BACKOFF,
} from '../helpers';

export interface UseAlertDataReturn {
  // 状态
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  brief: BriefData | null;
  events: UrgentEvent[];
  loading: boolean;
  myNotices: SysNotice[];
  visibleEvents: UrgentEvent[];
  visibleNotices: SysNotice[];
  dismissedIds: Set<string>;
  alertCount: number;
  unreadNoticeCount: number;
  patrolSummary: ReturnType<typeof useAiPatrol>['patrolSummary'];
  // refs
  panelRef: React.RefObject<HTMLDivElement>;
  btnRef: React.RefObject<HTMLButtonElement>;
  // 派生
  riskLevel: 'high' | 'mid' | 'ok';
  dotColor: string;
  patrolSeverityColor: (severity: string) => string;
  // 回调
  goTo: (path: string) => void;
  handleToggle: () => void;
  dismissEvent: (id: string, e: React.MouseEvent) => void;
  dismissNotice: (id: number, e: React.MouseEvent) => void;
  markAllNoticesRead: () => void;
  handleMarkRead: (id: number, callback?: () => void) => void;
  dismissNoticeLocally: (id: number) => void;
}

export function useAlertData(): UseAlertDataReturn {
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
      .catch((err) => console.error('批量标记通知已读失败:', err));
    setDismissedNoticeIds(prev => {
      const next = new Set([...prev, ...unreadIds]);
      saveDismissedNotices(next);
      return next;
    });
  }, [myNotices, fetchMyNotices]);

  // 单条通知标记已读 + 可选回调（如同步本地 dismiss 列表）
  const handleMarkRead = useCallback((id: number, callback?: () => void) => {
    sysNoticeApi.markRead(id)
      .then(() => fetchMyNotices())
      .catch((err) => { console.warn('[SmartAlert] 标记已读失败:', err?.message || err); });
    if (callback) callback();
  }, [fetchMyNotices]);

  // 本地 dismiss 一条通知（不调 API，仅前端隐藏）
  const dismissNoticeLocally = useCallback((id: number) => {
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
    if (!open) { fetchData(); fetchPatrolData(); }
    setOpen(v => !v);
  };

  // ── 渲染辅助 ──────────────────────────────────────────────
  const patrolSeverityColor = (severity: string) => {
    if (severity === 'HIGH') return 'var(--color-error)';
    if (severity === 'MEDIUM') return 'var(--color-warning)';
    return 'var(--color-warning)';
  };

  const riskLevel = (brief?.overdueOrderCount ?? 0) > 0 || (patrolSummary?.highRiskPending ?? 0) > 0 ? 'high'
    : (brief?.highRiskOrderCount ?? 0) > 0 ? 'mid'
    : 'ok';

  const dotColor = riskLevel === 'high' ? '#ef4444'
    : riskLevel === 'mid' ? '#f59e0b'
    : '#22c55e';

  return {
    open,
    setOpen,
    brief,
    events,
    loading,
    myNotices,
    visibleEvents,
    visibleNotices,
    dismissedIds,
    alertCount,
    unreadNoticeCount,
    patrolSummary,
    panelRef,
    btnRef,
    riskLevel,
    dotColor,
    patrolSeverityColor,
    goTo,
    handleToggle,
    dismissEvent,
    dismissNotice,
    markAllNoticesRead,
    handleMarkRead,
    dismissNoticeLocally,
  };
}
