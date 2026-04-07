import { useState, useCallback, useRef, useEffect } from 'react';
import type { ProductionOrder } from '@/types/production';

export function useOrderFocus(
  viewMode: string,
  sortedProductionList: ProductionOrder[],
) {
  const [pendingScrollOrderId, setPendingScrollOrderId] = useState<string | null>(null);
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  const focusClearTimerRef = useRef<number | null>(null);

  const getOrderDomKey = useCallback((record: Partial<ProductionOrder> | null | undefined) => {
    return String(record?.id || record?.orderNo || '').trim();
  }, []);

  const triggerOrderFocus = useCallback((record: Partial<ProductionOrder> | null | undefined) => {
    const key = getOrderDomKey(record);
    if (!key) return;
    setPendingScrollOrderId(key);
  }, [getOrderDomKey]);

  const clearSmartFocus = useCallback(() => {
    setFocusedOrderId(null);
    setPendingScrollOrderId(null);
  }, []);

  const scrollToFocusedOrder = useCallback((orderId: string) => {
    const safeId = orderId.replace(/"/g, '\\"');
    const selector = viewMode === 'list'
      ? `tr[data-row-key="${safeId}"]`
      : `#production-order-card-${safeId}`;
    const node = document.querySelector(selector) as HTMLElement | null;
    if (!node) return false;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFocusedOrderId(orderId);
    if (focusClearTimerRef.current) window.clearTimeout(focusClearTimerRef.current);
    focusClearTimerRef.current = window.setTimeout(() => setFocusedOrderId(null), 2200);
    return true;
  }, [viewMode]);

  // 清除定时器
  useEffect(() => {
    return () => {
      if (focusClearTimerRef.current) window.clearTimeout(focusClearTimerRef.current);
    };
  }, []);

  // 待滚动时执行滚动
  useEffect(() => {
    if (!pendingScrollOrderId) return;
    const exists = sortedProductionList.some((record) => getOrderDomKey(record) === pendingScrollOrderId);
    if (!exists) return;
    const timer = window.setTimeout(() => {
      if (scrollToFocusedOrder(pendingScrollOrderId)) {
        setPendingScrollOrderId(null);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [getOrderDomKey, pendingScrollOrderId, scrollToFocusedOrder, sortedProductionList, viewMode]);

  return {
    focusedOrderId,
    pendingScrollOrderId,
    getOrderDomKey,
    triggerOrderFocus,
    clearSmartFocus,
    scrollToFocusedOrder,
  };
}
