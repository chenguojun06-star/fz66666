// 智能运营 TS 类型定义（从 intelligenceApi.ts 提取）


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

export interface PulsePoint { time: string; quantity: number; workers: number; }
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

export interface AgentMeetingRecord {
  id: number;
  meetingType: string;
  topic: string;
  participants: string;
  consensus: string;
  dissent: string;
  actionItems: string;
  confidenceScore: number;
  status: string;
  durationMs: number;
  createTime: string;
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
  dailyCapacity?: number;
  availableCapacity: number;
  suggestedStart: string;
  estimatedEnd: string;
  estimatedDays: number;
  fastestDays?: number;
  slowestDays?: number;
  earliestEnd?: string;
  latestEnd?: string;
  capacityScore?: number;
  timeScore?: number;
  categoryScore?: number;
  qualityScore?: number;
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
  /** Doubao 视觉模型原始识别描述（成功时有值，直接展示Doubao看到的工艺特征） */
  visionRaw?: string | null;
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

/* ── 超级顾问 TS 类型 ── */

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
  role: string;       // 'user' | 'assistant'
  content: string;
  createTime: string;
}

// ── 小云全域待办任务 ──
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
