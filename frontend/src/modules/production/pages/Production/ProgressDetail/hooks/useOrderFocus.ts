import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductionOrder } from '@/types/production';

export interface PendingFocusNode {
  orderNo: string;
  nodeName: string;
}

export function useOrderFocus(viewMode: string) {
  const [pendingScrollOrderId, setPendingScrollOrderId] = useState<string | null>(null);
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  const [pendingFocusNode, setPendingFocusNode] = useState<PendingFocusNode | null>(null);
  const [focusedOrderNos, setFocusedOrderNos] = useState<string[]>([]);
  const focusClearTimerRef = useRef<number | null>(null);
  const focusedOrderNosRef = useRef<string[]>([]);

  useEffect(() => {
    focusedOrderNosRef.current = focusedOrderNos;
  }, [focusedOrderNos]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (focusClearTimerRef.current) window.clearTimeout(focusClearTimerRef.current);
    };
  }, []);

  const getOrderDomKey = useCallback((record: Partial<ProductionOrder> | null | undefined) => {
    return String(record?.id || record?.orderNo || '').trim();
  }, []);

  const triggerOrderFocus = useCallback((record: Partial<ProductionOrder> | null | undefined) => {
    const key = getOrderDomKey(record);
    if (!key) return;
    setPendingScrollOrderId(key);
  }, [getOrderDomKey]);

  const normalizeFocusNodeName = useCallback((value: string) => {
    const safeValue = String(value || '').trim();
    if (!safeValue) return '';
    if (safeValue.includes('质检') || safeValue.includes('品检') || safeValue.includes('验货')) return '质检';
    if (safeValue.includes('入库') || safeValue.includes('入仓')) return '入库';
    if (safeValue.includes('包装') || safeValue.includes('打包') || safeValue.includes('后整')) return '包装';
    if (safeValue.includes('车缝') || safeValue.includes('车间')) return '车缝';
    if (safeValue.includes('裁剪') || safeValue.includes('裁床')) return '裁剪';
    return safeValue;
  }, []);

  const getFocusNodeType = useCallback((nodeName: string) => {
    const normalized = normalizeFocusNodeName(nodeName);
    if (normalized === '质检') return 'quality';
    if (normalized === '入库') return 'warehousing';
    return normalized;
  }, [normalizeFocusNodeName]);

  const clearSmartFocus = useCallback(() => {
    setFocusedOrderId(null);
    setPendingScrollOrderId(null);
  }, []);

  const scrollToFocusedOrder = useCallback((orderId: string) => {
    const safeId = orderId.replace(/"/g, '\\"');
    const selector = viewMode === 'list'
      ? `tr[data-row-key="${safeId}"]`
      : `#progress-order-card-${safeId}`;
    const node = document.querySelector(selector) as HTMLElement | null;
    if (!node) return false;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFocusedOrderId(orderId);
    if (focusClearTimerRef.current) window.clearTimeout(focusClearTimerRef.current);
    focusClearTimerRef.current = window.setTimeout(() => setFocusedOrderId(null), 2200);
    return true;
  }, [viewMode]);

  return {
    pendingScrollOrderId, setPendingScrollOrderId,
    focusedOrderId,
    pendingFocusNode, setPendingFocusNode,
    focusedOrderNos, setFocusedOrderNos,
    focusedOrderNosRef,
    getOrderDomKey, triggerOrderFocus,
    normalizeFocusNodeName, getFocusNodeType,
    clearSmartFocus, scrollToFocusedOrder,
  };
}
