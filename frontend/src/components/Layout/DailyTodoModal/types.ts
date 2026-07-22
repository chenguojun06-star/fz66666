export interface TrendPoint {
  date: string;
  scanCount: number;
  warehousingCount: number;
  orderCount: number;
}

export interface DecisionCard {
  level: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  summary: string;
  painPoint: string;
  confidence: number;
  source: string;
  evidence: string[];
  execute: boolean;
  actionLabel: string;
  actionPath: string;
}

export interface TopPriorityOrder {
  orderNo: string;
  styleNo: string;
  factoryName: string;
  progress: number;
  daysLeft: number;
}

export interface BriefData {
  date: string;
  overdueOrderCount: number;
  highRiskOrderCount: number;
  yesterdayWarehousingCount: number;
  yesterdayWarehousingQuantity: number;
  todayScanCount: number;
  weekScanCount: number;
  weekWarehousingCount: number;
  todayOrderCount: number;
  todayOrderQuantity: number;
  topPriorityOrder?: TopPriorityOrder;
  suggestions: string[];
  suggestionsSource?: string;
  decisionCards?: DecisionCard[];
  trendData?: TrendPoint[];
  pendingItems?: TopPriorityOrder[];
}
