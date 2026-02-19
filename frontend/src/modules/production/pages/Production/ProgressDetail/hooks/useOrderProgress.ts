import { useCallback } from 'react';
import type { ProductionOrder } from '@/types/production';
import type { ProgressNode } from '../types';
import { clampPercent, getNodeIndexFromProgress, resolveNodesForOrder, stripWarehousingNode } from '../utils';

type UseOrderProgressParams = {
  activeOrder: ProductionOrder | null;
  fetchOrders: () => Promise<void>;
  fetchOrderDetail: (orderId: string) => Promise<ProductionOrder | null>;
  setActiveOrder: (order: ProductionOrder | null | ((prev: ProductionOrder | null) => ProductionOrder | null)) => void;
  ensureNodesFromTemplateIfNeeded: (order: ProductionOrder) => Promise<void>;
  fetchScanHistory: (order: ProductionOrder) => Promise<any>;
  progressNodesByStyleNo: Record<string, ProgressNode[]>;
  nodes: ProgressNode[];
  productionOrderApi: { updateProgress: (payload: Record<string, unknown>) => Promise<unknown> };
  message: { success: (msg: string) => void; error: (msg: string) => void };
};

export const useOrderProgress = ({
  activeOrder,
  fetchOrders,
  fetchOrderDetail,
  setActiveOrder,
  ensureNodesFromTemplateIfNeeded,
  fetchScanHistory,
  progressNodesByStyleNo,
  nodes,
  productionOrderApi,
  message,
}: UseOrderProgressParams) => {
  const updateOrderProgress = useCallback(async (
    order: ProductionOrder,
    nextProgress: number,
    opts?: { rollbackRemark?: string; rollbackToProcessName?: string }
  ) => {
    if (!order.id) return;
    try {
      const payload: any = { id: order.id, progress: clampPercent(nextProgress) };
      if (opts?.rollbackRemark) payload.rollbackRemark = opts.rollbackRemark;
      if (opts?.rollbackToProcessName) payload.rollbackToProcessName = opts.rollbackToProcessName;

      const response = await productionOrderApi.updateProgress(payload);
      const result = response as any;
      if (result.code === 200) {
        message.success('进度已更新');
        await fetchOrders();
        if (activeOrder?.id === order.id) {
          const p = clampPercent(nextProgress);
          const detail = await fetchOrderDetail(order.id);
          const nodeSource = (detail || activeOrder || order) as ProductionOrder;
          const effectiveNodes = stripWarehousingNode(resolveNodesForOrder(nodeSource, progressNodesByStyleNo, nodes));
          const idx = getNodeIndexFromProgress(effectiveNodes, p);
          const derivedName = String(effectiveNodes[idx]?.name || '').trim();
          const nextName = String(opts?.rollbackToProcessName || derivedName || '').trim();
          if (detail) {
            setActiveOrder({ ...detail, currentProcessName: nextName || (detail as any).currentProcessName });
            await ensureNodesFromTemplateIfNeeded(detail);
          } else {
            setActiveOrder((prev) => (prev ? { ...prev, productionProgress: p, currentProcessName: nextName || prev.currentProcessName } : prev));
          }
          await fetchScanHistory(detail || order);
        }
      } else {
        message.error(String(result.message || '更新进度失败'));
      }
    } catch {
      message.error('更新进度失败');
    }
  }, [
    activeOrder?.id,
    fetchOrders,
    fetchOrderDetail,
    setActiveOrder,
    ensureNodesFromTemplateIfNeeded,
    fetchScanHistory,
    progressNodesByStyleNo,
    nodes,
    productionOrderApi,
    message,
  ]);

  return { updateOrderProgress };
};
