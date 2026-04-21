import { useState, useCallback } from 'react';
import api from '@/utils/api';
import { useSync } from '@/utils/syncManager';

export interface DashboardStats {
  sampleDevelopmentCount: number;
  productionOrderCount: number;
  orderQuantityTotal: number;
  overdueOrderCount: number;
  todayWarehousingCount: number;
  totalWarehousingCount: number;
  defectiveQuantity: number;
  paymentApprovalCount: number;
}

export interface RecentActivity {
  id: string;
  type: string;
  content: string;
  time: string;
}

const DEFAULT_STATS: DashboardStats = {
  sampleDevelopmentCount: 0,
  productionOrderCount: 0,
  orderQuantityTotal: 0,
  overdueOrderCount: 0,
  todayWarehousingCount: 0,
  totalWarehousingCount: 0,
  defectiveQuantity: 0,
  paymentApprovalCount: 0,
};

function mapStats(d: any): DashboardStats {
  return {
    sampleDevelopmentCount: d.sampleDevelopmentCount ?? 0,
    productionOrderCount: d.productionOrderCount ?? 0,
    orderQuantityTotal: d.orderQuantityTotal ?? 0,
    overdueOrderCount: d.overdueOrderCount ?? 0,
    todayWarehousingCount: d.todayWarehousingCount ?? 0,
    totalWarehousingCount: d.totalWarehousingCount ?? 0,
    defectiveQuantity: d.defectiveQuantity ?? 0,
    paymentApprovalCount: d.paymentApprovalCount ?? 0,
  };
}

function statsEqual(a: DashboardStats, b: DashboardStats): boolean {
  return a.sampleDevelopmentCount === b.sampleDevelopmentCount
    && a.productionOrderCount === b.productionOrderCount
    && a.orderQuantityTotal === b.orderQuantityTotal
    && a.overdueOrderCount === b.overdueOrderCount
    && a.todayWarehousingCount === b.todayWarehousingCount
    && a.totalWarehousingCount === b.totalWarehousingCount
    && a.defectiveQuantity === b.defectiveQuantity
    && a.paymentApprovalCount === b.paymentApprovalCount;
}

export const useDashboardStats = () => {
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const applyDashboardData = useCallback((d: any, isFirstLoad = false) => {
    const newStats = mapStats(d);
    setStats(prev => statsEqual(prev, newStats) ? prev : newStats);
    setRecentActivities(d.recentActivities ?? []);
    if (isFirstLoad) {
      setLoading(false);
      setRetryCount(0);
    }
  }, []);

  useSync(
    'dashboard-stats',
    async () => {
      setLoading(prev => prev);
      try {
        const response = await api.get<{ code: number; data: any; message?: string }>('/dashboard');
        if (response.code === 200) {
          return response.data || {};
        }
        return null;
      } catch {
        return null;
      }
    },
    (newData, oldData) => {
      if (newData) {
        const isFirstLoad = oldData === null;
        applyDashboardData(newData, isFirstLoad);
      } else if (oldData === null) {
        setLoading(false);
        setHasError(true);
        setErrorMessage('获取仪表盘数据失败');
      }
    },
    {
      interval: 60000,
      pauseOnHidden: true,
      onError: (error: any) => {
        if (error?.status !== 401 && error?.status !== 403) {
          console.error('[实时同步] 仪表盘数据同步失败:', error);
        }
        setHasError(true);
        setErrorMessage(error instanceof Error ? error.message : '网络错误');
        setLoading(false);
      }
    }
  );

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setHasError(false);
    setErrorMessage('');

    try {
      const response = await api.get<{ code: number; data: any; message?: string }>('/dashboard');
      if (response.code === 200) {
        applyDashboardData(response.data || {}, true);
      } else {
        const errMsg = response.message || '获取仪表盘数据失败';
        setHasError(true);
        setErrorMessage(errMsg);
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '网络错误，无法加载数据';
      setHasError(true);
      setErrorMessage(errMsg);
    } finally {
      setLoading(false);
    }
  }, [applyDashboardData]);

  const handleRetry = useCallback(() => {
    setRetryCount(prev => prev + 1);
    fetchDashboard();
  }, [fetchDashboard]);

  return {
    stats,
    recentActivities,
    loading,
    hasError,
    errorMessage,
    retryCount,
    handleRetry,
    refresh: fetchDashboard
  };
};
