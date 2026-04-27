import { useEffect, useRef, useState } from 'react';
import type { ProductionOrder } from '@/types/production';
import { stripWarehousingNode, resolveNodesForListOrder, defaultNodes } from '../utils';
import type { ProgressNode } from '../types';
import { ensureBoardStatsForOrder } from './useBoardStats';

type UseBoardStatsRefreshParams = {
  orders: ProductionOrder[];
  progressNodesByStyleNo: Record<string, ProgressNode[]>;
  boardStatsByOrder: Record<string, any>;
  boardStatsLoadingByOrder: Record<string, boolean>;
  mergeBoardStatsForOrder: (orderId: string, stats: any) => void;
  mergeBoardTimesForOrder: (orderId: string, times: any) => void;
  setBoardLoadingForOrder: (orderId: string, loading: boolean) => void;
  mergeProcessDataForOrder: (orderId: string, stats: Record<string, number>, groups: Record<string, string[]>, times: Record<string, string>, workerCounts: Record<string, number>) => void;
};

export const useBoardStatsRefresh = ({
  orders, progressNodesByStyleNo,
  boardStatsByOrder, boardStatsLoadingByOrder,
  mergeBoardStatsForOrder, mergeBoardTimesForOrder,
  setBoardLoadingForOrder, mergeProcessDataForOrder,
}: UseBoardStatsRefreshParams) => {
  const boardStatsByOrderRef = useRef(boardStatsByOrder);
  const boardStatsLoadingByOrderRef = useRef(boardStatsLoadingByOrder);
  useEffect(() => { boardStatsByOrderRef.current = boardStatsByOrder; }, [boardStatsByOrder]);
  useEffect(() => { boardStatsLoadingByOrderRef.current = boardStatsLoadingByOrder; }, [boardStatsLoadingByOrder]);

  const [boardRefreshTick, setBoardRefreshTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setBoardRefreshTick(t => t + 1), 2 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

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
    return () => { cancelled = true; };
  }, [
    orders, progressNodesByStyleNo, boardRefreshTick,
    mergeBoardStatsForOrder, mergeBoardTimesForOrder,
    setBoardLoadingForOrder, mergeProcessDataForOrder,
  ]);

  return { boardStatsByOrderRef, boardStatsLoadingByOrderRef, boardRefreshTick };
};
