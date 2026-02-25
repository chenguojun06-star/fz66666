import { create } from 'zustand';

// null 表示「已请求但 API 失败」，用于防止无限重试
type BoardStatsByOrder = Record<string, Record<string, number> | null>;
type BoardTimesByOrder = Record<string, Record<string, string>>;

interface ProductionBoardState {
  boardStatsByOrder: BoardStatsByOrder;
  boardTimesByOrder: BoardTimesByOrder;
  boardStatsLoadingByOrder: Record<string, boolean>;
  mergeBoardStatsForOrder: (orderId: string, stats: Record<string, number> | null) => void;
  mergeBoardTimesForOrder: (orderId: string, times: Record<string, string>) => void;
  setBoardLoadingForOrder: (orderId: string, loading: boolean) => void;
  clearAllBoardCache: () => void;
}

export const useProductionBoardStore = create<ProductionBoardState>()((set) => ({
  boardStatsByOrder: {},
  boardTimesByOrder: {},
  boardStatsLoadingByOrder: {},
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
  clearAllBoardCache: () => {
    set({
      boardStatsByOrder: {},
      boardTimesByOrder: {},
      boardStatsLoadingByOrder: {},
    });
  },
}));
