import { productionScanApi, materialPurchaseApi } from '@/services/production/productionApi';
import type { ProductionOrder, ScanRecord } from '@/types/production';
import type { ProgressNode } from '../types';
import { getRecordStageName, stageNameMatches } from '../utils';

interface EnsureBoardStatsArgs {
  order: ProductionOrder;
  nodes: ProgressNode[];
  boardStatsByOrder: Record<string, Record<string, number> | null>;
  boardStatsLoadingByOrder: Record<string, boolean>;
  mergeBoardStatsForOrder: (orderId: string, stats: Record<string, number> | null) => void;
  mergeBoardTimesForOrder?: (orderId: string, times: Record<string, string>) => void;
  setBoardLoadingForOrder: (orderId: string, loading: boolean) => void;
  /** 可选：按 processName 聚合子工序粒度数据 */
  mergeProcessDataForOrder?: (
    orderId: string,
    stats: Record<string, number>,
    groups: Record<string, string[]>,
    times: Record<string, string>,
  ) => void;
}

const loadAllOrderScans = async (orderId: string): Promise<ScanRecord[]> => {
  const pageSize = 500;
  const maxPages = 50;
  const all: ScanRecord[] = [];
  let page = 1;

  while (page <= maxPages) {
    const res = await productionScanApi.listByOrderId(orderId, { page, pageSize });
    const result = res as any;
    const records: ScanRecord[] = result?.code === 200 && Array.isArray(result?.data?.records)
      ? result.data.records
      : [];

    if (!records.length) break;
    all.push(...records);

    if (records.length < pageSize) break;
    page += 1;
  }

  return all;
};

export const ensureBoardStatsForOrder = async ({
  order,
  nodes,
  boardStatsByOrder,
  boardStatsLoadingByOrder,
  mergeBoardStatsForOrder,
  mergeBoardTimesForOrder,
  setBoardLoadingForOrder,
  mergeProcessDataForOrder,
}: EnsureBoardStatsArgs) => {
  const oid = String(order?.id || '').trim();
  if (!oid) return;
  const existing = boardStatsByOrder[oid];
  // null = 已请求但 API 失败，不再重试；有数据且含全部节点 = 缓存命中
  if (existing === null) return;
  if (existing && nodes.every((n) => {
    const name = String((n as any)?.name || '').trim();
    return !name || Object.prototype.hasOwnProperty.call(existing, name);
  })) {
    return;
  }
  if (boardStatsLoadingByOrder[oid]) return;
  setBoardLoadingForOrder(oid, true);
  try {
    const records: ScanRecord[] = await loadAllOrderScans(oid);
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

    // === 采购节点：从采购模块获取真实到货数据 ===
    const PROCUREMENT_NODE_NAMES = new Set(['采购', '物料', '备料']);
    const hasProcureNode = (nodes || []).some((n) => PROCUREMENT_NODE_NAMES.has(String((n as any)?.name || '').trim()));
    let procureArrived = 0;
    let procureArrivalTime = '';
    const orderNo = String((order as any)?.orderNo || '').trim();
    if (hasProcureNode && orderNo) {
      try {
        const purchaseRes = await materialPurchaseApi.listByOrderNo(orderNo);
        const purchaseRecords: unknown[] = (purchaseRes as any)?.code === 200
          ? ((purchaseRes as any)?.data?.records ?? [])
          : [];
        for (const pr of purchaseRecords) {
          procureArrived += Number((pr as any)?.arrivedQuantity) || 0;
          // actualArrivalDate 全部到货时写入；部分到货时用 receivedTime（领取时间）兑雅
          const at = String((pr as any)?.actualArrivalDate || (pr as any)?.receivedTime || '').trim();
          if (at && (!procureArrivalTime || at > procureArrivalTime)) procureArrivalTime = at;
        }
      } catch { /* 采购接口失败，保持扫码数据不变 */ }
    }
    // 将采购到货数写入 stats（扫码记录有数据优先）
    for (const n of nodes || []) {
      const nodeName = String((n as any)?.name || '').trim();
      if (!PROCUREMENT_NODE_NAMES.has(nodeName)) continue;
      if (!hasScanByNode[nodeName] && procureArrived > 0) {
        stats[nodeName] = procureArrived;
      }
    }

    mergeBoardStatsForOrder(oid, stats);

    // 计算每个工序节点的最后完成时间（用于进度球下方显示）
    if (mergeBoardTimesForOrder) {
      const timeStats: Record<string, string> = {};
      for (const n of nodes || []) {
        const nodeName = String((n as any)?.name || '').trim();
        if (!nodeName) continue;
        const matchingRecords = valid.filter((r) => recordMatchesNode(nodeName, r));
        // 找到最大的 scanTime（即最后一次扫码时间 = 完成时间）
        let maxTime = '';
        for (const r of matchingRecords) {
          const t = String((r as any)?.scanTime || '');
          if (t && (!maxTime || t > maxTime)) maxTime = t;
        }
        // 采购节点时间：无扫码时用 actualArrivalDate
        if (!maxTime && PROCUREMENT_NODE_NAMES.has(nodeName) && procureArrivalTime) {
          maxTime = procureArrivalTime;
        }
        if (maxTime) timeStats[nodeName] = maxTime;
      }
      mergeBoardTimesForOrder(oid, timeStats);
    }

    // 额外聚合：按 processName 建子工序维度（悬停卡展示真实扫码工序，不依赖节点配置）
    if (mergeProcessDataForOrder) {
      const pStats: Record<string, number> = {};
      const pGroups: Record<string, string[]> = {};  // progressStage → processName[]
      const pTimes: Record<string, string> = {};
      for (const r of valid) {
        const pName = String((r as any)?.processName || '').trim();
        if (!pName) continue;
        const pStage = String((r as any)?.progressStage || getRecordStageName(r)).trim();
        pStats[pName] = (pStats[pName] || 0) + (Number((r as any)?.quantity) || 0);
        if (pStage) {
          if (!pGroups[pStage]) pGroups[pStage] = [];
          if (!pGroups[pStage].includes(pName)) pGroups[pStage].push(pName);
        }
        const t = String((r as any)?.scanTime || '').trim();
        if (t && (!pTimes[pName] || t > pTimes[pName])) pTimes[pName] = t;
      }
      mergeProcessDataForOrder(oid, pStats, pGroups, pTimes);
    }
  } catch {
    // API 失败时写入 null 标记，防止无限重试（例如云端 DB 缺列导致 500）
    mergeBoardStatsForOrder(oid, null);
  } finally {
    setBoardLoadingForOrder(oid, false);
  }
};
