import { useCallback, useEffect, useRef, useState } from 'react';
import { intelligenceApi } from '../../../../services/intelligence/intelligenceApi';
import type { ProactiveInsightItem } from '../../../../services/intelligence/intelligenceTypes';

// P1-3: 小云主动洞察 — 拉取 Redis 未读洞察列表，提供标记已读能力
// 数据源：ProactivePatrolAgent 每小时巡检写入的 delay_risk / combo_risk 等
// 用途：在 SmartAlertBell 顶部以红点+列表+已读按钮形式展示

const POLL_INTERVAL = 60_000; // 1 分钟轮询

export interface UseProactiveInsightsReturn {
  insights: ProactiveInsightItem[];
  loading: boolean;
  refresh: () => void;
  markRead: (id: string) => Promise<void>;
}

export function useProactiveInsights(): UseProactiveInsightsReturn {
  const [insights, setInsights] = useState<ProactiveInsightItem[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (mountedRef.current === false) return;
    setLoading(true);
    try {
      const list = await intelligenceApi.getProactiveInsights();
      if (mountedRef.current) {
        setInsights(Array.isArray(list) ? list : []);
      }
    } catch (_e) {
      // 静默失败，不打扰用户
      if (mountedRef.current) setInsights([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    // 乐观移除
    setInsights((prev) => prev.filter((it) => it.id !== id));
    try {
      await intelligenceApi.markProactiveInsightRead(id);
    } catch (_e) {
      // 失败回滚：重新拉取
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    timerRef.current = setInterval(refresh, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [refresh]);

  return { insights, loading, refresh, markRead };
}
