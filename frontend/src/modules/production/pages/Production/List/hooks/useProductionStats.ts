import { useState, useEffect } from 'react';
import api, { isApiSuccess } from '@/utils/api';
import { ProductionQueryParams } from '@/types/production';

/**
 * 全局统计数据Hook
 * 根据筛选条件获取订单统计信息（不受分页影响）
 */

export interface GlobalStats {
  activeOrders: number;
  activeQuantity: number;
  completedOrders: number;
  completedQuantity: number;
  scrappedOrders: number;
  scrappedQuantity: number;
  totalOrders: number;
  totalQuantity: number;
  delayedOrders: number;
  delayedQuantity: number;
  todayOrders: number;
  todayQuantity: number;
}

export function useProductionStats(queryParams: ProductionQueryParams) {
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    activeOrders: 0,
    activeQuantity: 0,
    completedOrders: 0,
    completedQuantity: 0,
    scrappedOrders: 0,
    scrappedQuantity: 0,
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
      // ⚠️ 不传 excludeTerminal：统计接口应返回所有状态订单的真实数量，
      //    否则后端WHERE会过滤掉终态订单，导致 totalOrders=activeOrders、completedOrders=0
      const filterParams = params
        ? {
            keyword: params.keyword,
            factoryName: params.factoryName,
            status: params.status,
            urgencyLevel: params.urgencyLevel,
            plateType: params.plateType,
            orderNo: params.orderNo,
            styleNo: params.styleNo,
            // P0 修复（数据一致性）：补齐与列表接口对齐的筛选参数透传，
            // 防止统计接口与列表接口因过滤维度不同导致数字不一致。
            includeScrapped: params.includeScrapped,
            delayedOnly: params.delayedOnly,
            todayOnly: params.todayOnly,
            factoryId: params.factoryId,
            factoryType: params.factoryType,
            merchandiser: params.merchandiser,
            customerId: params.customerId,
            customerName: params.customerName,
          }
        : {};

      const response = await api.get<GlobalStats>('/production/order/stats', {
        params: filterParams,
      });

      if (isApiSuccess(response)) {
        const data = (response.data || {}) as Record<string, unknown>;
        // P0 修复（静默数据掩盖）：移除 activeOrders <-> totalOrders 双向 fallback。
        // 旧代码形成循环掩盖：A 缺用 B 填、B 缺用 A 填，导致"全部订单=生产中"
        // 这类后端数据缺陷长期被掩盖，用户无法感知。修复后缺省明确为 0，
        // 任一统计字段为 0 时立即暴露异常，便于运维/用户快速发现后端 SQL 问题。
        setGlobalStats({
          activeOrders: Number(data.activeOrders ?? 0),
          activeQuantity: Number(data.activeQuantity ?? 0),
          completedOrders: Number(data.completedOrders ?? 0),
          completedQuantity: Number(data.completedQuantity ?? 0),
          scrappedOrders: Number(data.scrappedOrders ?? 0),
          scrappedQuantity: Number(data.scrappedQuantity ?? 0),
          totalOrders: Number(data.totalOrders ?? 0),
          totalQuantity: Number(data.totalQuantity ?? 0),
          delayedOrders: Number(data.delayedOrders ?? 0),
          delayedQuantity: Number(data.delayedQuantity ?? 0),
          todayOrders: Number(data.todayOrders ?? 0),
          todayQuantity: Number(data.todayQuantity ?? 0),
        });
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
