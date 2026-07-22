import { useState, useEffect, useCallback, useRef } from 'react';
import { App } from 'antd';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { FactoryRank } from '@/services/intelligence/intelligenceApi';

export function useFactoryLeaderboard() {
  const { message } = App.useApp();
  const [leaderboard, setLeaderboard] = useState<FactoryRank[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbCollapsed, setLbCollapsed] = useState(false);
  const lbFetched = useRef(false);

  const fetchLeaderboard = useCallback(async () => {
    if (lbFetched.current) return;
    lbFetched.current = true;
    setLbLoading(true);
    try {
      const res = (await intelligenceApi.getFactoryLeaderboard()) as any;
      const ranks: FactoryRank[] = res?.data?.rankings ?? res?.rankings ?? [];
      setLeaderboard(ranks.slice(0, 6));
    } catch {
      message.warning('绩效榜加载失败');
    } finally {
      setLbLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void fetchLeaderboard();
  }, [fetchLeaderboard]);

  return {
    leaderboard,
    lbLoading,
    lbCollapsed,
    setLbCollapsed,
  };
}
