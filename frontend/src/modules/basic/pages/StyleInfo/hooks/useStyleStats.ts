import React, { useState, useCallback } from 'react';
import api from '@/utils/api';
import type { PatternDevelopmentStats } from '@/types/production';
import dayjs from 'dayjs';

export type StatsRangeType = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface DateRange {
  startDate: string; // yyyy-MM-dd
  endDate: string;   // yyyy-MM-dd
}

interface UseStyleStatsReturn {
  statsRangeType: StatsRangeType;
  setStatsRangeType: React.Dispatch<React.SetStateAction<StatsRangeType>>;
  dateRange: DateRange;
  setDateRange: React.Dispatch<React.SetStateAction<DateRange>>;
  developmentStats: PatternDevelopmentStats | null;
  statsLoading: boolean;
  loadDevelopmentStats: (rangeType: StatsRangeType, dateRange?: DateRange) => Promise<void>;
}

export const useStyleStats = (): UseStyleStatsReturn => {
  const [statsRangeType, setStatsRangeType] = useState<StatsRangeType>('month');
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD'),
  });
  const [developmentStats, setDevelopmentStats] = useState<PatternDevelopmentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadDevelopmentStats = useCallback(async (rangeType: StatsRangeType, customDateRange?: DateRange) => {
    setStatsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (rangeType === 'custom' && customDateRange) {
        params.startDate = customDateRange.startDate;
        params.endDate = customDateRange.endDate;
        params.rangeType = 'custom';
      } else {
        params.rangeType = rangeType;
      }
      const response = await api.get<{ code: number; data: PatternDevelopmentStats }>(
        '/style/info/development-stats',
        { params }
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
    dateRange,
    setDateRange,
    developmentStats,
    statsLoading,
    loadDevelopmentStats,
  };
};
