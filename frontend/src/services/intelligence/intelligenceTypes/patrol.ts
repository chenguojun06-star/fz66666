export interface PatrolAction {
  id: number;
  actionUid: string;
  tenantId: number;
  patrolSource: string;
  detectedIssue: string;
  issueType: string;
  issueSeverity: string;
  targetType: string;
  targetId: string;
  suggestedActionJson: string;
  confidence: number;
  riskLevel: string;
  status: string;
  autoExecuted: number;
  executionResult: string;
  createTime: string;
  updateTime: string;
}

export interface PatrolSummary {
  pendingCount: number;
  autoExecutedToday: number;
  highRiskPending: number;
  recentActions: Array<{
    issueType: string;
    detectedIssue: string;
    issueSeverity: string;
    status: string;
    targetType: string;
    targetId: string;
  }>;
}
