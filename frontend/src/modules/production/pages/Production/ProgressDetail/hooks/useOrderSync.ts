import { useEffect } from 'react';
import type { ProductionOrder } from '@/types/production';

type UseOrderSyncParams = {
  fetchOrders: (options?: { silent?: boolean }) => Promise<void>;
  fetchOrderDetail: (orderId: string) => Promise<ProductionOrder | null>;
  fetchScanHistory: (order: ProductionOrder, options?: { silent?: boolean }) => Promise<void>;
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
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (orderSyncingRef.current) return;
      orderSyncingRef.current = true;
      try {
        await fetchOrders({ silent: true });
        const current = activeOrderRef.current;
        if (current?.id) {
          const detail = await fetchOrderDetail(current.id);
          if (!cancelled && detail) {
            setActiveOrder(detail);
          }
          const base = detail || current;
          if (base) {
            await fetchScanHistory(base, { silent: true });
          }
        }
      } finally {
        orderSyncingRef.current = false;
      }
    };
    void run();
    const timer = window.setInterval(run, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [fetchOrders, fetchOrderDetail, fetchScanHistory, activeOrderRef, setActiveOrder, orderSyncingRef]);
};
