export interface AuditLogQuery {
  page?: number;
  pageSize?: number;
  status?: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  action?: string;
  startTime?: string;
  endTime?: string;
}

export interface ExecutionStats {
  totalExecuted: number;
  successRate: number;
  avgDuration: number;
  commandTypeDistribution: Record<string, number>;
  userSatisfactionScore: number;
  topRecommendedActions: Array<{ action: string; count: number }>;
}

export interface FeedbackData {
  satisfactionScore: number;
  feedbackText?: string;
  impactDescription?: string;
}

export interface ExecutionConfig {
  autoExecutionEnabled: boolean;
  autoExecutionThreshold: number;
  approvalTimeoutMinutes: number;
  notificationEnabled: boolean;
  auditEnabled: boolean;
}

export interface AgentBackgroundTaskDTO {
  taskId: string;
  taskName: string;
  taskType: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  createdBy?: string;
  progress: number;
  currentStep?: string;
  retryCount: number;
  maxRetry: number;
  startedAt?: string;
  completedAt?: string;
  timeoutSeconds: number;
  errorMessage?: string;
  createTime: string;
  updateTime: string;
}

export interface BackgroundTaskListResponse {
  list: AgentBackgroundTaskDTO[];
  total: number;
  pageNum: number;
  pageSize: number;
}
