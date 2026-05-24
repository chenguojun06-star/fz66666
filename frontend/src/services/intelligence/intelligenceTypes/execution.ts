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
