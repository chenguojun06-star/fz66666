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
