import { useRef, useEffect, useCallback } from 'react';
import { useProductionBoardStore } from '@/stores';
import { hasProcurementStage, isOrderFrozenByStatus } from '@/utils/api';
import type { ProductionOrder } from '@/types/production';

export function useCardProgress() {
  const clearAllBoardCache = useProductionBoardStore((s) => s.clearAllBoardCache);
  const boardStatsByOrder = useProductionBoardStore((s) => s.boardStatsByOrder);
  const boardTimesByOrder = useProductionBoardStore((s) => s.boardTimesByOrder);
  const boardStatsLoadingByOrder = useProductionBoardStore((s) => s.boardStatsLoadingByOrder);
  const mergeBoardStatsForOrder = useProductionBoardStore((s) => s.mergeBoardStatsForOrder);
  const mergeBoardTimesForOrder = useProductionBoardStore((s) => s.mergeBoardTimesForOrder);
  const setBoardLoadingForOrder = useProductionBoardStore((s) => s.setBoardLoadingForOrder);
  const mergeProcessDataForOrder = useProductionBoardStore((s) => s.mergeProcessDataForOrder);

  // ref 版：避免放入 useEffect 依赖导致无限循环
  const boardStatsByOrderRef = useRef(boardStatsByOrder);
  const boardStatsLoadingByOrderRef = useRef(boardStatsLoadingByOrder);
  useEffect(() => { boardStatsByOrderRef.current = boardStatsByOrder; }, [boardStatsByOrder]);
  useEffect(() => { boardStatsLoadingByOrderRef.current = boardStatsLoadingByOrder; }, [boardStatsLoadingByOrder]);

  // 卡片进度：取 boardStats 实时数据与 productionProgress DB值 的较大值，
  // 但仅下单、无任何采购/裁剪/生产动作时，真实显示值必须是 0。
  const calcCardProgress = useCallback((record: ProductionOrder): number => {
    const dbProgress = Math.min(100, Math.max(0, Number(record.productionProgress) || 0));
    if (record.status === 'completed') return 100;
    if (isOrderFrozenByStatus(record)) return dbProgress;
    const orderId = String(record.id || '');
    const stats = boardStatsByOrder[orderId];
    const hasProcurementAction = Boolean(record.procurementManuallyCompleted)
      || Boolean(record.procurementConfirmedAt)
      || (Number(record.materialArrivalRate) || 0) > 0;
    const hasCuttingAction = (Number(record.cuttingCompletionRate) || 0) > 0
      || (Number(record.cuttingQuantity) || 0) > 0;
    const hasBoardAction = !!stats && Object.values(stats as Record<string, number>)
      .some((value) => (Number(value) || 0) > 0);
    const hasRealAction = hasProcurementAction || hasCuttingAction || hasBoardAction;
    if (!hasRealAction) return 0;
    if (!stats) return dbProgress;
    const total = Math.max(1, Number(record.cuttingQuantity || record.orderQuantity) || 1);
    const PIPELINE = hasProcurementStage(record as any)
      ? ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库']
      : ['裁剪', '二次工艺', '车缝', '尾部', '入库'];
    const normalizeKey = (k: string) => {
      if (k.includes('入库') || k.includes('入仓')) return '入库';
      if (k.includes('质检') || k.includes('品检') || k.includes('验货')) return '尾部';
      if (k.includes('包装') || k.includes('后整') || k.includes('打包')) return '尾部';
      if (k.includes('剪线') || k.includes('整烫') || k.includes('大烫')) return '尾部';
      if (k.includes('裁剪') || k.includes('裁床')) return '裁剪';
      if (k.includes('车缝') || k.includes('车间') || k.includes('缝制')) return '车缝';
      if (k.includes('绣花') || k.includes('印花') || k.includes('二次工艺')) return '二次工艺';
      return k;
    };
    const normMap = new Map<string, number>();
    for (const [rawKey, rawQty] of Object.entries(stats as Record<string, number>)) {
      const nk = normalizeKey(rawKey);
      const pct = Math.min(100, Math.round(Number(rawQty) / total * 100));
      if (pct > 0) normMap.set(nk, Math.max(normMap.get(nk) ?? 0, pct));
    }
    if (normMap.size === 0) return dbProgress;
    let lastIdx = -1;
    let lastPct = 0;
    for (const [nk, pct] of normMap.entries()) {
      const idx = PIPELINE.indexOf(nk);
      if (idx > lastIdx || (idx === lastIdx && pct > lastPct)) {
        lastIdx = idx;
        lastPct = pct;
      }
    }
    if (lastIdx < 0) return dbProgress;
    const perStage = 100 / PIPELINE.length;
    const boardProgress = Math.round(lastIdx * perStage + lastPct * perStage / 100);
    return Math.min(100, Math.max(dbProgress, boardProgress));
  }, [boardStatsByOrder]);

  return {
    clearAllBoardCache,
    boardStatsByOrder,
    boardTimesByOrder,
    boardStatsLoadingByOrder,
    mergeBoardStatsForOrder,
    mergeBoardTimesForOrder,
    setBoardLoadingForOrder,
    mergeProcessDataForOrder,
    boardStatsByOrderRef,
    boardStatsLoadingByOrderRef,
    calcCardProgress,
  };
}
