import React, { useEffect, useRef } from 'react';
import type { ProductionOrder } from '@/types/production';
import { useSync } from '@/utils/syncManager';

type UseOrderSyncParams = {
  fetchOrders: (options?: { silent?: boolean }) => Promise<void>;
  fetchOrderDetail: (orderId: string) => Promise<ProductionOrder | null>;
  fetchScanHistory: (order: ProductionOrder, options?: { silent?: boolean }) => Promise<any>;
  activeOrderRef: React.MutableRefObject<ProductionOrder | null>;
  setActiveOrder: (order: ProductionOrder | null) => void;
  orderSyncingRef: React.MutableRefObject<boolean>;
};

export const useOrderSync = ({
  fetchOrders,
  fetchOrderDetail,
  fetchScanHistory,
  activeOrderRef,
  setActiveOrder,
  orderSyncingRef,
}: UseOrderSyncParams) => {
  const syncingRef = useRef(false);
  const fetchOrdersRef = useRef(fetchOrders);
  const fetchOrderDetailRef = useRef(fetchOrderDetail);
  const fetchScanHistoryRef = useRef(fetchScanHistory);

  useEffect(() => { fetchOrdersRef.current = fetchOrders; }, [fetchOrders]);
  useEffect(() => { fetchOrderDetailRef.current = fetchOrderDetail; }, [fetchOrderDetail]);
  useEffect(() => { fetchScanHistoryRef.current = fetchScanHistory; }, [fetchScanHistory]);

  const fetchFn = async () => {
    if (syncingRef.current || orderSyncingRef.current) return null;
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
    } catch {
    } finally {
      syncingRef.current = false;
    }
    return null;
  };

  useSync('progress-detail-order', fetchFn, () => {}, { interval: 30000, pauseOnHidden: true });

  useEffect(() => {
    const handleProgressChanged = () => {
      if (syncingRef.current || orderSyncingRef.current) return;
      fetchFn();
    };
    window.addEventListener('order:progress:changed', handleProgressChanged);
    return () => window.removeEventListener('order:progress:changed', handleProgressChanged);
  }, [orderSyncingRef]);
};
