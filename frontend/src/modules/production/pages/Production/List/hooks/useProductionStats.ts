import { useState, useEffect } from 'react';
import api, { isApiSuccess } from '@/utils/api';
import { ProductionQueryParams } from '@/types/production';

/**
 * 全局统计数据Hook
 * 根据筛选条件获取订单统计信息（不受分页影响）
 */

export interface GlobalStats {
  totalOrders: number;
  totalQuantity: number;
  delayedOrders: number;
  delayedQuantity: number;
  todayOrders: number;
  todayQuantity: number;
}

export function useProductionStats(queryParams: ProductionQueryParams) {
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    totalOrders: 0,
    totalQuantity: 0,
    delayedOrders: 0,
    delayedQuantity: 0,
    todayOrders: 0,
    todayQuantity: 0,
  });

  const fetchGlobalStats = async (params?: ProductionQueryParams) => {
    try {
      // 只传递筛选参数，不传分页参数
      const filterParams = params
        ? {
            keyword: params.keyword,
            factoryName: params.factoryName,
            status: params.status,
            urgencyLevel: params.urgencyLevel,
            plateType: params.plateType,
            orderNo: params.orderNo,
            styleNo: params.styleNo,
          }
        : {};

      const response = await api.get<GlobalStats>('/production/order/stats', {
        params: filterParams,
      });

      if (isApiSuccess(response)) {
        setGlobalStats(response.data);
      }
    } catch (error) {
      console.error('获取全局统计数据失败', error);
    }
  };

  // 筛选条件变化时更新统计数据
  useEffect(() => {
    fetchGlobalStats(queryParams);
  }, [queryParams]);

  return {
    globalStats,
    fetchGlobalStats, // 暴露手动刷新函数
  };
}
