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
  mostLikelyDate: string;
  pessimisticDate: string;
  dailyVelocity: number;
  remainingQty: number;
  confidence: number;
  rationale: string;
}

// ─── 预下单交期预测（不依赖 orderId）───
export interface PreOrderDeliveryPredictionRequest {
  factoryName: string;
  orderQuantity: number;
  styleNo?: string;
  plannedDeadline?: string;
}

export interface PreOrderTimelineNode {
  type: 'today' | 'optimistic' | 'mostLikely' | 'pessimistic' | 'plannedDeadline';
  date: string;
  daysFromToday: number;
  label: string;
  riskLevel: 'safe' | 'warning' | 'danger';
}

export interface PreOrderDeliveryPredictionResponse {
  factoryName: string;
  orderQuantity: number;
  factoryPendingQuantity: number;
  factoryDailyVelocity: number;
  optimisticDate: string;
  mostLikelyDate: string;
  pessimisticDate: string;
  optimisticDays: number;
  mostLikelyDays: number;
  pessimisticDays: number;
  plannedDeadline?: string;
  likelyDelayed: boolean;
  confidence: number;
  rationale: string;
  timelineNodes: PreOrderTimelineNode[];
}

// ─── 产能缺口分析 ───
export interface FactoryCapacityGap {
  factoryName: string;
  pendingQuantity: number;
  dailyCapacity: number;
  estimatedDaysToComplete: number;
  nearestDueDate?: string;
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

// ─── 工厂在产订单明细 ───
export interface FactoryActiveOrderDTO {
  orderId: string;
  orderNo: string;
  styleNo?: string;
  styleName?: string;
  customerName?: string;
  orderQuantity?: number;
  completedQuantity?: number;
  remainingQuantity?: number;
  productionProgress?: number;
  plannedEndDate?: string;
  daysToDeadline: number;
  status?: string;
  urgencyLevel?: string;
  merchandiser?: string;
  riskLevel: 'safe' | 'warning' | 'danger';
}

export interface ProfitEstimationResponse {
  orderId: string;
  orderNo: string;
  quotationTotal: number;
  materialCost: number;
  wageCost: number;
  otherCost: number;
  totalCost: number;
  estimatedProfit: number;
  grossMarginPct: number;
  profitStatus: string;
  costWarning?: string;
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
  hasRealData?: boolean;
  capacityConfigured?: boolean;
  dataNote?: string;
  realDailyCapacity?: number;
  capacitySource?: string;
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
