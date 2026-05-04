import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloseOutlined, RightOutlined } from '@ant-design/icons';
import { intelligenceApi, type PendingTaskSummaryDTO } from '@/services/intelligence/intelligenceApi';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import styles from './SmartBubble.module.css';

const POLL_INTERVAL = 30_000;
const MAX_BACKOFF = 5 * 60_000;
const BUBBLE_AUTO_DISMISS_MS = 15_000;
const STORAGE_KEY = 'xiaoyun_bubble_dismissed';

interface SmartBubbleProps {
  onOpenTaskPanel: () => void;
  triggerEdge?: 'left' | 'right';
}

const SmartBubble: React.FC<SmartBubbleProps> = ({ onOpenTaskPanel, triggerEdge = 'right' }) => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PendingTaskSummaryDTO | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failCountRef = useRef(0);
  const prevTotalRef = useRef(0);

  const loadDismissed = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
    return new Set<string>();
  }, []);

  const saveDismissed = useCallback((ids: Set<string>) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await intelligenceApi.getMyPendingTaskSummary();
      const data: PendingTaskSummaryDTO = (res as any)?.code === 200
        ? (res as any).data
        : ((res as any)?.data ?? res);
      if (data && data.totalCount > 0) {
        setSummary(data);
        const currentDismissed = loadDismissed();
        setDismissed(currentDismissed);

        const prevTotal = prevTotalRef.current;
        prevTotalRef.current = data.totalCount;

        if (data.totalCount > prevTotal || prevTotal === 0) {
          const hasNewTasks = data.topUrgentTitle && !currentDismissed.has(data.topUrgentTitle);
          if (hasNewTasks) {
            setVisible(true);
            if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
            autoDismissRef.current = setTimeout(() => setVisible(false), BUBBLE_AUTO_DISMISS_MS);
          }
        }
      } else {
        setSummary(null);
        setVisible(false);
      }
      failCountRef.current = 0;
    } catch {
      failCountRef.current += 1;
    }
  }, [loadDismissed]);

  const scheduleNext = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    const delay = failCountRef.current === 0
      ? POLL_INTERVAL
      : Math.min(POLL_INTERVAL * Math.pow(2, failCountRef.current - 1), MAX_BACKOFF);
    pollTimerRef.current = setTimeout(() => {
      void fetchSummary().then(scheduleNext);
    }, delay);
  }, [fetchSummary]);

  useEffect(() => {
    void fetchSummary().then(scheduleNext);
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
  }, [fetchSummary, scheduleNext]);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setVisible(false);
    if (summary?.topUrgentTitle) {
      const next = new Set(dismissed);
      next.add(summary.topUrgentTitle);
      setDismissed(next);
      saveDismissed(next);
    }
  }, [summary, dismissed, saveDismissed]);

  const handleGoToUrgent = useCallback(() => {
    if (summary?.topUrgentDeepLinkPath) {
      setVisible(false);
      navigate(summary.topUrgentDeepLinkPath);
    }
  }, [summary, navigate]);

  const handleOpenPanel = useCallback(() => {
    setVisible(false);
    onOpenTaskPanel();
  }, [onOpenTaskPanel]);

  if (!visible || !summary || summary.totalCount === 0) return null;

  const isLeft = triggerEdge === 'left';

  return (
    <div className={`${styles.bubbleWrap} ${isLeft ? styles.bubbleLeft : styles.bubbleRight}`}>
      <div className={styles.bubbleInner}>
        <div className={styles.bubbleAvatar}>
          <XiaoyunCloudAvatar size={32} active mood={summary.highPriorityCount > 0 ? 'urgent' : 'curious'} />
        </div>
        <div className={styles.bubbleContent}>
          <div className={styles.bubbleHeader}>
            <span className={styles.bubbleGreeting}>
              {summary.highPriorityCount > 0 ? '有紧急待办！' : '你有新待办'}
            </span>
            <button className={styles.bubbleCloseBtn} onClick={handleDismiss}>
              <CloseOutlined style={{ fontSize: 10 }} />
            </button>
          </div>
          {summary.topUrgentTitle && (
            <div className={styles.bubbleUrgentItem} onClick={handleGoToUrgent}>
              <span className={styles.bubbleUrgentIcon}>🔴</span>
              <span className={styles.bubbleUrgentText}>{summary.topUrgentTitle}</span>
              <RightOutlined className={styles.bubbleUrgentArrow} />
            </div>
          )}
          <div className={styles.bubbleStats} onClick={handleOpenPanel}>
            <span className={styles.bubbleStatTotal}>
              共 <strong>{summary.totalCount}</strong> 项待办
            </span>
            {summary.highPriorityCount > 0 && (
              <span className={styles.bubbleStatHigh}>
                {summary.highPriorityCount} 项紧急
              </span>
            )}
            <span className={styles.bubbleViewAll}>查看全部 →</span>
          </div>
          <div className={styles.bubbleCategoryRow}>
            {Object.values(summary.categoryCounts || {}).slice(0, 5).map(cat => (
              <span key={cat.taskType} className={styles.bubbleCategoryTag}>
                {cat.icon} {cat.label} {cat.count}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className={`${styles.bubbleArrow} ${isLeft ? styles.bubbleArrowLeft : styles.bubbleArrowRight}`} />
    </div>
  );
};

export default SmartBubble;
