import { productionScanApi } from '@/services/production/productionApi';
import type { ProductionOrder, ScanRecord } from '@/types/production';
import type { ProgressNode } from '../types';
import { getRecordStageName, stageNameMatches } from '../utils';

interface EnsureBoardStatsArgs {
  order: ProductionOrder;
  nodes: ProgressNode[];
  boardStatsByOrder: Record<string, Record<string, number>>;
  boardStatsLoadingByOrder: Record<string, boolean>;
  mergeBoardStatsForOrder: (orderId: string, stats: Record<string, number>) => void;
  mergeBoardTimesForOrder?: (orderId: string, times: Record<string, string>) => void;
  setBoardLoadingForOrder: (orderId: string, loading: boolean) => void;
}

export const ensureBoardStatsForOrder = async ({
  order,
  nodes,
  boardStatsByOrder,
  boardStatsLoadingByOrder,
  mergeBoardStatsForOrder,
  mergeBoardTimesForOrder,
  setBoardLoadingForOrder,
}: EnsureBoardStatsArgs) => {
  const oid = String(order?.id || '').trim();
  if (!oid) return;
  const existing = boardStatsByOrder[oid];
  if (existing && nodes.every((n) => {
    const name = String((n as any)?.name || '').trim();
    return !name || Object.prototype.hasOwnProperty.call(existing, name);
  })) {
    return;
  }
  if (boardStatsLoadingByOrder[oid]) return;
  setBoardLoadingForOrder(oid, true);
  try {
    const res = await productionScanApi.listByOrderId(oid, { page: 1, pageSize: 1000 });
    const result = res as any;
    const records: ScanRecord[] = result?.code === 200 && Array.isArray(result?.data?.records) ? result.data.records : [];
    const valid = records
      .filter((r) => String((r as any)?.scanResult || '').trim() === 'success')
      .filter((r) => (Number((r as any)?.quantity) || 0) > 0);
    // 匹配扫码记录到节点：同时检查 progressStage（父节点）和 processName（子工序名）
    const recordMatchesNode = (nodeName: string, r: Record<string, unknown>) =>
      stageNameMatches(nodeName, getRecordStageName(r)) ||
      stageNameMatches(nodeName, String((r as any)?.processName || '').trim());
    const stats: Record<string, number> = {};
    const hasScanByNode: Record<string, boolean> = {};
    for (const n of nodes || []) {
      const nodeName = String((n as any)?.name || '').trim();
      if (!nodeName) continue;
      const matchingRecords = valid.filter((r) => recordMatchesNode(nodeName, r));
      const done = matchingRecords.reduce((acc, r) => acc + (Number((r as any)?.quantity) || 0), 0);
      stats[nodeName] = done;
      hasScanByNode[nodeName] = matchingRecords.length > 0;
    }
    const cuttingVal = Number((order as any)?.cuttingQuantity) || 0;
    // 统一基准数量：优先使用裁剪数量（实际生产数量），回退到订单数量
    const baseQty = cuttingVal || Number(order.orderQuantity) || 0;
    if (cuttingVal > 0) {
      for (const key of Object.keys(stats)) {
        if (key.includes('裁剪')) {
          stats[key] = Math.max(stats[key] || 0, cuttingVal);
        }
      }
    }
    const procurementRate = Number((order as any)?.procurementCompletionRate) || 0;
    if (procurementRate > 0) {
      const doneQty = Math.floor(baseQty * procurementRate / 100);
      for (const key of Object.keys(stats)) {
        if (key.includes('采购') && !hasScanByNode[key]) {
          stats[key] = Math.max(stats[key] || 0, doneQty);
        }
      }
    }
    const sewingRate = Number((order as any)?.sewingCompletionRate) || 0;
    if (sewingRate > 0) {
      const doneQty = Math.floor(baseQty * sewingRate / 100);
      for (const key of Object.keys(stats)) {
        if ((key.includes('缝') || key.includes('车缝') || key.includes('缝制')) && !hasScanByNode[key]) {
          stats[key] = Math.max(stats[key] || 0, doneQty);
        }
      }
    }
    const ironingRate = Number((order as any)?.ironingCompletionRate) || 0;
    if (ironingRate > 0) {
      const doneQty = Math.floor(baseQty * ironingRate / 100);
      for (const key of Object.keys(stats)) {
        if ((key.includes('烫') || key.includes('整烫') || key.includes('熨烫')) && !hasScanByNode[key]) {
          stats[key] = Math.max(stats[key] || 0, doneQty);
        }
      }
    }
    const qualityRate = Number((order as any)?.qualityCompletionRate) || 0;
    if (qualityRate > 0) {
      const doneQty = Math.floor(baseQty * qualityRate / 100);
      for (const key of Object.keys(stats)) {
        if ((key.includes('质检') || key.includes('检验') || key.includes('品检') || key.includes('验货')) && !hasScanByNode[key]) {
          stats[key] = Math.max(stats[key] || 0, doneQty);
        }
      }
    }
    const packagingRate = Number((order as any)?.packagingCompletionRate) || 0;
    if (packagingRate > 0) {
      const doneQty = Math.floor(baseQty * packagingRate / 100);
      for (const key of Object.keys(stats)) {
        if ((key.includes('包装') || key.includes('后整') || key.includes('打包') || key.includes('装箱')) && !hasScanByNode[key]) {
          stats[key] = Math.max(stats[key] || 0, doneQty);
        }
      }
    }
    const tailRates = [ironingRate, qualityRate, packagingRate].filter((r) => r > 0);
    if (tailRates.length) {
      const tailRate = Math.min(...tailRates);
      const doneQty = Math.floor(baseQty * tailRate / 100);
      for (const key of Object.keys(stats)) {
        if (key.includes('尾部') && !hasScanByNode[key]) {
          stats[key] = Math.max(stats[key] || 0, doneQty);
        }
      }
    }
    const warehousingRate = Number((order as any)?.warehousingCompletionRate) || 0;
    if (warehousingRate > 0) {
      const doneQty = Math.floor(baseQty * warehousingRate / 100);
      for (const key of Object.keys(stats)) {
        if (key.includes('入库') && !hasScanByNode[key]) {
          stats[key] = Math.max(stats[key] || 0, doneQty);
        }
      }
    }

    mergeBoardStatsForOrder(oid, stats);

    // 计算每个工序节点的最后完成时间（用于进度球下方显示）
    if (mergeBoardTimesForOrder) {
      const timeStats: Record<string, string> = {};
      for (const n of nodes || []) {
        const nodeName = String((n as any)?.name || '').trim();
        if (!nodeName) continue;
        const matchingRecords = valid
          .filter((r) => recordMatchesNode(nodeName, r));
        // 找到最大的 scanTime（即最后一次扫码时间 = 完成时间）
        let maxTime = '';
        for (const r of matchingRecords) {
          const t = String((r as any)?.scanTime || '');
          if (t && (!maxTime || t > maxTime)) {
            maxTime = t;
          }
        }
        if (maxTime) timeStats[nodeName] = maxTime;
      }
      // 补充订单级别的时间字段作为回退
      const timeFieldMap: Record<string, string> = {
        '采购': 'procurementEndTime', '物料': 'procurementEndTime', '备料': 'procurementEndTime',
        '裁剪': 'cuttingEndTime', '裁床': 'cuttingEndTime', '剪裁': 'cuttingEndTime', '开裁': 'cuttingEndTime',
        '缝制': 'sewingEndTime', '车缝': 'sewingEndTime', '缝纫': 'sewingEndTime', '车工': 'sewingEndTime',
        '质检': 'qualityEndTime', '检验': 'qualityEndTime', '品检': 'qualityEndTime', '验货': 'qualityEndTime',
        '入库': 'warehousingEndTime', '仓库': 'warehousingEndTime',
      };
      for (const key of Object.keys(stats)) {
        if (!timeStats[key]) {
          const field = timeFieldMap[key];
          if (field) {
            const val = String((order as any)?.[field] || '');
            if (val) timeStats[key] = val;
          }
        }
      }
      mergeBoardTimesForOrder(oid, timeStats);
    }
  } finally {
    setBoardLoadingForOrder(oid, false);
  }
};
