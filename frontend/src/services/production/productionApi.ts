import api from '../../utils/api';
import type { ProductionQueryParams, PatternDevelopmentStats } from '../../types/production';

export type ProductionOrderListParams = ProductionQueryParams & {
  startDate?: string;
  endDate?: string;
};

export interface FactoryCapacityItem {
  factoryName: string;
  totalOrders: number;
  totalQuantity: number;
  atRiskCount: number;
  overdueCount: number;
  /** 货期完成率 0-100，-1表示这年内无完工订单 */
  deliveryOnTimeRate: number;
  /** 近30天活跃生产人数 */
  activeWorkers: number;
  /** 近30天日均产量（件/天） */
  avgDailyOutput: number;
  /** 预计完工天数，-1表示无产量数据 */
  estimatedCompletionDays: number;
}

export const productionOrderApi = {
  list: (params: ProductionOrderListParams) => api.get<{ code: number; data: { records: unknown[]; total: number } }>('/production/order/list', { params }),
  // detail 已废弃，统一使用 list({ orderNo: 'xxx' }) 查询单个订单
  close: (id: string, sourceModule: string, remark?: string) => api.post<{ code: number; message: string; data: boolean }>('/production/order/close', { id, sourceModule, remark }),
  updateProgress: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/order/update-progress', payload),
  saveProgressWorkflow: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/order/progress-workflow/lock', payload),
  rollbackProgressWorkflow: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/order/progress-workflow/rollback', payload),
  quickEdit: (payload: Record<string, unknown>) => api.put<{ code: number; message: string; data: unknown }>('/production/order/quick-edit', payload),
  // 节点操作记录 API
  getNodeOperations: (id: string) => api.get<{ code: number; data: string }>(`/production/order/node-operations/${encodeURIComponent(id)}`),
  saveNodeOperations: (id: string, nodeOperations: string) => api.post<{ code: number; message: string }>('/production/order/node-operations', { id, nodeOperations }),
  // 工厂产能雷达
  getFactoryCapacity: () => api.get<{ code: number; data: FactoryCapacityItem[] }>('/production/order/factory-capacity'),
};

export const productionCuttingApi = {
  list: (params: unknown) => api.get<{ code: number; data: { records: unknown[]; total: number } }>('/production/cutting/list', { params }),
  getByCode: (qrCode: string) => api.get<{ code: number; data: unknown }>(`/production/cutting/by-code/${encodeURIComponent(String(qrCode || '').trim())}`),
  listBundles: (orderId: any) => api.get<any>(`/production/cutting/bundles/${encodeURIComponent(String(orderId || '').trim())}`),
};

export const productionScanApi = {
  execute: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: unknown }>('/production/scan/execute', payload),
  listByOrderId: (orderId: string, params: Record<string, unknown>) => api.get<{ code: number; data: unknown[] }>(`/production/scan/list`, { params: { orderId: String(orderId || '').trim(), ...params } }),
  create: (payload: any) => api.post<any>('/production/scan/execute', payload),
  rollback: (orderId: any, payload?: any) => api.post<any>('/production/scan/rollback', { orderId, ...(payload || {}) }),
  /** 撤回扫码记录（1小时内、未结算、订单未完成） */
  undo: (payload: { recordId: string }) => api.post<{ code: number; message: string; data: { success: boolean; message: string } }>('/production/scan/undo', payload),
};

export const productionWarehousingApi = {
  rollbackByBundle: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/warehousing/rollback-by-bundle', payload),
};

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

/** 工序单价 AI 提示 — 历史记录 */
export interface ProcessPriceHintRecord {
  styleNo: string;
  price: number;
  machineType?: string;
  standardTime?: number;
}

/** 交货期智能建议响应 */
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

/** 工序模板单项 */
export interface ProcessTemplateItem {
  processName: string;
  progressStage?: string;
  frequency: number;
  avgPrice: number;
  avgStandardTime: number;
  suggestedPrice: number;
}

/** 工序AI补全响应 */
export interface ProcessTemplateResponse {
  category: string;
  sampleStyleCount: number;
  processes: ProcessTemplateItem[];
}

/** 工序单价 AI 提示响应 */
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
    api.get<{ code: number; data: unknown }>('/intelligence/defect-trace', { params: { orderId } }),

  /** 款式报价建议（按款号聚合） */
  getStyleQuoteSuggestion: (styleNo: string) =>
    api.get<{ code: number; data: unknown }>('/intelligence/style-quote-suggestion', { params: { styleNo } }),

  /** 工序单价 AI 提示 — 输入工序名称，返回历史均价与建议定价 */
  getProcessPriceHint: (processName: string, standardTime?: number) =>
    api.get<{ code: number; data: ProcessPriceHintResponse }>('/intelligence/process-price-hint', {
      params: { processName, ...(standardTime != null ? { standardTime } : {}) },
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

  /** 交货期智能建议 — 根据工厂产能推荐合理交货天数 */
  getDeliveryDateSuggestion: (factoryName?: string, orderQuantity?: number) =>
    api.get<{ code: number; data: DeliveryDateSuggestionResponse }>(
      '/intelligence/delivery-date-suggestion',
      { params: { ...(factoryName ? { factoryName } : {}), ...(orderQuantity != null ? { orderQuantity } : {}) } },
    ),

  /** 工序AI补全 — 根据品类返回历史高频工序清单 */
  getProcessTemplate: (category?: string) =>
    api.get<{ code: number; data: ProcessTemplateResponse }>(
      '/intelligence/process-template',
      { params: { ...(category ? { category } : {}) } },
    ),
};

// ─── ⌘K 全局搜索 ─────────────────────────────────────────────

export interface GlobalSearchOrderItem {
  id: number;
  orderNo: string;
  styleName: string;
  styleNo: string;
  factoryName: string;
  status: string;
  statusLabel: string;
  progress: number;
}

export interface GlobalSearchStyleItem {
  id: number;
  styleNo: string;
  styleName: string;
  category: string;
  coverUrl?: string;
}

export interface GlobalSearchWorkerItem {
  id: string;
  name: string;
  phone: string;
  role: string;
  factoryName?: string;
}

export interface GlobalSearchResult {
  query: string;
  orders: GlobalSearchOrderItem[];
  styles: GlobalSearchStyleItem[];
  workers: GlobalSearchWorkerItem[];
}

export const globalSearchApi = {
  search: (q: string) =>
    api.get<{ code: number; data: GlobalSearchResult }>('/search/global', { params: { q } }),
};

export const materialPurchaseApi = {
  /**
   * 按订单查询采购记录，返回 arrivedQuantity / actualArrivalDate 等字段。
   * 使用 orderNo 精确匹配（后端 sourceType=order + orderNo 过滤），排除样衣独立采购单。
   */
  listByOrderNo: (orderNo: string) =>
    api.get<{ code: number; data: { records: unknown[]; total: number } }>(
      '/production/purchase/list',
      { params: { orderNo: String(orderNo || '').trim(), sourceType: 'order', pageSize: 200, page: 1 } },
    ),
};

export const patternProductionApi = {
  // 获取样衣开发费用统计
  getDevelopmentStats: (rangeType: 'day' | 'week' | 'month' = 'day') =>
    api.get<{ code: number; data: PatternDevelopmentStats }>('/production/pattern/development-stats', {
      params: { rangeType },
    }),
};

/** 工序→父节点动态映射 API（替代硬编码关键词列表） */
export const processParentMappingApi = {
  /** 获取全部映射 { keyword: parentNode } */
  list: () =>
    api.get<{ code: number; data: Record<string, string> }>('/production/process-mapping/list'),
};

// ─── AI质检建议 ─────────────────────────────────────────────
export interface QualityAiSuggestionResult {
  orderNo?: string;
  styleNo?: string;
  styleName?: string;
  productCategory?: string;
  isUrgent?: boolean;
  historicalDefectRate?: number;
  historicalVerdict?: 'good' | 'warn' | 'critical';
  checkpoints: string[];
  defectSuggestions: Record<string, string>;
  urgentTip?: string;
}

export const qualityAiApi = {
  getSuggestion: (orderId: string) =>
    api.get<{ code: number; data: QualityAiSuggestionResult }>('/quality/ai-suggestion', {
      params: { orderId },
    }),
};

export default {
  productionOrderApi,
  productionCuttingApi,
  productionScanApi,
  productionWarehousingApi,
  intelligenceApi,
  patternProductionApi,
  materialPurchaseApi,
  processParentMappingApi,
  qualityAiApi,
};

