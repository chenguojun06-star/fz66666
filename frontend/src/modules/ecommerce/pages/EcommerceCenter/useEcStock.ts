import { useMemo } from 'react';
import { useStockBase } from './useStockBase';
import { useOrderProcessing } from './useOrderProcessing';
import { useLogisticsBills } from './useLogisticsBills';

export type {
  UniversalStock,
  StockAlert,
  PurchaseSuggestion,
  WarehouseAllocation,
  OrderSplit,
  MergeOrderItem,
  MergeGroup,
  MergeResult,
  GiftRule,
  GiftMatch,
  LogisticsAnomaly,
  PlatformBill,
  ReconcileResult,
} from './types';

export function useEcStock() {
  const stockBase = useStockBase();
  const orderProcessing = useOrderProcessing();
  const logisticsBills = useLogisticsBills();

  return useMemo(() => ({
    stockList: stockBase.stockList,
    alerts: stockBase.alerts,
    suggestions: stockBase.suggestions,
    allocations: stockBase.allocations,
    splits: stockBase.splits,
    mergeGroups: orderProcessing.mergeGroups,
    giftRules: orderProcessing.giftRules,
    anomalies: logisticsBills.anomalies,
    bills: logisticsBills.bills,
    loading: stockBase.loading,
    fetchStock: stockBase.fetchStock,
    fetchLowStock: stockBase.fetchLowStock,
    fetchAlerts: stockBase.fetchAlerts,
    fetchSuggestions: stockBase.fetchSuggestions,
    fetchAllocations: stockBase.fetchAllocations,
    fetchSplits: stockBase.fetchSplits,
    syncAll: stockBase.syncAll,
    generateSuggestions: stockBase.generateSuggestions,
    aiScanSuggestions: stockBase.aiScanSuggestions,
    approveSuggestion: stockBase.approveSuggestion,
    rejectSuggestion: stockBase.rejectSuggestion,
    resolveAlert: stockBase.resolveAlert,
    updateSafeStock: stockBase.updateSafeStock,
    fetchMergeCandidates: orderProcessing.fetchMergeCandidates,
    mergeOutbound: orderProcessing.mergeOutbound,
    fetchGiftRules: orderProcessing.fetchGiftRules,
    saveGiftRule: orderProcessing.saveGiftRule,
    deleteGiftRule: orderProcessing.deleteGiftRule,
    matchGifts: orderProcessing.matchGifts,
    fetchAnomalies: logisticsBills.fetchAnomalies,
    scanAnomalies: logisticsBills.scanAnomalies,
    handleAnomaly: logisticsBills.handleAnomaly,
    ignoreAnomaly: logisticsBills.ignoreAnomaly,
    reconcileBills: logisticsBills.reconcileBills,
    fetchBills: logisticsBills.fetchBills,
    handleBill: logisticsBills.handleBill,
  }), [stockBase, orderProcessing, logisticsBills]);
}
