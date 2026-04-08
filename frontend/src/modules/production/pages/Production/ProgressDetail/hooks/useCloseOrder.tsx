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
};

type UseCloseOrderParams = {
  isSupervisorOrAbove: boolean;
  message: { error: (msg: string) => void; info: (msg: string) => void; warning: (msg: string) => void; success: (msg: string) => void };
  productionOrderApi: { close: (orderId: string, source: string, remark?: string) => Promise<unknown> };
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

    if (minRequired <= 0) {
      message.warning('裁剪数量异常，无法关单');
      return;
    }

    if (warehousingQualified < minRequired) {
      message.warning(`关单条件未满足：合格入库${warehousingQualified}/${minRequired}（裁剪${cuttingQty}，允许差异10%）`);
      return;
    }

    const orderNo = String((order as any)?.orderNo || '').trim();
    setPendingCloseOrder({ order, orderId, orderNo, orderQty, cuttingQty, minRequired, warehousingQualified });
  }, [isSupervisorOrAbove, message, getCloseMinRequired]);

  const confirmCloseOrder = useCallback(async (remark: string) => {
    if (!pendingCloseOrder) return;
    setCloseOrderLoading(true);
    try {
      const result = await productionOrderApi.close(pendingCloseOrder.orderId, 'productionProgress', remark || undefined);
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
