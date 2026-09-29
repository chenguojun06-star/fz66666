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
  // === 闭环字段：人员二次处理（V202608201200） ===
  executedBy?: string;           // 执行人ID
  executedByName?: string;       // 执行人姓名
  feedback?: string;             // 人员反馈
  feedbackRating?: number;       // 反馈评分 1-5
  cancelReason?: string;         // 撤销原因
  cancelledBy?: string;          // 撤销人ID
  cancelledAt?: string;          // 撤销时间
  remediationType?: 'AUTO' | 'SUGGESTION';  // 自愈类型
  /** 目标可读标签（后端富化：订单→订单号、样衣→款号）；为空时前端回落显示原始 ID */
  targetLabel?: string;
  // === 审批字段（原有） ===
  approverId?: string;
  approverName?: string;
  approvalTime?: string;
  approvalRemark?: string;
  executionTime?: string;
  closeTime?: string;
  mttrMinutes?: number;
  linkedAuditId?: string;
}

export interface PatrolSummary {
  pendingCount: number;
  autoExecutedToday: number;
  highRiskPending: number;
  recentActions: Array<{
    id?: number;
    issueType: string;
    detectedIssue: string;
    issueSeverity: string;
    status: string;
    targetType: string;
    targetId: string;
    targetLabel?: string;
  }>;
}
