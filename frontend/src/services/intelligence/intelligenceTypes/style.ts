export interface HistoricalOrder {
  orderNo: string;
  quantity: number;
  unitPrice: number;
  createTime: string;
  status: string;
}
export interface StyleQuoteSuggestionResponse {
  styleNo: string;
  historicalOrderCount: number;
  historicalTotalQuantity: number;
  currentQuotation: number | null;
  materialCost: number | null;
  processCost: number | null;
  totalCost: number | null;
  suggestedPrice: number | null;
  recentOrders: HistoricalOrder[];
  suggestion: string;
  aiAnalysis?: string;
}

export interface StyleIntelligenceStageStatus {
  key: string;
  label: string;
  status: string;
  assignee?: string | null;
  startTime?: string | null;
  completedTime?: string | null;
}

export interface StyleIntelligenceProfileResponse {
  styleId?: number;
  styleNo: string;
  styleName: string;
  category?: string;
  progressNode?: string;
  deliveryDate?: string | null;
  daysToDelivery?: number | null;
  deliveryRisk?: 'OVERDUE' | 'WARNING' | 'SAFE' | 'UNKNOWN' | string;
  developmentCompletionRate?: number;
  developmentStatus?: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' | string;
  production: {
    orderCount: number;
    activeOrderCount: number;
    delayedOrderCount: number;
    totalOrderQuantity: number;
    totalCompletedQuantity: number;
    avgProductionProgress: number;
    latestOrderNo?: string | null;
    latestOrderStatus?: string | null;
    latestProductionProgress?: number | null;
    latestPlannedEndDate?: string | null;
    topRiskOrderNo?: string | null;
    topRiskOrderStatus?: string | null;
    topRiskReason?: string | null;
    topRiskFactoryName?: string | null;
    topRiskFactoryReason?: string | null;
  };
  scan: {
    totalRecords: number;
    successRecords: number;
    failedRecords: number;
    successQuantity: number;
    settledRecordCount: number;
    unsettledRecordCount: number;
    latestScanTime?: string | null;
    latestProgressStage?: string | null;
    latestProcessName?: string | null;
    topAnomalyProcessName?: string | null;
    topAnomalyStage?: string | null;
    topAnomalyCount?: number | null;
  };
  stock: {
    totalQuantity: number;
    loanedQuantity: number;
    availableQuantity: number;
    developmentQuantity: number;
    preProductionQuantity: number;
    shipmentQuantity: number;
  };
  finance: {
    currentQuotation?: number | null;
    suggestedQuotation?: number | null;
    materialCost?: number | null;
    processCost?: number | null;
    totalCost?: number | null;
    estimatedRevenue?: number | null;
    estimatedProcessingCost?: number | null;
    estimatedGrossProfit?: number | null;
    estimatedGrossMargin?: number | null;
    historicalOrderCount: number;
    quotationGap?: number | null;
    costPressureSource?: 'PROCESS' | 'MATERIAL' | 'OTHER' | string | null;
    costPressureAmount?: number | null;
  };
  tenantProfile: {
    primaryGoal?: 'DELIVERY' | 'PROFIT' | 'CASHFLOW' | string | null;
    primaryGoalLabel?: string | null;
    deliveryWarningDays?: number | null;
    anomalyWarningCount?: number | null;
    lowMarginThreshold?: number | null;
    topRiskFactoryName?: string | null;
    topRiskFactoryReason?: string | null;
  };
  stages: StyleIntelligenceStageStatus[];
  insights: string[];
  difficulty?: DifficultyAssessment;
}

export interface DifficultyAssessment {
  difficultyLevel: 'SIMPLE' | 'MEDIUM' | 'COMPLEX' | 'HIGH_END';
  difficultyScore: number;
  difficultyLabel: string;
  bomCount: number;
  processCount: number;
  hasSecondaryProcess: boolean;
  keyFactors: string[];
  pricingMultiplier: number;
  adjustedSuggestedPrice?: number | null;
  imageAnalyzed: boolean;
  imageInsight?: string | null;
  visionRaw?: string | null;
  assessmentSource: 'STRUCTURED' | 'AI_ENHANCED';
}

export interface SupplierScore {
  factoryName: string;
  totalOrders: number;
  completedOrders: number;
  overdueOrders: number;
  onTimeRate: number;
  qualityScore: number;
  overallScore: number;
  tier: 'S' | 'A' | 'B' | 'C';
}
export interface SupplierScorecardResponse {
  scores: SupplierScore[];
  topCount: number;
  summary: string;
}

export interface ProcessCostItem {
  processName: string;
  unitPrice: number;
  scannedQty: number;
  cost: number;
  progress: number;
}
export interface LiveCostResponse {
  orderNo: string;
  styleNo: string;
  factoryName: string;
  orderQuantity: number;
  completedQty: number;
  estimatedLaborCost: number;
  actualLaborCost: number;
  estimatedRevenue: number;
  estimatedProfit: number;
  profitMargin: number;
  costProgress: number;
  processBreakdown: ProcessCostItem[];
  costStatus: 'ON_TRACK' | 'OVER_BUDGET' | 'UNDER_BUDGET';
  suggestion: string;
}
