import { useState, useCallback, useEffect } from 'react';
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

export const useDashboardStats = () => {
  const [stats, setStats] = useState<DashboardStats>({
    sampleDevelopmentCount: 0,
    productionOrderCount: 0,
    orderQuantityTotal: 0,
    overdueOrderCount: 0,
    todayWarehousingCount: 0,
    totalWarehousingCount: 0,
    defectiveQuantity: 0,
    paymentApprovalCount: 0,
  });
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setHasError(false);
    setErrorMessage('');
    
    try {
      const response = await api.get<{ code: number; data: any; message?: string }>('/dashboard');
      if (response.code === 200) {
        const d = response.data || {};
        setStats({
          sampleDevelopmentCount: d.sampleDevelopmentCount ?? 0,
          productionOrderCount: d.productionOrderCount ?? 0,
          orderQuantityTotal: d.orderQuantityTotal ?? 0,
          overdueOrderCount: d.overdueOrderCount ?? 0,
          todayWarehousingCount: d.todayWarehousingCount ?? 0,
          totalWarehousingCount: d.totalWarehousingCount ?? 0,
          defectiveQuantity: d.defectiveQuantity ?? 0,
          paymentApprovalCount: d.paymentApprovalCount ?? 0,
        });
        setRecentActivities(d.recentActivities ?? []);
        setRetryCount(0);
      } else {
        const errMsg = response.message || '获取仪表盘数据失败';
        setHasError(true);
        setErrorMessage(errMsg);
      }
    } catch (error: any) {
      const errMsg = error?.message || '网络错误，无法加载数据';
      setHasError(true);
      setErrorMessage(errMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // 实时同步
  useSync(
    'dashboard-stats',
    async () => {
      const response = await api.get<{ code: number; data: any }>('/dashboard');
      return response?.code === 200 ? (response.data || {}) : null;
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setStats({
          sampleDevelopmentCount: newData.sampleDevelopmentCount ?? 0,
          productionOrderCount: newData.productionOrderCount ?? 0,
          orderQuantityTotal: newData.orderQuantityTotal ?? 0,
          overdueOrderCount: newData.overdueOrderCount ?? 0,
          todayWarehousingCount: newData.todayWarehousingCount ?? 0,
          totalWarehousingCount: newData.totalWarehousingCount ?? 0,
          defectiveQuantity: newData.defectiveQuantity ?? 0,
          paymentApprovalCount: newData.paymentApprovalCount ?? 0,
        });
        setRecentActivities(newData.recentActivities ?? []);
      }
    },
    {
      interval: 60000,
      pauseOnHidden: true,
      onError: (error: any) => {
        if (error?.status !== 401 && error?.status !== 403) {
          console.error('[实时同步] 仪表盘数据同步失败:', error);
        }
      }
    }
  );

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

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
