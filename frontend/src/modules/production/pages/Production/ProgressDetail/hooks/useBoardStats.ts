import { productionScanApi, materialPurchaseApi, processParentMappingApi } from '@/services/production/productionApi';
import type { ProductionOrder, ScanRecord } from '@/types/production';
import type { ProgressNode } from '../types';
import { getRecordStageName, stageNameMatches, getDynamicParentMapping, setDynamicParentMapping } from '../utils';

interface EnsureBoardStatsArgs {
  order: ProductionOrder;
  nodes: ProgressNode[];
  /** 每个父节点下期望的子工序数量，用于正确平均计算（如 { "尾部": 3, "车缝": 1 }） */
  childProcessCountByNode?: Record<string, number>;
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
  childProcessCountByNode,
  boardStatsByOrder,
  boardStatsLoadingByOrder,
  mergeBoardStatsForOrder,
  mergeBoardTimesForOrder,
  setBoardLoadingForOrder,
  mergeProcessDataForOrder,
}: EnsureBoardStatsArgs) => {
  const oid = String(order?.id || '').trim();
  if (!oid) return;

  // ── 懒加载动态映射（全局只请求一次） ──
  if (!getDynamicParentMapping()) {
    try {
      const res = await processParentMappingApi.list();
      const data = (res as any)?.data?.data ?? (res as any)?.data ?? {};
      if (data && typeof data === 'object') {
        setDynamicParentMapping(data);
      }
    } catch { /* 加载失败不影响功能，静态匹配仍然生效 */ }
  }

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
    const recordMatchesNode = (node: ProgressNode, r: Record<string, unknown>) => {
      const nName = String((node as any)?.name || '').trim();
      const rStageName = getRecordStageName(r);
      const rProcessName = String((r as any)?.processName || '').trim();
      // 原有：通过 progressStage 别名匹配（大烫→整烫等）
      if (stageNameMatches(nName, rStageName)) return true;
      if (stageNameMatches(nName, rProcessName)) return true;
      // 新增：processName 与节点名原始精确相等（处理 stageNameMatches canonicalKey 不认识的自定义词汇）
      if (rProcessName && rProcessName === nName) return true;
      // 新增：通过父分类（node.progressStage）兜底——父分类相同时再次尝试子工序名匹配
      // 解决模板改工序名后旧数据失配的问题（progressStage父分类不变但子工序名变了）
      const nodeParent = String((node as any)?.progressStage || '').trim();
      if (nodeParent && stageNameMatches(nodeParent, rStageName)) {
        if (stageNameMatches(nName, rProcessName) || rProcessName === nName) return true;
      }
      return false;
    };
    const stats: Record<string, number> = {};
    const hasScanByNode: Record<string, boolean> = {};
    for (const n of nodes || []) {
      const nodeName = String((n as any)?.name || '').trim();
      if (!nodeName) continue;
      const matchingRecords = valid.filter((r) => recordMatchesNode(n as ProgressNode, r));
      // 父节点子工序平均聚合：
      // 一个父节点（如"尾部"）可能包含多个子工序（剪线/质检/整烫），
      // 同一菲号的每个子工序各产生一条扫码记录。
      // 如果直接 maxByBundle，扫完一个子工序就显示 100%（虚高）。
      // 正确做法：按 processName 分组，每组独立 maxByBundle 去重，
      // 再将各组的物理完成件数求和 ÷ 期望子工序数 → 平均完成件数。
      //
      // 期望子工序数来源（按优先级）：
      // 1. childProcessCountByNode（来自款式模板 progressNodesByStyleNo）
      // 2. 扫码记录中实际出现的 distinct processName 数量
      // 3. 兜底 = 1（单工序节点，行为与之前一致）
      const byProcess = new Map<string, typeof matchingRecords>();
      for (const r of matchingRecords) {
        const procName = String((r as any)?.processName || '').trim() || '__self__';
        if (!byProcess.has(procName)) byProcess.set(procName, []);
        byProcess.get(procName)!.push(r);
      }
      // 每个子工序组独立 maxByBundle 去重
      let totalProcessDone = 0;
      for (const [, procRecords] of byProcess) {
        const maxByBundle = new Map<string, number>();
        let procNonBundleSum = 0;
        for (const r of procRecords) {
          const bundleId = String((r as any)?.cuttingBundleId || '').trim();
          const qty = Number((r as any)?.quantity) || 0;
          if (bundleId) {
            const prev = maxByBundle.get(bundleId) ?? 0;
            if (qty > prev) maxByBundle.set(bundleId, qty);
          } else {
            procNonBundleSum += qty;
          }
        }
        let procDone = procNonBundleSum;
        maxByBundle.forEach((q) => { procDone += q; });
        totalProcessDone += procDone;
      }
      // 确定期望子工序数（>1 时需要平均）
      const expectedCount = childProcessCountByNode?.[nodeName]
        || Math.max(1, byProcess.size);
      stats[nodeName] = Math.round(totalProcessDone / expectedCount);
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
        const matchingRecords = valid.filter((r) => recordMatchesNode(n as ProgressNode, r));
        // 找到最大的 scanTime（即最后一次扫码时间 = 完成时间）
        // ★ Bug5修复：scanTime 可能为 null（旧数据），兜底读 createTime
        let maxTime = '';
        for (const r of matchingRecords) {
          const t = String((r as any)?.scanTime || (r as any)?.createTime || '');
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
        const t = String((r as any)?.scanTime || (r as any)?.createTime || '').trim();
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
