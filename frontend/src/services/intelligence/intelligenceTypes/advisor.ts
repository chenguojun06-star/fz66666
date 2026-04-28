export interface RiskIndicator {
  name: string;
  probability: number;
  level: string;
  description: string;
}

export interface SimulationResultData {
  scenarioDescription: string;
  scenarioRows: Record<string, unknown>[];
  recommendation: string;
}

export interface HyperAdvisorResponse {
  analysis: string;
  needsClarification: boolean;
  riskIndicators?: RiskIndicator[];
  simulation?: SimulationResultData;
  profileHint?: string;
  traceId?: string;
  sessionId?: string;
}

export interface ChatHistoryMessage {
  id: number;
  role: string;
  content: string;
  createTime: string;
}

export interface PendingTaskDTO {
  id: string;
  taskType: 'CUTTING_TASK' | 'QUALITY_INSPECT' | 'REPAIR' | 'MATERIAL_PURCHASE' | 'OVERDUE_ORDER' | 'EXCEPTION_REPORT' | 'STYLE_DEVELOPMENT' | 'PAYROLL_SETTLEMENT' | 'MATERIAL_RECON' | 'EXPENSE_REIMBURSE';
  module: string;
  title: string;
  description: string;
  orderNo: string;
  styleNo?: string;
  deepLinkPath: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: string | null;
  categoryLabel?: string;
  categoryIcon?: string;
  quantity?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  assigneeName?: string | null;
  assigneeId?: string | null;
  taskStatus?: 'pending' | 'completed';
  assigneeRole?: string | null;
}

export interface PendingTaskCategoryCount {
  taskType: string;
  label: string;
  icon: string;
  count: number;
  highCount: number;
}

export interface PendingTaskSummaryDTO {
  totalCount: number;
  highPriorityCount: number;
  categoryCounts: Record<string, PendingTaskCategoryCount>;
  topUrgentTitle?: string;
  topUrgentDeepLinkPath?: string;
}

export interface OrphanDataItemDTO {
  id: string;
  tableName: string;
  tableLabel: string;
  module: string;
  orderId: string;
  orderNo: string;
  styleNo: string;
  summary: string;
  createTime: string | null;
  orphanReason: string;
  orderStatus: string;
}

export interface OrphanDataCategoryStat {
  tableName: string;
  tableLabel: string;
  module: string;
  count: number;
  icon: string;
}

export interface OrphanDataScanResultDTO {
  totalOrphanCount: number;
  categoryStats: Record<string, OrphanDataCategoryStat>;
  scanTime: string;
}

export interface SalesForecastResponse {
  styleNo: string;
  horizonMonths: number;
  predictedQty: number;
  optimistic: number;
  pessimistic: number;
  confidence: number;
  monthlyHistory: Record<string, number>;
}

export interface SizeCurveResponse {
  styleNo: string;
  sizeCurve: Record<string, number>;
  sampleCount: number;
  confidence: number;
}
