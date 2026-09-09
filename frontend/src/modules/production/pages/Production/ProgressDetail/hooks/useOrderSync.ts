import React, { useCallback, useEffect, useRef } from 'react';
import type { ProductionOrder } from '@/types/production';
import { useSync } from '@/utils/syncManager';
import { invalidateBoardStatsTimestamp } from './useBoardStats';
import { useWebSocket } from '@/hooks/useWebSocket';


type UseOrderSyncParams = {
  fetchOrders: (options?: { silent?: boolean }) => Promise<void>;
  fetchOrderDetail: (orderId: string) => Promise<ProductionOrder | null>;
  fetchScanHistory: (order: ProductionOrder, options?: { silent?: boolean }) => Promise<any>;
  activeOrderRef: React.MutableRefObject<ProductionOrder | null>;
  setActiveOrder: (order: ProductionOrder | null) => void;
  orderSyncingRef: React.MutableRefObject<boolean>;
  userId?: string;
  tenantId?: string | number;
};

export const useOrderSync = ({
  fetchOrders,
  fetchOrderDetail,
  fetchScanHistory,
  activeOrderRef,
  setActiveOrder,
  orderSyncingRef,
  userId,
  tenantId,
}: UseOrderSyncParams) => {
  const { connected: _wsConnected, subscribeProgress } = useWebSocket({
    userId,
    tenantId,
    enabled: true,
  });
  const syncingRef = useRef(false);
  const fetchOrdersRef = useRef(fetchOrders);
  const fetchOrderDetailRef = useRef(fetchOrderDetail);
  const fetchScanHistoryRef = useRef(fetchScanHistory);

  useEffect(() => { fetchOrdersRef.current = fetchOrders; }, [fetchOrders]);
  useEffect(() => { fetchOrderDetailRef.current = fetchOrderDetail; }, [fetchOrderDetail]);
  useEffect(() => { fetchScanHistoryRef.current = fetchScanHistory; }, [fetchScanHistory]);

  const fetchFn = useCallback(async () => {
    // 本函数是「副作用型」同步：内部各自 setState，无返回值语义。
    // 同步管理器把 return null 视为「本次拉取无效」，连续 3 次会停掉任务，
    // 所以正常/跳过路径都必须返回非空对象，只有真异常才返回 null 交给失败闸门。
    if (syncingRef.current || orderSyncingRef.current) return { skipped: true };
    syncingRef.current = true;
    try {
      await fetchOrdersRef.current({ silent: true });
      if (activeOrderRef.current?.id) {
        const updated = await fetchOrderDetailRef.current(activeOrderRef.current.id);
        if (updated) {
          setActiveOrder(updated);
          await fetchScanHistoryRef.current(updated, { silent: true });
        }
      }
      return { ok: true };
    } catch {
      return null;
    } finally {
      syncingRef.current = false;
    }
  }, [setActiveOrder, activeOrderRef, orderSyncingRef]);

  // 兜底轮询 1 分钟（主链路为 WebSocket order:progress:changed 实时推送；此前 5 分钟轮询导致进度球长时间不更新）
  useSync('progress-detail-order', fetchFn, () => {}, { interval: 60000, pauseOnHidden: true });

  useEffect(() => {
    const handleProgressChanged = (event?: Event) => {
      if (syncingRef.current || orderSyncingRef.current) return;
      const detail = (event as CustomEvent)?.detail;
      if (detail?.orderId) {
        invalidateBoardStatsTimestamp(detail.orderId);
      }
      fetchFn();
    };
    window.addEventListener('order:progress:changed', handleProgressChanged);
    return () => window.removeEventListener('order:progress:changed', handleProgressChanged);
  }, [fetchFn, orderSyncingRef]);

  useEffect(() => {
    const handleWsProgress = (msg: { orderId: string }) => {
      if (!msg.orderId || syncingRef.current || orderSyncingRef.current) return;
      invalidateBoardStatsTimestamp(msg.orderId);
      fetchFn();
    };
    const unsubscribe = subscribeProgress(handleWsProgress);
    return unsubscribe;
  }, [subscribeProgress, fetchFn, orderSyncingRef]);
};
