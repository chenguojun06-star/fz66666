import { useCallback, useEffect, useState } from 'react';
import api from '@/utils/api';

export interface SampleStageStat {
  stageName: string;
  count: number;
  styleIds: string[];
  styleNos: string[];
}

/**
 * 样衣开发各环节进行中款号统计
 * 用于智能提示标签：显示每个环节有多少款号在进行中，点击可筛选
 */
export const useSampleStageStats = () => {
  const [stats, setStats] = useState<SampleStageStat[]>([]);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get('/dashboard/sample-stage-stats');
      // api.get 返回 axios response，result.data = { code: 200, data: [...] }
      const raw = result?.data;
      const resp = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setStats(resp);
    } catch (error) {
      console.error('Failed to load sample stage stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return { stats, loading, reloadStats: loadStats };
};
