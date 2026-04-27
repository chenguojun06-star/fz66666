import { useEffect } from 'react';
import type { ProductionOrder } from '@/types/production';

type UseScrollToOrderEffectParams = {
  pendingScrollOrderId: string | null;
  setPendingScrollOrderId: (id: string | null) => void;
  orders: ProductionOrder[];
  smartQueueOrders: ProductionOrder[];
  smartQueueFilter: string;
  getOrderDomKey: (order: ProductionOrder) => string;
  scrollToFocusedOrder: (orderId: string) => boolean;
  viewMode: string;
};

export const useScrollToOrderEffect = ({
  pendingScrollOrderId, setPendingScrollOrderId,
  orders, smartQueueOrders, smartQueueFilter,
  getOrderDomKey, scrollToFocusedOrder, viewMode,
}: UseScrollToOrderEffectParams) => {
  useEffect(() => {
    if (!pendingScrollOrderId) return;
    const currentRecords = smartQueueFilter === 'all'
      ? orders
      : smartQueueOrders;
    const exists = currentRecords.some((record) => getOrderDomKey(record) === pendingScrollOrderId);
    if (!exists) return;
    const timer = window.setTimeout(() => {
      if (scrollToFocusedOrder(pendingScrollOrderId)) {
        setPendingScrollOrderId(null);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [getOrderDomKey, orders, pendingScrollOrderId, scrollToFocusedOrder, smartQueueFilter, smartQueueOrders, viewMode]);
};
