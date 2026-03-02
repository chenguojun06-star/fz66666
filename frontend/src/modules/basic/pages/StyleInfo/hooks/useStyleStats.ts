import React, { useState, useCallback } from 'react';
import api from '@/utils/api';
import type { PatternDevelopmentStats } from '@/types/production';

export type StatsRangeType = 'day' | 'week' | 'month' | 'year';

interface UseStyleStatsReturn {
  statsRangeType: StatsRangeType;
  setStatsRangeType: React.Dispatch<React.SetStateAction<StatsRangeType>>;
  developmentStats: PatternDevelopmentStats | null;
  statsLoading: boolean;
  loadDevelopmentStats: (rangeType: StatsRangeType) => Promise<void>;
}

export const useStyleStats = (): UseStyleStatsReturn => {
  const [statsRangeType, setStatsRangeType] = useState<StatsRangeType>('day');
  const [developmentStats, setDevelopmentStats] = useState<PatternDevelopmentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadDevelopmentStats = useCallback(async (rangeType: StatsRangeType) => {
    setStatsLoading(true);
    try {
      const response = await api.get<{ code: number; data: PatternDevelopmentStats }>(
        '/style/info/development-stats',
        { params: { rangeType } }
      );
      if (response.code === 200 && response.data) {
        setDevelopmentStats(response.data);
      }
    } catch (error) {
      console.error('加载费用统计失败:', error);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  return {
    statsRangeType,
    setStatsRangeType,
    developmentStats,
    statsLoading,
    loadDevelopmentStats,
  };
};
