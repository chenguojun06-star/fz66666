import { formatDateTime } from '@/utils/datetime';
import { ProductionOrder } from '@/types/production';
import { ProgressNode } from '../types';
import { getOrderStageCompletionTimeFallback } from '../utils';
import { NODE_TYPE_MAP, getNodeColor } from './cellRendererHelpers';

export interface NodeCalculationResult {
  nodeName: string;
  nodeType: string;
  processCode: string;
  nodeLabel: string;
  isWarehousingNode: boolean;
  isProcureNode: boolean;
  completedQty: number;
  percent: number;
  remaining: number;
  completionTime: string;
  startTime: string;
  segmentProgress: number;
  nodePrimaryColor: string;
  nodeSecondaryColor: string;
  operatorDisplay: string;
  completionTimeDisplay: string;
}

export function calcNodeData(
  node: ProgressNode,
  record: ProductionOrder,
  totalQty: number,
  nodeDoneMap: Record<string, number> | undefined,
  nodeTimeMap: Record<string, string> | undefined,
  nodeWorkerNamesMap: Record<string, string[]> | undefined,
  isCompletedOrClosed: boolean,
  frozen: boolean,
): NodeCalculationResult {
  const nodeName = node.name || '-';
  const nodeType = (node.progressStage && node.progressStage.trim())
    || NODE_TYPE_MAP[nodeName]
    || nodeName.toLowerCase();
  const rawNodeId = String(node.id || '').trim();
  const processCode = (rawNodeId && !rawNodeId.includes('-')
    && !['purchase','cutting','sewing','pressing','quality','secondary-process','secondaryProcess','packaging','warehousing'].includes(rawNodeId))
    ? rawNodeId : '';
  const nodeLabel = processCode ? `${processCode} ${nodeName}` : nodeName;
  const isWarehousingNode = nodeType === 'warehousing'
    || /入库|仓库|成品仓/.test(nodeName);
  const completedQty = isWarehousingNode
    ? (Number((record as any)?.warehousingQualifiedQuantity) || 0)
    : (nodeDoneMap?.[nodeName] || 0);
  const isProcureNode = /采购|物料|备料|辅料|面料/.test(nodeName);
  const rawPercent = isProcureNode
    ? (completedQty > 0 ? 100 : 0)
    : totalQty > 0
      ? Math.min(100, Math.round((completedQty / totalQty) * 100))
      : 0;
  const percent = isCompletedOrClosed ? 100 : rawPercent;
  const remaining = totalQty - completedQty;
  const completionTime = isProcureNode
    ? ((record as any).procurementConfirmedAt
       || (record as any).procurementEndTime
       || nodeTimeMap?.[nodeName]
       || '')
     : (nodeTimeMap?.[nodeName]
       || (percent >= 100
        ? getOrderStageCompletionTimeFallback(record, nodeName, String(node.progressStage || '').trim())
        : (() => {
            const stageKey = String(node.progressStage || '').trim().toLowerCase();
            const nameKey = nodeName.toLowerCase();
            if (stageKey === 'tailprocess' || stageKey === 'tail' || nameKey.includes('尾部') || nameKey.includes('尾工')) {
              return (record as any).packagingEndTime || (record as any).ironingEndTime || '';
            }
            return '';
          })())
      );
  const startTime = isProcureNode
    ? ((record as any).procurementStartTime || '')
    : (() => {
        const stageKey = String(node.progressStage || '').trim().toLowerCase();
        const nameKey = nodeName.toLowerCase();
        if (stageKey === 'cutting' || nameKey.includes('裁剪')) return (record as any).cuttingStartTime || '';
        if (stageKey === 'sewing' || stageKey === 'carsewing' || nameKey.includes('车缝')) return (record as any).sewingStartTime || (record as any).carSewingStartTime || '';
        if (stageKey === 'secondaryprocess' || stageKey === 'secondary' || nameKey.includes('二次工艺')) return (record as any).secondaryProcessStartTime || '';
        if (stageKey === 'warehousing' || nameKey.includes('入库')) return (record as any).warehousingStartTime || '';
        if (stageKey === 'quality' || nameKey.includes('质检')) return (record as any).qualityStartTime || '';
        if (stageKey === 'tailprocess' || stageKey === 'tail' || nameKey.includes('尾部') || nameKey.includes('尾工')) return (record as any).packagingStartTime || (record as any).ironingStartTime || '';
        return '';
      })();
  const workerNames = nodeWorkerNamesMap?.[nodeName] || [];
  const operatorDisplay = workerNames.length > 0 ? workerNames.slice(0, 3).join('、') + (workerNames.length > 3 ? `等${workerNames.length}人` : '') : '';
  const completionTimeDisplay = formatDateTime(completionTime);
  const segmentProgress = Math.min(1, percent / 100);
  const nodePrimaryColor = isCompletedOrClosed ? 'var(--color-success)' : (frozen ? 'var(--color-text-tertiary)' : getNodeColor(record.expectedShipDate || record.plannedEndDate));
  const nodeSecondaryColor = isCompletedOrClosed ? '#95de64' : (frozen ? '#d1d5db' : getNodeColor(record.expectedShipDate || record.plannedEndDate, true));

  return {
    nodeName,
    nodeType,
    processCode,
    nodeLabel,
    isWarehousingNode,
    isProcureNode,
    completedQty,
    percent,
    remaining,
    completionTime,
    startTime,
    segmentProgress,
    nodePrimaryColor,
    nodeSecondaryColor,
    operatorDisplay,
    completionTimeDisplay,
  };
}

type ProcessItem = { name: string; unitPrice?: number; processCode?: string };

export function buildProcessListForNode(
  node: ProgressNode,
  record: ProductionOrder,
  ns: ProgressNode[],
  progressNodesByStyleNo: Record<string, ProgressNode[]>,
  getProcessesByNodeFromOrder: (order: ProductionOrder | null, templateNodes?: ProgressNode[]) => Record<string, ProcessItem[]>,
): { processList: { id?: string; processCode?: string; code?: string; name: string; unitPrice?: number }[]; effectiveNodeType: string } {
  const nodeName = node.name || '-';
  const nodeType = (node.progressStage && node.progressStage.trim())
    || NODE_TYPE_MAP[nodeName]
    || nodeName.toLowerCase();
  const sn = String((record as any)?.styleNo || '').trim();
  const templateNodes = sn && progressNodesByStyleNo[sn] ? progressNodesByStyleNo[sn] : undefined;
  const byParent = getProcessesByNodeFromOrder(record, templateNodes);
  const nodeProgressStage = String(node.progressStage || '').trim();
  const isSubProcessNode = nodeProgressStage && nodeProgressStage !== nodeName
    && byParent[nodeProgressStage]?.some(c => c.name === nodeName);

  let processList: { id?: string; processCode?: string; name: string; unitPrice?: number }[];
  let effectiveNodeType = nodeType;

  const rawNodeId = String(node.id || '').trim();
  const processCode = (rawNodeId && !rawNodeId.includes('-')
    && !['purchase','cutting','sewing','pressing','quality','secondary-process','secondaryProcess','packaging','warehousing'].includes(rawNodeId))
    ? rawNodeId : '';

  if (isSubProcessNode) {
    processList = [{
      name: nodeName,
      unitPrice: node.unitPrice,
      processCode: processCode || undefined,
    }];
    effectiveNodeType = nodeName;
  } else {
    let children = byParent[nodeName];
    if (!children?.length && nodeProgressStage && nodeProgressStage !== nodeName) {
      children = byParent[nodeProgressStage];
    }
    if (children?.length) {
      processList = children.map(c => ({
        name: c.name,
        unitPrice: c.unitPrice,
        processCode: c.processCode,
      }));
    } else {
      const stageChildren = ns.filter(n => {
        const ps = String((n as any).progressStage || '').trim();
        return ps === nodeName || (nodeProgressStage && ps === nodeProgressStage);
      });
      processList = stageChildren.map(n => ({
        id: String(n.id || '').trim() || undefined,
        processCode: (() => {
          const r = String(n.id || '').trim();
          return (r && !r.includes('-')
            && !['purchase','cutting','sewing','pressing','quality','secondary-process','secondaryProcess','packaging','warehousing'].includes(r))
            ? r : undefined;
        })(),
        name: n.name,
        unitPrice: n.unitPrice,
      }));
    }
  }

  return { processList, effectiveNodeType };
}
