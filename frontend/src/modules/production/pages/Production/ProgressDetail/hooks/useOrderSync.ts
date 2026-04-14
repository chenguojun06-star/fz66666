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

export const useOrderSync = ({
  fetchOrders,
  fetchOrderDetail,
  fetchScanHistory,
  activeOrderRef,
  setActiveOrder,
  orderSyncingRef,
}: UseOrderSyncParams) => {
  const fetchOrdersRef = useRef(fetchOrders);
  const fetchOrderDetailRef = useRef(fetchOrderDetail);
  const fetchScanHistoryRef = useRef(fetchScanHistory);
  const syncingRef = useRef(false);

  useEffect(() => {
    fetchOrdersRef.current = fetchOrders;
  }, [fetchOrders]);

  useEffect(() => {
    fetchOrderDetailRef.current = fetchOrderDetail;
  }, [fetchOrderDetail]);

  useEffect(() => {
    fetchScanHistoryRef.current = fetchScanHistory;
  }, [fetchScanHistory]);

  useEffect(() => {
    const run = async (detail?: string) => {
      if (syncingRef.current || orderSyncingRef.current) return;
      syncingRef.current = true;
      try {
        await fetchOrdersRef.current({ silent: true });
        if (detail && activeOrderRef.current?.id) {
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
    };

    const timer = window.setInterval(() => run(), 30000);

    const handleProgressChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const orderNo = detail?.orderNo;
      if (orderNo && activeOrderRef.current?.orderNo === orderNo) {
        run(orderNo);
      } else {
        run();
      }
    };
    window.addEventListener('order:progress:changed', handleProgressChanged);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('order:progress:changed', handleProgressChanged);
    };
  }, [orderSyncingRef, activeOrderRef, setActiveOrder]);
};
