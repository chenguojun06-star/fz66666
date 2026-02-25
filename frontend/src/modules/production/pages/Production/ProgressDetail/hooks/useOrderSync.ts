import React, { useEffect, useRef } from 'react';
import type { ProductionOrder } from '@/types/production';

type UseOrderSyncParams = {
  fetchOrders: (options?: { silent?: boolean }) => Promise<void>;
  fetchOrderDetail: (orderId: string) => Promise<ProductionOrder | null>;
  fetchScanHistory: (order: ProductionOrder, options?: { silent?: boolean }) => Promise<any>;
  activeOrderRef: React.MutableRefObject<ProductionOrder | null>;
  setActiveOrder: (order: ProductionOrder | null) => void;
  orderSyncingRef: React.MutableRefObject<boolean>;
};

/**
 * 安全的订单自动同步 Hook
 *
 * 修复历史：原实现每30秒触发 fetchOrders + fetchOrderDetail + fetchScanHistory，
 * 导致请求爆炸（10秒内400+个请求）。
 *
 * 新方案：仅静默刷新订单列表（1个请求/30秒），扫码历史由用户手动刷新。
 * 这样手机端退回重扫后，PC端30秒内即可看到订单进度变化。
 */
export const useOrderSync = ({
  fetchOrders,
  fetchOrderDetail: _fetchOrderDetail,
  fetchScanHistory: _fetchScanHistory,
  activeOrderRef: _activeOrderRef,
  setActiveOrder: _setActiveOrder,
  orderSyncingRef,
}: UseOrderSyncParams) => {
  const fetchOrdersRef = useRef(fetchOrders);
  const syncingRef = useRef(false);

  useEffect(() => {
    fetchOrdersRef.current = fetchOrders;
  }, [fetchOrders]);

  useEffect(() => {
    let _cancelled = false;

    const run = async () => {
      // 防止并发刷新
      if (syncingRef.current || orderSyncingRef.current) return;
      syncingRef.current = true;
      try {
        // 仅静默刷新订单列表（1个请求），不触发 fetchOrderDetail 和 fetchScanHistory
        await fetchOrdersRef.current({ silent: true });
      } catch {
        // 静默失败，不影响用户操作
      } finally {
        syncingRef.current = false;
      }
    };

    // 30秒轮询，仅刷新订单列表
    const timer = window.setInterval(run, 30000);

    return () => {
      _cancelled = true;
      window.clearInterval(timer);
    };
  }, [orderSyncingRef]);
};
