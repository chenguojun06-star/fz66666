import { productionScanApi } from '@/services/production/productionApi';
import type { ProductionOrder, ScanRecord } from '@/types/production';
import type { ProgressNode } from '../types';
import { getRecordStageName, stageNameMatches } from '../utils';

interface EnsureBoardStatsArgs {
  order: ProductionOrder;
  nodes: ProgressNode[];
  boardStatsByOrderRef: React.MutableRefObject<Record<string, Record<string, number>>>;
  boardStatsLoadingRef: React.MutableRefObject<Record<string, boolean>>;
  setBoardStatsByOrder: React.Dispatch<React.SetStateAction<Record<string, Record<string, number>>>>;
}

export const ensureBoardStatsForOrder = async ({
  order,
  nodes,
  boardStatsByOrderRef,
  boardStatsLoadingRef,
  setBoardStatsByOrder,
}: EnsureBoardStatsArgs) => {
  const oid = String(order?.id || '').trim();
  if (!oid) return;
  const existing = boardStatsByOrderRef.current[oid];
  if (existing && nodes.every((n) => {
    const name = String((n as Record<string, unknown>)?.name || '').trim();
    return !name || Object.prototype.hasOwnProperty.call(existing, name);
  })) {
    return;
  }
  if (boardStatsLoadingRef.current[oid]) return;
  boardStatsLoadingRef.current[oid] = true;
  try {
    const res = await productionScanApi.listByOrderId(oid, { page: 1, pageSize: 500 });
    const result = res as Record<string, unknown>;
    const records: ScanRecord[] = result?.code === 200 && Array.isArray(result?.data?.records) ? result.data.records : [];
    const valid = records
      .filter((r) => String((r as Record<string, unknown>)?.scanResult || '').trim() === 'success')
      .filter((r) => (Number((r as Record<string, unknown>)?.quantity) || 0) > 0);
    const stats: Record<string, number> = {};
    for (const n of nodes || []) {
      const nodeName = String((n as Record<string, unknown>)?.name || '').trim();
      if (!nodeName) continue;
      const done = valid
        .filter((r) => stageNameMatches(nodeName, getRecordStageName(r)))
        .reduce((acc, r) => acc + (Number((r as Record<string, unknown>)?.quantity) || 0), 0);
      stats[nodeName] = done;
    }
    const cuttingVal = Number((order as Record<string, unknown>)?.cuttingQuantity) || 0;
    if (cuttingVal > 0) {
      for (const key of Object.keys(stats)) {
        if (key.includes('裁剪')) {
          stats[key] = Math.max(stats[key] || 0, cuttingVal);
        }
      }
    }
    const procurementRate = Number((order as Record<string, unknown>)?.procurementCompletionRate) || 0;
    if (procurementRate > 0) {
      const qty = Number(order.orderQuantity) || 0;
      const doneQty = Math.floor(qty * procurementRate / 100);
      for (const key of Object.keys(stats)) {
        if (key.includes('采购')) {
          stats[key] = Math.max(stats[key] || 0, doneQty);
        }
      }
    }
    const sewingRate = Number((order as Record<string, unknown>)?.sewingCompletionRate) || 0;
    if (sewingRate > 0) {
      const qty = Number(order.orderQuantity) || 0;
      const doneQty = Math.floor(qty * sewingRate / 100);
      for (const key of Object.keys(stats)) {
        if (key.includes('缝') || key.includes('车缝') || key.includes('缝制')) {
          stats[key] = Math.max(stats[key] || 0, doneQty);
        }
      }
    }
    const ironingRate = Number((order as Record<string, unknown>)?.ironingCompletionRate) || 0;
    if (ironingRate > 0) {
      const qty = Number(order.orderQuantity) || 0;
      const doneQty = Math.floor(qty * ironingRate / 100);
      for (const key of Object.keys(stats)) {
        if (key.includes('烫') || key.includes('整烫') || key.includes('熨烫')) {
          stats[key] = Math.max(stats[key] || 0, doneQty);
        }
      }
    }
    const qualityRate = Number((order as Record<string, unknown>)?.qualityCompletionRate) || 0;
    if (qualityRate > 0) {
      const qty = Number(order.orderQuantity) || 0;
      const doneQty = Math.floor(qty * qualityRate / 100);
      for (const key of Object.keys(stats)) {
        if (key.includes('质检') || key.includes('检验') || key.includes('品检') || key.includes('验货')) {
          stats[key] = Math.max(stats[key] || 0, doneQty);
        }
      }
    }
    const packagingRate = Number((order as Record<string, unknown>)?.packagingCompletionRate) || 0;
    if (packagingRate > 0) {
      const qty = Number(order.orderQuantity) || 0;
      const doneQty = Math.floor(qty * packagingRate / 100);
      for (const key of Object.keys(stats)) {
        if (key.includes('包装') || key.includes('后整') || key.includes('打包') || key.includes('装箱')) {
          stats[key] = Math.max(stats[key] || 0, doneQty);
        }
      }
    }
    const tailRates = [ironingRate, qualityRate, packagingRate].filter((r) => r > 0);
    if (tailRates.length) {
      const tailRate = Math.min(...tailRates);
      const qty = Number(order.orderQuantity) || 0;
      const doneQty = Math.floor(qty * tailRate / 100);
      for (const key of Object.keys(stats)) {
        if (key.includes('尾部')) {
          stats[key] = Math.max(stats[key] || 0, doneQty);
        }
      }
    }
    const warehousingRate = Number((order as Record<string, unknown>)?.warehousingCompletionRate) || 0;
    if (warehousingRate > 0) {
      const qty = Number(order.orderQuantity) || 0;
      const doneQty = Math.floor(qty * warehousingRate / 100);
      for (const key of Object.keys(stats)) {
        if (key.includes('入库')) {
          stats[key] = Math.max(stats[key] || 0, doneQty);
        }
      }
    }

    setBoardStatsByOrder((prev) => ({
      ...prev,
      [oid]: stats,
    }));
  } finally {
    boardStatsLoadingRef.current[oid] = false;
  }
};
