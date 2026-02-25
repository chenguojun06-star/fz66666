import { create } from 'zustand';

type BoardStatsByOrder = Record<string, Record<string, number>>;
type BoardTimesByOrder = Record<string, Record<string, string>>;

interface ProductionBoardState {
  boardStatsByOrder: BoardStatsByOrder;
  boardTimesByOrder: BoardTimesByOrder;
  boardStatsLoadingByOrder: Record<string, boolean>;
  mergeBoardStatsForOrder: (orderId: string, stats: Record<string, number>) => void;
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
        [oid]: stats,
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
