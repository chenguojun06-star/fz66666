import { useEffect, useRef } from 'react';
import { ProductionOrder } from '@/types/production';
import { ProgressNode } from '../types';
import { stripWarehousingNode, resolveNodesForListOrder, defaultNodes } from '../nodeParser';
import { ensureBoardStatsForOrder } from './useBoardStats';

type UseBoardStatsInitOptions = {
  orders: ProductionOrder[];
  progressNodesByStyleNo: Record<string, ProgressNode[]>;
  boardStatsByOrder: Record<string, any>;
  boardStatsLoadingByOrder: Record<string, boolean>;
  mergeBoardStatsForOrder: (orderId: string, stats: Record<string, number> | null) => void;
  mergeBoardTimesForOrder: (orderId: string, times: Record<string, string>) => void;
  setBoardLoadingForOrder: (orderId: string, loading: boolean) => void;
  mergeProcessDataForOrder: (
    orderId: string,
    stats: Record<string, number>,
    groups: Record<string, string[]>,
    times: Record<string, string>,
    workerCounts: Record<string, number>,
  ) => void;
  boardRefreshTick: number;
};

export const useBoardStatsInit = (options: UseBoardStatsInitOptions) => {
  const {
    orders,
    progressNodesByStyleNo,
    boardStatsByOrder,
    boardStatsLoadingByOrder,
    mergeBoardStatsForOrder,
    mergeBoardTimesForOrder,
    setBoardLoadingForOrder,
    mergeProcessDataForOrder,
    boardRefreshTick,
  } = options;

  const boardStatsByOrderRef = useRef(boardStatsByOrder);
  const boardStatsLoadingByOrderRef = useRef(boardStatsLoadingByOrder);
  useEffect(() => { boardStatsByOrderRef.current = boardStatsByOrder; }, [boardStatsByOrder]);
  useEffect(() => { boardStatsLoadingByOrderRef.current = boardStatsLoadingByOrder; }, [boardStatsLoadingByOrder]);

  useEffect(() => {
    if (!orders.length) return;
    const queue = orders.slice(0, Math.min(20, orders.length));
    let cancelled = false;
    const run = async () => {
      for (const o of queue) {
        if (cancelled) return;
        const ns = stripWarehousingNode(resolveNodesForListOrder(o, progressNodesByStyleNo, defaultNodes));
        const cpcMap: Record<string, number> = {};
        for (const s of ns) {
          const parent = String(s.progressStage || s.name || '').trim();
          if (parent) cpcMap[parent] = (cpcMap[parent] || 0) + 1;
        }
        await ensureBoardStatsForOrder({
          order: o,
          nodes: ns,
          childProcessCountByNode: Object.keys(cpcMap).length > 0 ? cpcMap : undefined,
          boardStatsByOrder: boardStatsByOrderRef.current,
          boardStatsLoadingByOrder: boardStatsLoadingByOrderRef.current,
          mergeBoardStatsForOrder,
          mergeBoardTimesForOrder,
          setBoardLoadingForOrder,
          mergeProcessDataForOrder,
        });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    orders,
    progressNodesByStyleNo,
    boardRefreshTick,
    mergeBoardStatsForOrder,
    mergeBoardTimesForOrder,
    setBoardLoadingForOrder,
    mergeProcessDataForOrder,
  ]);

  return { boardStatsByOrderRef, boardStatsLoadingByOrderRef };
};
