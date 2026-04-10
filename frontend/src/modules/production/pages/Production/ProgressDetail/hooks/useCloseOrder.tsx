import { useState, useCallback } from 'react';
import type { ProductionOrder } from '@/types/production';
import { isOrderFrozenByStatus } from '@/utils/api';

type PendingCloseOrder = {
  order: ProductionOrder;
  orderId: string;
  orderNo: string;
  orderQty: number;
  cuttingQty: number;
  minRequired: number;
  warehousingQualified: number;
  isSpecial?: boolean;
};

type UseCloseOrderParams = {
  isSupervisorOrAbove: boolean;
  message: { error: (msg: string) => void; info: (msg: string) => void; warning: (msg: string) => void; success: (msg: string) => void };
  productionOrderApi: { close: (orderId: string, source: string, remark?: string, specialClose?: boolean) => Promise<unknown> };
  fetchOrders: () => Promise<void>;
  fetchOrderDetail: (orderId: string) => Promise<ProductionOrder | null>;
  setActiveOrder: (order: ProductionOrder | null) => void;
  activeOrderId?: string | number | null;
  getCloseMinRequired: (cuttingQuantity: number) => number;
};

export const useCloseOrder = ({
  isSupervisorOrAbove,
  message,
  productionOrderApi,
  fetchOrders,
  fetchOrderDetail,
  setActiveOrder,
  activeOrderId,
  getCloseMinRequired,
}: UseCloseOrderParams) => {
  const [pendingCloseOrder, setPendingCloseOrder] = useState<PendingCloseOrder | null>(null);
  const [closeOrderLoading, setCloseOrderLoading] = useState(false);

  const handleCloseOrder = useCallback((order: ProductionOrder) => {
    if (!isSupervisorOrAbove) {
      message.error('无权限关单');
      return;
    }

    const orderId = String((order as any)?.id || '').trim();
    if (!orderId) {
      message.error('订单ID为空，无法关单');
      return;
    }

    const cuttingQty = Number((order as any)?.cuttingQuantity ?? 0) || 0;
    const minRequired = getCloseMinRequired(cuttingQty);
    const orderQty = Number((order as any)?.orderQuantity ?? 0) || 0;
    const warehousingQualified = Number((order as any)?.warehousingQualifiedQuantity ?? 0) || 0;

    const normalizedStatus = String((order as any)?.status || '').trim().toLowerCase();
    if (normalizedStatus === 'scrapped') {
      message.info('该订单已报废，无需关单');
      return;
    }

    if ((order as any)?.status === 'completed') {
      message.info('该订单已完成，无需关单');
      return;
    }

    if (isOrderFrozenByStatus(order)) {
      message.info('该订单已终态，无需关单');
      return;
    }

    const orderNo = String((order as any)?.orderNo || '').trim();

    if (minRequired <= 0 || warehousingQualified < minRequired) {
      // 未满足关单条件 → 特需关单路径，必须填写原因
      setPendingCloseOrder({ order, orderId, orderNo, orderQty, cuttingQty, minRequired, warehousingQualified, isSpecial: true });
      return;
    }

    setPendingCloseOrder({ order, orderId, orderNo, orderQty, cuttingQty, minRequired, warehousingQualified, isSpecial: false });
  }, [isSupervisorOrAbove, message, getCloseMinRequired]);

  const confirmCloseOrder = useCallback(async (remark: string) => {
    if (!pendingCloseOrder) return;
    setCloseOrderLoading(true);
    try {
      const result = await productionOrderApi.close(pendingCloseOrder.orderId, 'productionProgress', remark || undefined, pendingCloseOrder.isSpecial);
      if ((result as any)?.code !== 200) throw new Error((result as any)?.message || '关单失败');
      message.success('关单成功');
      setPendingCloseOrder(null);
      await fetchOrders();
      if (String(activeOrderId || '').trim() === pendingCloseOrder.orderId) {
        const detail = await fetchOrderDetail(pendingCloseOrder.orderId);
        if (detail) setActiveOrder(detail);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '关单失败');
    } finally {
      setCloseOrderLoading(false);
    }
  }, [pendingCloseOrder, productionOrderApi, message, fetchOrders, fetchOrderDetail, setActiveOrder, activeOrderId]);

  const cancelCloseOrder = useCallback(() => { setPendingCloseOrder(null); }, []);

  return { handleCloseOrder, pendingCloseOrder, closeOrderLoading, confirmCloseOrder, cancelCloseOrder };
};
