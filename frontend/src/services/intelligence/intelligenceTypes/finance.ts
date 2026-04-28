export interface FinanceAuditSummary {
  totalOrders: number;
  totalWarehousedQty: number;
  totalSettlementAmount: number;
  anomalyCount: number;
  highRiskCount: number;
  duplicateSuspectCount: number;
}
export interface AuditFinding {
  type: string;
  riskLevel: string;
  orderNo: string;
  description: string;
  amount: number;
  action: string;
}
export interface ProfitAnalysis {
  avgProfitMargin: number;
  negativeCount: number;
  abnormalHighCount: number;
  lowProfitCount: number;
  normalCount: number;
}
export interface PriceDeviation {
  orderNo: string;
  styleNo: string;
  factoryName: string;
  currentPrice: number;
  avgHistoryPrice: number;
  deviationPercent: number;
  riskLevel: string;
}
export interface FinanceAuditResponse {
  overallRisk: string;
  suggestion: string;
  suggestionText: string;
  summary: FinanceAuditSummary;
  findings: AuditFinding[];
  profitAnalysis: ProfitAnalysis;
  priceDeviations: PriceDeviation[];
}

export interface ProcessPriceHintRecord {
  styleNo: string;
  price: number;
  machineType?: string;
  standardTime?: number;
}

export interface DeliveryDateSuggestionResponse {
  earliestDays: number;
  recommendedDays: number;
  latestDays: number;
  factoryAvgDailyOutput: number;
  factoryInProgressOrders: number;
  factoryInProgressQty: number;
  factoryOnTimeRate: number;
  confidence: number;
  reason: string;
  algorithm: string;
}

export interface ProcessTemplateItem {
  processName: string;
  progressStage?: string;
  frequency: number;
  avgPrice: number;
  avgStandardTime: number;
  suggestedPrice: number;
}

export interface ProcessTemplateResponse {
  category: string;
  sampleStyleCount: number;
  processes: ProcessTemplateItem[];
}

export interface ProcessPriceHintResponse {
  processName: string;
  usageCount: number;
  lastPrice: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  suggestedPrice: number;
  reasoning: string;
  recentRecords: ProcessPriceHintRecord[];
}

export interface ProcessKnowledgeStyleRecord {
  styleNo: string;
  price: number;
  machineType?: string;
  standardTime?: number;
  createTime?: string;
}

export interface ProcessKnowledgeItem {
  processName: string;
  progressStage?: string;
  machineType?: string;
  usageCount: number;
  minPrice?: number;
  maxPrice?: number;
  avgPrice?: number;
  suggestedPrice?: number;
  avgStandardTime?: number;
  lastUsedTime?: string;
  priceTrend?: string;
  recentStyles: ProcessKnowledgeStyleRecord[];
}

export interface ProcessKnowledgeResponse {
  items: ProcessKnowledgeItem[];
  totalProcessTypes: number;
  totalStyles: number;
  totalRecords: number;
}

export interface WorkerDefect {
  operatorId: string;
  operatorName: string;
  defectCount: number;
  totalScans: number;
  defectRate: number;
  worstProcess: string;
  riskLevel: 'low' | 'medium' | 'high';
}
export interface ProcessDefect {
  processName: string;
  defectCount: number;
  totalScans: number;
  defectRate: number;
}
export interface DayTrend {
  date: string;
  defectCount: number;
  totalScans: number;
}
export interface DefectTraceResponse {
  totalDefects: number;
  totalScans: number;
  overallDefectRate: number;
  workers: WorkerDefect[];
  hotProcesses: ProcessDefect[];
  trend: DayTrend[];
}
