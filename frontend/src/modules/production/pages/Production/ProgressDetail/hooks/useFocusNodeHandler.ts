import { useEffect } from 'react';
import { ProductionOrder } from '@/types/production';
import { ProgressNode } from '../types';
import { stripWarehousingNode, resolveNodesForListOrder, defaultNodes } from '../nodeParser';

type UseFocusNodeHandlerOptions = {
  pendingFocusNode: { orderNo: string; nodeName: string } | null;
  orders: ProductionOrder[];
  progressNodesByStyleNo: Record<string, ProgressNode[]>;
  boardStatsByOrder: Record<string, any>;
  boardStatsLoadingByOrder: Record<string, boolean>;
  normalizeFocusNodeName: (name: string) => string;
  getFocusNodeType: (name: string) => string;
  triggerOrderFocus: (order: ProductionOrder) => void;
  openNodeDetail: (
    order: ProductionOrder,
    type: string,
    name: string,
    stats: { done: number; total: number; percent: number; remaining: number },
    unitPrice?: number,
    processList?: { id?: string; processCode?: string; name: string; unitPrice?: number }[],
  ) => void;
  setPendingFocusNode: (node: { orderNo: string; nodeName: string } | null) => void;
};

export const useFocusNodeHandler = (options: UseFocusNodeHandlerOptions) => {
  const {
    pendingFocusNode,
    orders,
    progressNodesByStyleNo,
    boardStatsByOrder,
    boardStatsLoadingByOrder,
    normalizeFocusNodeName,
    getFocusNodeType,
    triggerOrderFocus,
    openNodeDetail,
    setPendingFocusNode,
  } = options;

  useEffect(() => {
    if (!pendingFocusNode) return;
    const targetOrder = orders.find((record) => String(record.orderNo || '').trim() === pendingFocusNode.orderNo);
    if (!targetOrder) return;

    const orderId = String(targetOrder.id || '').trim();
    if (orderId && boardStatsLoadingByOrder[orderId]) return;

    const resolvedNodes = stripWarehousingNode(resolveNodesForListOrder(targetOrder, progressNodesByStyleNo, defaultNodes));
    const matchedNode = resolvedNodes.find((node) => {
      const nodeName = normalizeFocusNodeName(String(node.name || node.progressStage || '').trim());
      const progressStageName = normalizeFocusNodeName(String(node.progressStage || '').trim());
      return nodeName === pendingFocusNode.nodeName || progressStageName === pendingFocusNode.nodeName;
    });
    const resolvedNodeName = String(matchedNode?.name || pendingFocusNode.nodeName).trim();
    const statsMap = boardStatsByOrder[orderId] || {};
    const matchedStatKey = Object.keys(statsMap).find((key) => normalizeFocusNodeName(key) === pendingFocusNode.nodeName);
    const completedQty = Number(statsMap[matchedStatKey || resolvedNodeName] || 0);
    const totalQty = Number(targetOrder.cuttingQuantity || targetOrder.orderQuantity) || 0;
    const percent = totalQty > 0 ? Math.min(100, Math.round((completedQty / totalQty) * 100)) : 0;
    const remaining = Math.max(0, totalQty - completedQty);

    triggerOrderFocus(targetOrder);
    openNodeDetail(
      targetOrder,
      String(matchedNode?.progressStage || getFocusNodeType(resolvedNodeName) || pendingFocusNode.nodeName),
      resolvedNodeName,
      { done: completedQty, total: totalQty, percent, remaining },
      matchedNode?.unitPrice,
      resolvedNodes
        .filter((node) => {
          const ps = String((node as any).progressStage || '').trim();
          return ps === resolvedNodeName;
        })
        .map((node) => ({
          id: String(node.id || '').trim() || undefined,
          processCode: String(node.id || '').trim() || undefined,
          name: node.name,
          unitPrice: node.unitPrice,
        }))
    );
    setPendingFocusNode(null);
  }, [
    boardStatsByOrder,
    boardStatsLoadingByOrder,
    defaultNodes,
    getFocusNodeType,
    normalizeFocusNodeName,
    openNodeDetail,
    orders,
    pendingFocusNode,
    progressNodesByStyleNo,
    triggerOrderFocus,
    setPendingFocusNode,
  ]);
};
