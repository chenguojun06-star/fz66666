import { formatDateTime } from '@/utils/datetime';
import { ProductionOrder, ScanRecord, CuttingBundle } from '@/types/production';
import { ProgressNode } from './types';
import { defaultNodes, stripWarehousingNode, resolveNodesForOrder } from './nodeParser';
import { getRecordStageName, stageNameMatches } from './stageResolver';

export const clampPercent = (value: number) => {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

export const formatTime = (value?: string) => formatDateTime(value);

export const getOrderShipTime = (order: ProductionOrder) => {
  return order.actualEndDate || order.plannedEndDate || '';
};

export const getNodeIndexFromProgress = (nodes: ProgressNode[], progress: number) => {
  if (nodes.length <= 1) return 0;
  const idx = Math.round((clampPercent(progress) / 100) * (nodes.length - 1));
  return Math.max(0, Math.min(nodes.length - 1, idx));
};

export const getCloseMinRequired = (cuttingQuantity: number) => {
  const cq = Number(cuttingQuantity ?? 0);
  if (!Number.isFinite(cq) || cq <= 0) return 0;
  return Math.ceil(cq * 0.9);
};

export const getCurrentWorkflowNodeForOrder = (
  order: ProductionOrder | null,
  progressNodesByStyleNo: Record<string, ProgressNode[]>,
  nodes: ProgressNode[],
  fallbackNodes: ProgressNode[],
): ProgressNode => {
  const ns = stripWarehousingNode(resolveNodesForOrder(order, progressNodesByStyleNo, nodes));
  const progress = Number(order?.productionProgress) || 0;
  const idx = getNodeIndexFromProgress(ns, progress);
  let picked: ProgressNode | undefined = ns[idx] || ns[0];
  if (!picked || !String(picked?.name || '').trim()) {
    picked = ns.find((n) => String(n?.name || '').trim()) || fallbackNodes.find((n) => String(n?.name || '').trim());
  }
  if (!picked) {
    return { id: '', name: '', unitPrice: 0 } as ProgressNode;
  }
  return picked;
};

export const calculateProgressFromBundles = (
  order: ProductionOrder,
  cuttingBundles: CuttingBundle[],
  scanHistory: ScanRecord[],
  nodes?: ProgressNode[],
): number => {
  const oid = String(order?.id || '').trim();
  const ono = String(order?.orderNo || '').trim();
  const bundlesForOrder = (cuttingBundles || []).filter(
    (b) => String(b?.productionOrderId || '').trim() === oid || String(b?.productionOrderNo || '').trim() === ono
  );
  if (!bundlesForOrder.length) {
    return Number(order.productionProgress) || 0;
  }

  const effectiveNodes = stripWarehousingNode(Array.isArray(nodes) && nodes.length ? nodes : defaultNodes);
  if (effectiveNodes.length <= 1) {
    return Number(order.productionProgress) || 0;
  }

  const nodeCompletion = effectiveNodes.map((node) => {
    const nodeName = node.name;
    const totalQtyForNode = bundlesForOrder.reduce((acc, bundle) => acc + (Number(bundle?.quantity) || 0), 0);

    const doneQtyForNode = scanHistory
      .filter((r) => String(r?.scanResult || '').trim() === 'success')
      .filter((r) => stageNameMatches(nodeName, getRecordStageName(r)))
      .reduce((acc, r) => acc + (Number(r?.quantity) || 0), 0);

    const completionRate = totalQtyForNode > 0 ? doneQtyForNode / totalQtyForNode : 0;
    return { nodeName, completionRate };
  });

  let totalProgress = 0;
  const nodeWeight = 100 / effectiveNodes.length;

  for (let i = 0; i < nodeCompletion.length; i++) {
    const { completionRate } = nodeCompletion[i];
    if (completionRate >= 0.98) {
      totalProgress += nodeWeight;
    } else {
      totalProgress += nodeWeight * completionRate;
      break;
    }
  }

  return clampPercent(totalProgress);
};

export { defaultNodes, stripWarehousingNode } from './nodeParser';
export { getRecordStageName, stageNameMatches } from './stageResolver';
export {
  setDynamicParentMapping,
  getDynamicParentMapping,
  normalizeStageKey,
  isQualityStageKey,
  isCuttingStageKey,
  isProductionStageKey,
  isSewingStageKey,
  isIroningStageKey,
  isPackagingStageKey,
  isShipmentStageKey,
  isWarehouseStageKey,
  canonicalStageKey,
  resolveDynamicParent,
  isSecondaryProcessSubNode,
  getOrderStageCompletionTimeFallback,
  findPricingProcessForStage,
} from './stageResolver';
export {
  parseProgressNodes,
  parseWorkflowNodesFromOrder,
  resolveNodesForOrder,
  collapseSecondaryProcessNodes,
  resolveNodesForListOrder,
  getProcessesByNodeFromOrder,
} from './nodeParser';
