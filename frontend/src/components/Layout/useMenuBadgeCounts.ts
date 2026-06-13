import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/utils/api';

const VIEWED_KEY = 'menu_badge_viewed';

interface ViewedRecord {
  count: number;
  timestamp: number;
}

function loadViewed(): Record<string, ViewedRecord> {
  try {
    const raw = localStorage.getItem(VIEWED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveViewed(record: Record<string, ViewedRecord>) {
  try {
    localStorage.setItem(VIEWED_KEY, JSON.stringify(record));
  } catch { /* ok */ }
}

function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

const POLL_INTERVAL = 30_000;
const MAX_FAIL_COUNT = 3; // 连续失败3次后停止轮询

export function useMenuBadgeCounts() {
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  const [viewVersion, setViewVersion] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failCountRef = useRef(0);

  const fetchBadges = useCallback(async () => {
    try {
      const res = await api.get('/dashboard/menu-badge-counts');
      if (res?.code === 200 && res.data) {
        const normalized: Record<string, number> = {};
        for (const [k, v] of Object.entries(res.data)) {
          normalized[k] = Number(v) || 0;
        }
        setBadgeCounts(normalized);
        failCountRef.current = 0; // 成功后重置失败计数
      }
    } catch {
      failCountRef.current += 1;
      /* 连续失败多次后停止轮询，避免无效请求 */
      if (failCountRef.current >= MAX_FAIL_COUNT && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    fetchBadges();
    timerRef.current = setInterval(fetchBadges, POLL_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchBadges]);

  const getVisibleCount = useCallback((path: string): number => {
    const count = badgeCounts[path] || 0;
    if (count <= 0) return 0;

    const viewed = loadViewed();
    const record = viewed[path];
    if (!record) return count;

    if (!isToday(record.timestamp)) return count;

    if (count > record.count) return count;

    return 0;
  }, [badgeCounts]);

  const markViewed = useCallback((path: string) => {
    const count = badgeCounts[path] || 0;
    if (count <= 0) return;

    const viewed = loadViewed();
    viewed[path] = { count, timestamp: Date.now() };
    saveViewed(viewed);
    setViewVersion(v => v + 1);
  }, [badgeCounts]);

  return { badgeCounts, getVisibleCount, markViewed, viewVersion };
}