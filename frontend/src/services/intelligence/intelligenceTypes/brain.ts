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
