/**
 * KPI 指标快照类型、历史点、空初始值等公共类型定义。
 * 由 useKpiMetrics 和 index.tsx 共同引用。
 */

export type KpiMetricSnapshot = {
  todayScanQty: number;
  scanRatePerHour: number;
  activeFactories: number;
  activeWorkers: number;
  healthIndex: number;
  stagnantFactories: number;
  shortageItems: number;
  pendingNotify: number;
  sentToday: number;
  totalFactories: number;
  productionOrderCount: number;
};

export type KpiHistoryPoint = {
  ts: number;
  value: number;
};

export type KpiHistoryStore = Record<keyof KpiMetricSnapshot, KpiHistoryPoint[]>;

export const EMPTY_KPI_METRICS: KpiMetricSnapshot = {
  todayScanQty: 0,
  scanRatePerHour: 0,
  activeFactories: 0,
  activeWorkers: 0,
  healthIndex: 0,
  stagnantFactories: 0,
  shortageItems: 0,
  pendingNotify: 0,
  sentToday: 0,
  totalFactories: 0,
  productionOrderCount: 0,
};

export const EMPTY_KPI_HISTORY = (): KpiHistoryStore => ({
  todayScanQty: [],
  scanRatePerHour: [],
  activeFactories: [],
  activeWorkers: [],
  healthIndex: [],
  stagnantFactories: [],
  shortageItems: [],
  pendingNotify: [],
  sentToday: [],
  totalFactories: [],
  productionOrderCount: [],
});

export const KPI_HISTORY_WINDOW_MS = 5 * 60 * 1000;
