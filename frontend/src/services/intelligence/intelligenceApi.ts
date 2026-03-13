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
import { downloadFile } from '../../utils/fileUrl';

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
  /** AI对本次派工的综合分析（需AI函数已启用） */
  aiSuggestion?: string;
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
  mostLikelyDate: string;   // 后端字段名，原 realisticDate 已修正
  pessimisticDate: string;
  dailyVelocity: number;
  remainingQty: number;
  confidence: number;        // 后端返回 0-100 整数，无需再 ×100
  rationale: string;
}

export interface ProfitEstimationResponse {
  orderId: string;
  orderNo: string;
  quotationTotal: number;   // 后端字段名，原 revenue 已修正
  materialCost: number;
  wageCost: number;          // 后端字段名，原 laborCost 已修正
  otherCost: number;         // 后端字段名，原 overheadCost 已修正
  totalCost: number;
  estimatedProfit: number;   // 后端字段名，原 grossProfit 已修正
  grossMarginPct: number;
  profitStatus: string;      // 后端返回中文：盈利 / 微利 / 亏损
  costWarning?: string;      // 异常信息，如订单不存在
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
  /** DeepSeek直接回答的AI洞察（仅intent=ai_direct时有值） */
  aiInsight?: string;
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

export interface FactoryBottleneckWorstOrder {
  orderNo: string;
  pct: number;
}
export interface FactoryBottleneckItem {
  factoryName: string;
  orderCount: number;
  stuckOrderCount: number;
  stuckStage: string;
  stuckPct: number;
  worstOrders: FactoryBottleneckWorstOrder[];
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
  reason?: string;
  matchScore: number;
  currentLoad: number;
  availableCapacity: number;
  suggestedStart: string;
  estimatedEnd: string;
  estimatedDays: number;
  ganttItems: GanttItem[];
  // 数据质量标记
  hasRealData?: boolean;       // false = 评分全为估算默认值（无历史完成订单）
  capacityConfigured?: boolean; // false = 产能使用系统默认500件/日
  dataNote?: string;           // 数据说明文字
  realDailyCapacity?: number;  // 近30天实测日产能（件/天），0=无扫码数据
  capacitySource?: string;     // 'real'=扫码实测 | 'configured'=手动配置 | 'default'=系统默认
  // legacy fields
  totalDays?: number;
  capacityUtilization?: number;
  gantt?: GanttItem[];
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
   MindPush + OrderTrack 类型
================================================================ */
export interface MindPushRuleDTO {
  ruleCode: string;
  ruleName: string;
  enabled: boolean;
  thresholdDays: number;
  thresholdProgress: number;
  notifyTimeStart?: string;
  notifyTimeEnd?: string;
}

export interface MindPushLogItem {
  id: number;
  ruleCode: string;
  ruleName: string;
  orderNo: string;
  pushMessage: string;
  channel: string;
  createdAt: string;
}

export interface MindPushStatusData {
  rules: MindPushRuleDTO[];
  recentLog: MindPushLogItem[];
  stats: { pushed24h: number; pushed7d: number; activeRules: number };
  notifyTimeStart?: string;
  notifyTimeEnd?: string;
}

/* ================================================================
   款式报价建议
================================================================ */
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
  /** AI深度分析报价策略（需AI函数已启用） */
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
  /** 款式制作难度评估（随档案卡加载时自动计算） */
  difficulty?: DifficultyAssessment;
}

/* ================================================================
   款式制作难度评估
================================================================ */
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
  assessmentSource: 'STRUCTURED' | 'AI_ENHANCED';
}

/* ================================================================
   供应商评分卡
================================================================ */
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

/* ================================================================
   实时成本追踪
================================================================ */
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

export interface FeedbackReasonRecord {
  id: number;
  predictionId?: string;
  suggestionType?: string;
  accepted?: boolean;
  reasonCode?: string;
  reasonText?: string;
  orderNo?: string;
  stageName?: string;
  processName?: string;
  operatorName?: string;
  createTime?: string;
}

export interface IntelligenceBrainSummary {
  healthIndex: number;
  healthGrade: string;
  topRisk?: string;
  highRiskOrders: number;
  anomalyCount: number;
  stagnantFactories: number;
  activeFactories: number;
  activeWorkers: number;
  todayScanQty: number;
  pendingNotifications: number;
  suggestedActions: number;
}

export interface IntelligenceBrainLearning {
  totalSamples: number;
  stageCount: number;
  feedbackCount: number;
  accuracyRate: number;
  lastLearnTime?: string;
}

export interface IntelligenceBrainModelGateway {
  enabled: boolean;
  provider: string;
  baseUrl?: string | null;
  routingStrategy: string;
  activeModel: string;
  fallbackEnabled: boolean;
  status: string;
}

export interface IntelligenceBrainObservability {
  enabled: boolean;
  provider: string;
  endpoint?: string | null;
  capturePrompts: boolean;
  sampleRate: number;
  status: string;
}

export interface IntelligenceBrainSignal {
  signalType: string;
  level: 'high' | 'medium' | 'low' | string;
  title: string;
  summary: string;
  source: string;
  relatedOrderNo?: string;
  ownerRole?: string;
}

export interface IntelligenceBrainAction {
  actionType: string;
  priority: 'high' | 'medium' | 'low' | string;
  ownerRole: string;
  title: string;
  summary: string;
  reason: string;
  routePath: string;
  autoExecutable: boolean;
}

/* ================================================================
   行动中心
================================================================ */
export interface ActionCenterTaskSummary {
  totalTasks: number;
  highPriorityTasks: number;
  productionTasks: number;
  financeTasks: number;
  factoryTasks: number;
  processingTasks?: number;
  completedTasks?: number;
  rejectedTasks?: number;
  overdueReviewTasks?: number;
  closureRate?: number;
  adoptionRate?: number;
}

export interface ActionCenterTask {
  taskCode: string;
  domain: string;
  priority: string;
  escalationLevel: string;
  coordinationScore?: number;
  ownerRole: string;
  title: string;
  summary: string;
  reason: string;
  ownerAction?: string;
  completionCheck?: string;
  expectedOutcome?: string;
  nextReviewAt?: string;
  sourceSignal?: string;
  feedbackStatus?: string;
  feedbackReason?: string;
  completionNote?: string;
  feedbackTime?: string;
  routePath: string;
  relatedOrderNo: string;
  dueHint: string;
  autoExecutable: boolean;
}

export interface ActionTaskFeedbackRequest {
  taskCode: string;
  relatedOrderNo?: string;
  feedbackStatus: 'PROCESSING' | 'COMPLETED' | 'REJECTED';
  feedbackReason?: string;
  completionNote?: string;
  sourceSignal?: string;
  nextReviewAt?: string;
}

export interface ActionTaskFeedbackItem {
  taskCode: string;
  relatedOrderNo?: string;
  feedbackStatus: string;
  feedbackReason?: string;
  completionNote?: string;
  sourceSignal?: string;
  nextReviewAt?: string;
  operatorId?: string;
  operatorName?: string;
  feedbackTime?: string;
}

export interface ActionCenterResponse {
  summary: ActionCenterTaskSummary;
  tasks: ActionCenterTask[];
}

export interface IntelligenceBrainSnapshotResponse {
  tenantId?: number;
  generatedAt: string;
  featureFlags: Record<string, boolean>;
  summary: IntelligenceBrainSummary;
  learning: IntelligenceBrainLearning;
  modelGateway: IntelligenceBrainModelGateway;
  observability: IntelligenceBrainObservability;
  signals: IntelligenceBrainSignal[];
  actions: IntelligenceBrainAction[];
}

// ── B阶段新增：智能驾驶舱扩展接口 ──

export interface FactoryCapacityGap {
  factoryName: string;
  pendingQuantity: number;
  dailyCapacity: number;
  estimatedDaysToComplete: number;
  nearestDueDate: string;
  daysToNearestDue: number;
  gapDays: number;
  gapLevel: 'safe' | 'tight' | 'gap' | 'critical';
  advice: string;
}
export interface CapacityGapResponse {
  totalFactories: number;
  gapFactoryCount: number;
  factories: FactoryCapacityGap[];
}

export interface StagnantOrderAlert {
  orderId: string;
  orderNo: string;
  styleNo: string;
  factoryName: string;
  lastScanTime: string;
  stagnantDays: number;
  currentProgress: number;
  plannedEndDate: string;
  daysToDeadline: number;
  severity: 'watch' | 'alert' | 'urgent';
  actionAdvice: string;
}
export interface StagnantAlertResponse {
  checkedOrders: number;
  stagnantCount: number;
  alerts: StagnantOrderAlert[];
}

export interface ReconciliationAnomalyItem {
  reconciliationId: string;
  reconciliationNo: string;
  orderNo: string;
  styleNo: string;
  factoryName: string;
  anomalyType: 'high_deduction' | 'low_profit' | 'overdue_pending';
  anomalyDesc: string;
  deductionAmount: number;
  profitMarginPct: number;
  status: string;
  createTime: string;
  pendingDays: number;
  priorityScore: number;
  advice: string;
}
export interface ReconciliationAnomalyResponse {
  totalChecked: number;
  anomalyCount: number;
  items: ReconciliationAnomalyItem[];
}

export interface ApprovalAdvice {
  approvalId: string;
  operationType: string;
  targetNo: string;
  applicantName: string;
  orgUnitName: string;
  applyReason: string;
  applyTime: string;
  pendingHours: number;
  verdict: 'APPROVE' | 'REJECT' | 'ESCALATE';
  verdictReason: string;
  riskLevel: 'low' | 'medium' | 'high';
  priorityScore: number;
}
export interface ApprovalAdvisorResponse {
  pendingCount: number;
  highRiskCount: number;
  items: ApprovalAdvice[];
}

export interface ReplenishmentItem {
  materialCode: string;
  materialName: string;
  spec: string;
  unit: string;
  currentStock: number;
  demandQuantity: number;
  shortageQuantity: number;
  urgencyLevel: 'urgent' | 'warning' | 'watch';
  recommendedSupplier: string;
  supplierContact: string;
  supplierPhone: string;
  affectedOrders: number;
  advice: string;
  urgencyScore: number;
}
export interface ReplenishmentAdvisorResponse {
  shortageCount: number;
  urgentCount: number;
  items: ReplenishmentItem[];
}

/* ================================================================
   intelligenceApi — 全部智能运营接口
================================================================ */
export const intelligenceApi = {
  /** AI 大脑总快照：统一感知、判断、行动、学习状态入口 */
  getBrainSnapshot: () =>
    api.get<{ code: number; data: IntelligenceBrainSnapshotResponse }>('/intelligence/brain/snapshot'),

  /** 行动中心：多域风险转可执行任务 */
  getActionCenter: () =>
    api.get<{ code: number; data: ActionCenterResponse }>('/intelligence/action-center'),

  submitActionTaskFeedback: (payload: ActionTaskFeedbackRequest) =>
    api.post<{ code: number; data: ActionTaskFeedbackItem }>('/intelligence/action-center/task-feedback', payload),

  listActionTaskFeedback: (limit = 20) =>
    api.get<{ code: number; data: ActionTaskFeedbackItem[] }>('/intelligence/action-center/task-feedback/list', { params: { limit } }),

  /** 服务端租户级智能开关，优先级应高于前端 localStorage */
  getTenantSmartFeatureFlags: () =>
    api.get<{ code: number; data: Record<string, boolean> }>('/system/tenant-smart-feature/list'),

  saveTenantSmartFeatureFlags: (features: Record<string, boolean>) =>
    api.post<{ code: number; data: Record<string, boolean> }>('/system/tenant-smart-feature/save', { features }),

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
    suggestionType?: string;
    reasonCode?: string;
    reasonText?: string;
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
  suggestScheduling: (payload: { styleNo: string; quantity: number; deadline: string; productCategory?: string }) =>
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
    api.get<{ code: number; data: StyleQuoteSuggestionResponse }>('/intelligence/style-quote-suggestion', { params: { styleNo } }),

  /** 款式智能档案卡（按款式聚合开发/生产/库存/财务） */
  getStyleIntelligenceProfile: (params: { styleId?: string | number; styleNo?: string }) =>
    api.get<{ code: number; data: StyleIntelligenceProfileResponse }>('/intelligence/style-profile', { params }),

  /** 款式制作难度 AI 增强分析（用户主动触发，含图像分析） */
  analyzeStyleDifficulty: (params: { styleId: number | string; coverUrl?: string }) =>
    api.post<{ code: number; data: DifficultyAssessment }>('/intelligence/style-difficulty', params),

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

  /** 工厂工序瓶颈分析 — 基于真实扫码数据 */
  getFactoryBottleneck: () =>
    api.get<{ code: number; data: FactoryBottleneckItem[] }>('/intelligence/factory-bottleneck'),

  /** 最近智能建议反馈原因 */
  listFeedbackReasons: (limit = 20) =>
    api.get<{ code: number; data: FeedbackReasonRecord[] }>('/intelligence/feedback-reason/list', {
      params: { limit },
    }),

  /** AI顾问状态（是否已配置 DEEPSEEK_API_KEY） */
  getAiAdvisorStatus: () =>
    api.get<{ code: number; data: { enabled: boolean; message: string } }>('/intelligence/ai-advisor/status'),

  /** AI顾问问答 — 优先本地规则引擎，无法回答时走 DeepSeek */
  aiAdvisorChat: (question: string) =>
    api.post<{ code: number; data: { answer: string; source: 'local' | 'ai' | 'none' } }>(
      '/intelligence/ai-advisor/chat',
      { question },
      { timeout: 90000 },
    ),

  /** AI顾问流式问答 — SSE 实时推送思考/工具调用/回答事件 */
  aiAdvisorChatStream: (
    question: string,
    onEvent: (event: { type: string; data: Record<string, unknown> }) => void,
    onDone: () => void,
    onError: (err: string) => void,
  ) => {
    const token = localStorage.getItem('token') || '';
    const url = `/api/intelligence/ai-advisor/chat/stream?question=${encodeURIComponent(question)}`;
    const ctrl = new AbortController();
    fetch(url, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          onError(`HTTP ${res.status}`);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          let eventName = '';
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:') && eventName) {
              try {
                const parsed = JSON.parse(line.slice(5).trim());
                if (eventName === 'done') {
                  onDone();
                } else {
                  onEvent({ type: eventName, data: parsed });
                }
              } catch { /* ignore malformed */ }
              eventName = '';
            } else if (line.trim() === '') {
              eventName = '';
            }
          }
        }
        onDone();
      })
      .catch((err) => {
        if (err.name !== 'AbortError') onError(err.message || '网络错误');
      });
    return ctrl;
  },

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

  // ── 第六批：MindPush 主动推送中枢 + OrderTrack 客户进度门户 ──

  /** 获取推送规则配置和最近日志 */
  getMindPushStatus: () =>
    api.get<{ code: number; data: MindPushStatusData }>('/intelligence/mind-push/status'),

  /** 保存推送规则（启停/阈值） */
  saveMindPushRule: (rule: MindPushRuleDTO) =>
    api.post<{ code: number; data: string }>('/intelligence/mind-push/rule', rule),

  /** 手动触发推送检测，返回触发条数 */
  runMindPushCheck: () =>
    api.post<{ code: number; data: number }>('/intelligence/mind-push/check', {}),

  /** 保存推送时段（所有规则统一时段） */
  savePushTime: (notifyTimeStart: string, notifyTimeEnd: string) =>
    api.post<{ code: number; data: string }>('/intelligence/mind-push/push-time', { notifyTimeStart, notifyTimeEnd }),

  /** 生成订单分享 token（固定1小时有效） */
  generateShareToken: (orderId: string) =>
    api.post<{ code: number; data: string }>('/intelligence/order-track/generate-token', { orderId }),

  /** 撤销订单分享 token */
  revokeShareToken: (orderId: string) =>
    api.delete<{ code: number; data: string }>(`/intelligence/order-track/revoke/${orderId}`),

  // ── 第七批：款式报价 + 供应商评分卡 + 实时成本追踪 ──

  /** 供应商智能评分卡（近3个月工厂履约/质量得分） */
  getSupplierScorecard: () =>
    api.get<{ code: number; data: SupplierScorecardResponse }>('/intelligence/supplier-scorecard'),

  /** 实时成本追踪（订单工序成本进度与利润预估） */
  getLiveCostTracker: (orderId: string) =>
    api.get<{ code: number; data: LiveCostResponse }>('/intelligence/live-cost', { params: { orderId } }),

  // ── 专业报告下载 ──

  /** 下载专业运营报告（Excel） */
  downloadProfessionalReport: async (type: 'daily' | 'weekly' | 'monthly' = 'daily', date?: string) => {
    const params = new URLSearchParams({ type });
    if (date) params.append('date', date);

    const token = localStorage.getItem('authToken') || '';
    if (token) params.append('token', token);

    downloadFile(`/api/intelligence/professional-report/download?${params.toString()}`);
    await new Promise(r => setTimeout(r, 500));
  },

  // ── 第八批：B阶段新增智能驾驶舱能力 ──

  /** B2 - 产能缺口分析 */
  getCapacityGap: () =>
    api.get<{ code: number; data: CapacityGapResponse }>('/intelligence/capacity-gap'),

  /** B3 - 停滞订单预警 */
  getStagnantAlert: () =>
    api.get<{ code: number; data: StagnantAlertResponse }>('/intelligence/stagnant-alert'),

  /** B5 - 对账异常优先级 */
  getReconciliationAnomalyPriority: () =>
    api.get<{ code: number; data: ReconciliationAnomalyResponse }>('/intelligence/reconciliation/anomaly-priority'),

  /** B6 - 审批 AI 建议 */
  getApprovalAiAdvice: () =>
    api.get<{ code: number; data: ApprovalAdvisorResponse }>('/intelligence/approval/ai-advice'),

  /** B8 - 补料采购建议 */
  getReplenishmentSuggestion: () =>
    api.get<{ code: number; data: ReplenishmentAdvisorResponse }>('/intelligence/replenishment/suggest'),

  // ── 文件上传分析 ──

  /** 上传 Excel/CSV/图片，解析为 Markdown 文本供 AI 分析 */
  uploadAnalyze: async (file: File): Promise<{ filename: string; parsedContent: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('authToken') || '';
    const res = await fetch('/api/intelligence/ai-advisor/upload-analyze', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const json = await res.json() as { code: number; data: { filename: string; parsedContent: string }; message?: string };
    if (json.code !== 200) throw new Error(json.message ?? '文件分析失败');
    return json.data;
  },

  /** 催单：更新订单的预计出货日期和备注 */
  quickEditOrder: async (payload: {
    orderNo: string;
    expectedShipDate?: string;
    remarks?: string;
    urgencyLevel?: string;
  }): Promise<void> => {
    const token = localStorage.getItem('authToken') || '';
    const res = await fetch('/api/production/orders/quick-edit', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json() as { code: number; message?: string };
    if (json.code !== 200) throw new Error(json.message ?? '更新失败');
  },
};
