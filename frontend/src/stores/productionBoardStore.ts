import { create } from 'zustand';

// null 表示「已请求但 API 失败」，用于防止无限重试
type BoardStatsByOrder = Record<string, Record<string, number> | null>;
type BoardTimesByOrder = Record<string, Record<string, string>>;

interface ProductionBoardState {
  boardStatsByOrder: BoardStatsByOrder;
  boardTimesByOrder: BoardTimesByOrder;
  boardStatsLoadingByOrder: Record<string, boolean>;
  /** 子工序粒度：processName → qty（直接从 processName 字段聚合，不经过节点匹配） */
  processStatsByOrder: Record<string, Record<string, number>>;
  /** 子工序归属：progressStage → processName[]（用于按父工序分组展示） */
  processGroupsByOrder: Record<string, Record<string, string[]>>;
  /** 子工序最后扫码时间：processName → lastScanTime */
  processTimesByOrder: Record<string, Record<string, string>>;
  mergeBoardStatsForOrder: (orderId: string, stats: Record<string, number> | null) => void;
  mergeBoardTimesForOrder: (orderId: string, times: Record<string, string>) => void;
  setBoardLoadingForOrder: (orderId: string, loading: boolean) => void;
  mergeProcessDataForOrder: (
    orderId: string,
    stats: Record<string, number>,
    groups: Record<string, string[]>,
    times: Record<string, string>,
  ) => void;
  clearAllBoardCache: () => void;
}

export const useProductionBoardStore = create<ProductionBoardState>()((set) => ({
  boardStatsByOrder: {},
  boardTimesByOrder: {},
  boardStatsLoadingByOrder: {},
  processStatsByOrder: {},
  processGroupsByOrder: {},
  processTimesByOrder: {},
  mergeBoardStatsForOrder: (orderId, stats) => {
    const oid = String(orderId || '').trim();
    if (!oid) return;
    set((state) => ({
      boardStatsByOrder: {
        ...state.boardStatsByOrder,
        [oid]: stats,  // null = 已请求但失败，不再重试
      },
    }));
  },
  mergeBoardTimesForOrder: (orderId, times) => {
    const oid = String(orderId || '').trim();
    if (!oid) return;
    set((state) => ({
      boardTimesByOrder: {
        ...state.boardTimesByOrder,
        [oid]: times,
      },
    }));
  },
  setBoardLoadingForOrder: (orderId, loading) => {
    const oid = String(orderId || '').trim();
    if (!oid) return;
    set((state) => ({
      boardStatsLoadingByOrder: {
        ...state.boardStatsLoadingByOrder,
        [oid]: loading,
      },
    }));
  },
  mergeProcessDataForOrder: (orderId, stats, groups, times) => {
    const oid = String(orderId || '').trim();
    if (!oid) return;
    set((state) => ({
      processStatsByOrder:  { ...state.processStatsByOrder,  [oid]: stats  },
      processGroupsByOrder: { ...state.processGroupsByOrder, [oid]: groups },
      processTimesByOrder:  { ...state.processTimesByOrder,  [oid]: times  },
    }));
  },
  clearAllBoardCache: () => {
    set({
      boardStatsByOrder: {},
      boardTimesByOrder: {},
      boardStatsLoadingByOrder: {},
      processStatsByOrder: {},
      processGroupsByOrder: {},
      processTimesByOrder: {},
    });
  },
}));
