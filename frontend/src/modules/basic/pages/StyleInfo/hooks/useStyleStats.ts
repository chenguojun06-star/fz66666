import React, { useState, useCallback } from 'react';
import api from '@/utils/api';
import type { PatternDevelopmentStats } from '@/types/production';

interface UseStyleStatsReturn {
  statsRangeType: 'day' | 'week' | 'month';
  setStatsRangeType: React.Dispatch<React.SetStateAction<'day' | 'week' | 'month'>>;
  developmentStats: PatternDevelopmentStats | null;
  statsLoading: boolean;
  loadDevelopmentStats: (rangeType: 'day' | 'week' | 'month') => Promise<void>;
}

export const useStyleStats = (): UseStyleStatsReturn => {
  const [statsRangeType, setStatsRangeType] = useState<'day' | 'week' | 'month'>('day');
  const [developmentStats, setDevelopmentStats] = useState<PatternDevelopmentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadDevelopmentStats = useCallback(async (rangeType: 'day' | 'week' | 'month') => {
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
    loadDevelopmentStats
  };
};
