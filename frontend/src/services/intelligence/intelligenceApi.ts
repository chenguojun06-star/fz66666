/**
 * 智能运营服务 API — 独立模块
 *
 * 从 services/production/productionApi.ts 提取，避免模块职责混淆。
 * 导入方式：
 *   import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
 *
 * 注意：services/production/productionApi.ts 已保留 re-export，旧导入路径仍兼容。
 */
import api from '../../utils/api';

// ── 智能化第二批 TS 类型定义 ──

export interface BottleneckItem {
  stageName: string;
  upstreamDone: number;
  currentDone: number;
  backlog: number;
  severity: 'critical' | 'warning' | 'normal';
  suggestion: string;
}
export interface BottleneckDetectionResponse {
  hasBottleneck: boolean;
  summary: string;
  items: BottleneckItem[];
}

export interface DeliveryRiskItem {
  orderId: string;
  orderNo: string;
  styleNo: string;
  factoryName: string;
  plannedEndDate: string;
  predictedEndDate: string;
  riskLevel: 'safe' | 'warning' | 'danger' | 'overdue';
  daysLeft: number;
  predictedDaysNeeded: number;
  currentProgress: number;
  requiredDailyOutput: number;
  currentDailyOutput: number;
  riskDescription: string;
}
export interface DeliveryRiskResponse {
  items: DeliveryRiskItem[];
  totalOrders: number;
  overdueCount: number;
  dangerCount: number;
  warningCount: number;
}

export interface AnomalyItem {
  type: 'output_spike' | 'quality_spike' | 'idle_worker' | 'night_scan';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  targetName: string;
  todayValue: number;
  historyAvg: number;
  deviationRatio: number;
}
export interface AnomalyDetectionResponse {
  items: AnomalyItem[];
  totalChecked: number;
}

export interface WorkerRecommendation {
  operatorName: string;
  score: number;
  reason: string;
  avgPerDay: number;
  vsAvgPct: number;
  level: 'excellent' | 'good' | 'normal';
  lastActiveDate: string;
}
export interface SmartAssignmentResponse {
  stageName: string;
  recommendations: WorkerRecommendation[];
}

export interface StageLearningStat {
  stageName: string;
  sampleCount: number;
  confidence: number;
  avgMinutesPerUnit: number;
}
export interface LearningReportResponse {
  totalSamples: number;
  stageCount: number;
  avgConfidence: number;
  accuracyRate: number;
  feedbackCount: number;
  lastLearnTime: string;
  stages: StageLearningStat[];
}

// ── 第三批智能化 TS 类型定义（12大黑科技） ──

export interface PulsePoint { time: string; count: number; }
export interface StagnantFactory { factoryName: string; lastScanTime: string; minutesSilent: number; }
export interface LivePulseResponse {
  activeFactories: number;
  activeWorkers: number;
  todayScanQty: number;
  scanRatePerHour: number;
  timeline: PulsePoint[];
  stagnantFactories: StagnantFactory[];
  factoryActivity: FactoryActivity[];
}
export interface FactoryActivity {
  factoryName: string;
  minutesSinceLastScan: number;
  todayQty: number;
  todayCount: number;
  active: boolean;
}

export interface WorkerEfficiencyItem {
  workerId: string;
  workerName: string;
  speedScore: number;
  qualityScore: number;
  stabilityScore: number;
  versatilityScore: number;
  attendanceScore: number;
  overallScore: number;
  bestProcess: string;
  dailyAvgOutput: number;
  trend: string;
}
export interface WorkerEfficiencyResponse {
  workers: WorkerEfficiencyItem[];
  topWorkerName?: string;
  totalEvaluated?: number;
}

export interface DeliveryPredictionResponse {
  orderId: string;
  orderNo: string;
  optimisticDate: string;
  realisticDate: string;
  pessimisticDate: string;
  dailyVelocity: number;
  remainingQty: number;
  confidence: number;
  rationale: string;
}

export interface ProfitEstimationResponse {
  orderId: string;
  orderNo: string;
  revenue: number;
  materialCost: number;
  laborCost: number;
  overheadCost: number;
  totalCost: number;
  grossProfit: number;
  grossMarginPct: number;
  profitStatus: string;
}

export interface FactoryRank {
  factoryId: string;
  factoryName: string;
  rank: number;
  medal: string;
  qualityScore: number;
  speedScore: number;
  deliveryScore: number;
  costScore: number;
  totalScore: number;
}
export interface FactoryLeaderboardResponse {
  rankings: FactoryRank[];
}

export interface RhythmSegment { stageName: string; days: number; pct: number; color: string; bottleneck: boolean; }
export interface OrderRhythm { orderId: string; orderNo: string; segments: RhythmSegment[]; }
export interface RhythmDnaResponse {
  orders: OrderRhythm[];
}

export interface DiagnosisItem {
  checkName: string;
  status: string;
  detail: string;
  autoFixed: boolean;
}
export interface SelfHealingResponse {
  healthScore: number;
  status: string;
  totalChecks: number;
  issuesFound: number;
  autoFixed: number;
  needManual: number;
  items: DiagnosisItem[];
}

export interface NotificationItem {
  type: string;
  priority: string;
  title: string;
  message: string;
  targetUser: string;
  orderId: string;
  orderNo: string;
}
export interface SmartNotificationResponse {
  pendingCount: number;
  sentToday: number;
  successRate: number;
  items: NotificationItem[];
}

export interface NlQueryResponse {
  intent: string;
  answer: string;
  confidence: number;
  data: Record<string, unknown>;
  suggestions: string[];
}

export interface MaterialShortageItem {
  materialCode: string;
  materialName: string;
  unit: string;
  spec: string;
  currentStock: number;
  demandQuantity: number;
  shortageQuantity: number;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  supplierName: string;
  supplierContact: string;
  supplierPhone: string;
}
export interface MaterialShortageResult {
  shortageItems: MaterialShortageItem[];
  sufficientCount: number;
  coveredOrderCount: number;
  summary: string;
}

export interface DailyIndex { date: string; index: number; }
export interface HealthIndexResponse {
  healthIndex: number;
  grade: string;
  deliveryScore: number;
  qualityScore: number;
  efficiencyScore: number;
  capacityScore: number;
  costScore: number;
  trend: DailyIndex[];
  topRisk: string;
  suggestion: string;
}

export interface GanttItem { stage: string; startDate: string; endDate: string; days: number; }
export interface SchedulePlan {
  factoryName: string;
  factoryId: string;
  totalDays: number;
  estimatedEnd: string;
  capacityUtilization: number;
  gantt: GanttItem[];
}
export interface SchedulingSuggestionResponse {
  plans: SchedulePlan[];
}

export interface HeatCell { process: string; factory: string; defectCount: number; intensity: number; }
export interface DefectHeatmapResponse {
  processes: string[];
  factories: string[];
  cells: HeatCell[];
  totalDefects: number;
  worstProcess: string;
  worstFactory: string;
}

/* ===== 财务审核智能分析 ===== */
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
  /** UP | DOWN | STABLE */
  priceTrend?: string;
  recentStyles: ProcessKnowledgeStyleRecord[];
}

export interface ProcessKnowledgeResponse {
  items: ProcessKnowledgeItem[];
  totalProcessTypes: number;
  totalStyles: number;
  totalRecords: number;
}

/** 次品溯源 — 工人缺陷明细 */
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

/* ================================================================
   intelligenceApi — 全部智能运营接口
================================================================ */
export const intelligenceApi = {
  precheckScan: (payload: {
    orderId?: string;
    orderNo?: string;
    stageName?: string;
    processName?: string;
    quantity?: number;
    operatorId?: string;
    operatorName?: string;
  }) => api.post<{ code: number; data: { riskLevel?: string; issues?: Array<{ title?: string; reason?: string; suggestion?: string }> } }>('/intelligence/precheck/scan', payload),

  predictFinishTime: (payload: {
    orderId?: string;
    orderNo?: string;
    styleNo?: string;
    stageName?: string;
    processName?: string;
    currentProgress?: number;
  }) => api.post<{ code: number; data: {
    predictedFinishTime?: string;
    confidence?: number;
    reasons?: string[];
    suggestions?: string[];
    predictionId?: string;
    totalQuantity?: number;
    doneQuantity?: number;
    remainingQuantity?: number;
  } }>('/intelligence/predict/finish-time', payload),

  /** 出入库智能分流建议 */
  recommendInout: (payload: {
    orderNo?: string;
    operatorId?: string;
    operatorName?: string;
    purchaseIds?: string[];
  }) => api.post<{ code: number; data: {
    strategy?: string;
    reason?: string;
    suggestions?: string[];
    relatedPurchaseIds?: string[];
  } }>('/intelligence/recommend/inout', payload),

  /** 反馈闭环 — 静默提交实际完成数据 */
  feedback: (payload: {
    predictionId?: string;
    orderId?: string;
    orderNo?: string;
    stageName?: string;
    processName?: string;
    predictedFinishTime?: string;
    actualFinishTime?: string;
    actualResult?: string;
    acceptedSuggestion?: boolean;
  }) => api.post<{ code: number; data: {
    accepted?: boolean;
    deviationMinutes?: number;
    message?: string;
  } }>('/intelligence/feedback', payload),

  /** 工人效率画像 */
  workerProfile: (payload: {
    operatorName?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => api.post<{ code: number; data: {
    operatorName?: string;
    stages?: Array<{
      stageName: string;
      avgPerDay: number;
      totalQty: number;
      activeDays: number;
      vsFactoryAvgPct: number;
      level: string;
    }>;
    totalQty?: number;
    lastScanTime?: string | null;
    dateDays?: number;
  } }>('/intelligence/worker-profile', payload),

  // ── 第二批智能化 API ──

  /** 工序瓶颈检测 */
  detectBottleneck: (payload?: { orderId?: string; orderNo?: string }) =>
    api.post<{ code: number; data: BottleneckDetectionResponse }>('/intelligence/bottleneck/detect', payload ?? {}),

  /** 交期风险评估 */
  assessDeliveryRisk: (payload?: { orderId?: string }) =>
    api.post<{ code: number; data: DeliveryRiskResponse }>('/intelligence/delivery-risk/assess', payload ?? {}),

  /** 异常行为检测 */
  detectAnomalies: () =>
    api.post<{ code: number; data: AnomalyDetectionResponse }>('/intelligence/anomaly/detect', {}),

  /** 智能派工推荐 */
  recommendAssignment: (payload: { stageName: string; quantity?: number; orderId?: string }) =>
    api.post<{ code: number; data: SmartAssignmentResponse }>('/intelligence/smart-assignment/recommend', payload),

  /** AI 学习报告 */
  getLearningReport: () =>
    api.get<{ code: number; data: LearningReportResponse }>('/intelligence/learning-report'),

  /** 手动触发 AI 学习 */
  triggerLearning: () =>
    api.post<{ code: number; data: { message: string; updatedCount: number } }>('/intelligence/learning/trigger', {}),

  // ── 第三批：12大黑科技 API ──

  /** ① 实时生产脉搏 */
  getLivePulse: () =>
    api.post<{ code: number; data: LivePulseResponse }>('/intelligence/live-pulse', {}),

  /** ② 工人效率画像 */
  getWorkerEfficiency: () =>
    api.post<{ code: number; data: WorkerEfficiencyResponse }>('/intelligence/worker-efficiency', {}),

  /** ③ 完工日期预测 */
  predictDelivery: (payload: { orderId: string }) =>
    api.post<{ code: number; data: DeliveryPredictionResponse }>('/intelligence/delivery-prediction', payload),

  /** ④ 订单利润预估 */
  estimateProfit: (payload: { orderId: string }) =>
    api.post<{ code: number; data: ProfitEstimationResponse }>('/intelligence/profit-estimation', payload),

  /** ⑤ 工厂绩效排行 */
  getFactoryLeaderboard: () =>
    api.post<{ code: number; data: FactoryLeaderboardResponse }>('/intelligence/factory-leaderboard', {}),

  /** ⑥ 生产节奏DNA */
  getRhythmDna: () =>
    api.post<{ code: number; data: RhythmDnaResponse }>('/intelligence/rhythm-dna', {}),

  /** ⑦ 智能异常自愈 */
  runSelfHealing: () =>
    api.post<{ code: number; data: SelfHealingResponse }>('/intelligence/self-healing', {}),

  /** ⑧ 小程序智能提醒 */
  getSmartNotifications: () =>
    api.post<{ code: number; data: SmartNotificationResponse }>('/intelligence/smart-notification', {}),

  /** ⑨ AI决策助手 */
  nlQuery: (payload: { question: string }) =>
    api.post<{ code: number; data: NlQueryResponse }>('/intelligence/nl-query', payload),

  /** ⑩ 供应链健康指数 */
  getHealthIndex: () =>
    api.post<{ code: number; data: HealthIndexResponse }>('/intelligence/health-index', {}),

  /** ⑪ 自动排产建议 */
  suggestScheduling: (payload: { styleNo: string; quantity: number; deadline: string }) =>
    api.post<{ code: number; data: SchedulingSuggestionResponse }>('/intelligence/scheduling-suggestion', payload),

  /** ⑫ 质量缺陷热力图 */
  getDefectHeatmap: () =>
    api.post<{ code: number; data: DefectHeatmapResponse }>('/intelligence/defect-heatmap', {}),

  /** ⑬ 财务审核智能分析 */
  getFinanceAudit: () =>
    api.post<{ code: number; data: FinanceAuditResponse }>('/intelligence/finance-audit', {}),

  // ── 嵌入式智能 API ──

  /** 次品溯源（按订单聚合） */
  getDefectTrace: (orderId: string) =>
    api.get<{ code: number; data: DefectTraceResponse }>('/intelligence/defect-trace', { params: { orderId } }),

  /** 款式报价建议（按款号聚合） */
  getStyleQuoteSuggestion: (styleNo: string) =>
    api.get<{ code: number; data: unknown }>('/intelligence/style-quote-suggestion', { params: { styleNo } }),

  /** 工序单价 AI 提示 */
  getProcessPriceHint: (processName: string, standardTime?: number) =>
    api.get<{ code: number; data: ProcessPriceHintResponse }>('/intelligence/process-price-hint', {
      params: { processName, ...(standardTime != null ? { standardTime } : {}) },
    }),

  /** 工序知识库 */
  getProcessKnowledge: (keyword?: string) =>
    api.get<{ code: number; data: ProcessKnowledgeResponse }>('/intelligence/process-knowledge', {
      params: keyword ? { keyword } : {},
    }),

  /** 面料缺口预测 */
  getMaterialShortage: () =>
    api.get<{ code: number; data: MaterialShortageResult }>('/intelligence/material-shortage'),

  /** AI顾问状态（是否已配置 DEEPSEEK_API_KEY） */
  getAiAdvisorStatus: () =>
    api.get<{ code: number; data: { enabled: boolean; message: string } }>('/intelligence/ai-advisor/status'),

  /** AI顾问问答 — 优先本地规则引擎，无法回答时走 DeepSeek */
  aiAdvisorChat: (question: string) =>
    api.post<{ code: number; data: { answer: string; source: 'local' | 'ai' | 'none' } }>(
      '/intelligence/ai-advisor/chat',
      { question },
    ),

  // ── 第五批：新建订单智能辅助 ──

  /** 交货期智能建议 */
  getDeliveryDateSuggestion: (factoryName?: string, orderQuantity?: number) =>
    api.get<{ code: number; data: DeliveryDateSuggestionResponse }>(
      '/intelligence/delivery-date-suggestion',
      { params: { ...(factoryName ? { factoryName } : {}), ...(orderQuantity != null ? { orderQuantity } : {}) } },
    ),

  /** 工序AI补全 */
  getProcessTemplate: (category?: string) =>
    api.get<{ code: number; data: ProcessTemplateResponse }>(
      '/intelligence/process-template',
      { params: { ...(category ? { category } : {}) } },
    ),
};
