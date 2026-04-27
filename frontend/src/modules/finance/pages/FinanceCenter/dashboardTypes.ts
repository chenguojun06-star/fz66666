export interface StatCardData {
  totalAmount: number;
  totalAmountChange: number;
  inboundQuantity: number;
  inboundQuantityChange: number;
  orderCount: number;
  orderCountChange: number;
  defectQuantity: number;
  defectQuantityChange: number;
  profitRate: number;
  profitRateChange: number;
  materialCost: number;
  productionCost: number;
  profit: number;
  defectRate: number;
}

export interface RankData {
  rank: number;
  name: string;
  value: number;
}

export interface SettlementRow {
  orderNo: string;
  factoryName: string;
  inboundQuantity: number;
  defectQuantity: number;
  totalAmount: number;
  materialCost: number;
  productionCost: number;
  profit: number;
  profitRate: number;
  settlementDate: string;
}

export type TimeRangeType = 'day' | 'week' | 'month' | 'year' | 'custom';

export interface Factory {
  id: string;
  factoryName: string;
}

export interface EChartData {
  dates: string[];
  amounts: number[];
  inboundQuantities: number[];
  orderCounts: number[];
  defectQuantities: number[];
}

export const DEFAULT_STAT_DATA: StatCardData = {
  totalAmount: 0, totalAmountChange: 0,
  inboundQuantity: 0, inboundQuantityChange: 0,
  orderCount: 0, orderCountChange: 0,
  defectQuantity: 0, defectQuantityChange: 0,
  profitRate: 0, profitRateChange: 0,
  materialCost: 0, productionCost: 0, profit: 0, defectRate: 0,
};

export const DEFAULT_CHART_DATA: EChartData = {
  dates: [], amounts: [], inboundQuantities: [], orderCounts: [], defectQuantities: [],
};
