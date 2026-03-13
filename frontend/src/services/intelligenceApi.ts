import api, { type ApiResult } from '../utils/api';

/**
 * 智能执行 API 服务层
 *
 * 职责：
 *   1. 调用后端执行引擎接口
 *   2. 处理命令执行的业务逻辑
 *   3. 提供类型安全的 API 方法
 *
 * @author Intelligence API Service v1.0
 * @date 2026-03-08
 */

/**
 * 执行命令
 *
 * @param command - 可执行命令
 * @returns 执行结果
 *
 * @example
 * const result = await intelligenceApi.executeCommand({
 *   action: 'order:hold',
 *   targetId: 'PO001',
 *   riskLevel: 3,
 *   requiresApproval: true,
 *   reason: '面料延期'
 * });
 */
export async function executeCommand(command: any): Promise<any> {
  const response = await api.post<ApiResult<any>>(
    '/intelligence/commands/execute',
    command
  );
  return response.data;
}

/**
 * 审批命令
 *
 * @param commandId - 命令ID
 * @param body - 审批信息（可选备注）
 * @returns 审批结果
 *
 * @example
 * await intelligenceApi.approveCommand('CMD-001', {
 *   remark: '已检查无误，同意执行'
 * });
 */
export async function approveCommand(
  commandId: string,
  body?: { remark?: string }
): Promise<any> {
  const response = await api.post<ApiResult<any>>(
    `/intelligence/commands/${commandId}/approve`,
    body || {}
  );
  return response.data;
}

/**
 * 拒绝命令
 *
 * @param commandId - 命令ID
 * @param body - 拒绝信息
 * @returns 拒绝结果
 *
 * @example
 * await intelligenceApi.rejectCommand('CMD-001', {
 *   reason: '不符合当前业务需求'
 * });
 */
export async function rejectCommand(
  commandId: string,
  body: { reason?: string }
): Promise<any> {
  const response = await api.post<ApiResult<any>>(
    `/intelligence/commands/${commandId}/reject`,
    body
  );
  return response.data;
}

/**
 * 获取待审批命令列表
 *
 * @returns 待审批命令列表
 *
 * @example
 * const { pending, totalCount } = await intelligenceApi.getPendingCommands();
 */
export async function getPendingCommands(): Promise<any> {
  const response = await api.get<ApiResult<any>>(
    '/intelligence/commands/pending'
  );
  // NON_NULL Jackson 序列化：Result.fail() 不含 data 字段 → response.data = undefined
  // 后端失败时抛出可读错误，避免组件拿到 undefined 后崩溃在 .pending 上
  if (response == null || (response.code != null && response.code !== 200)) {
    throw new Error(response?.message || '获取待审批命令失败');
  }
  return response.data ?? { pending: [], totalCount: 0 };
}

/**
 * 查询审计日志
 *
 * @param options - 查询选项
 * @returns 审计日志列表
 *
 * @example
 * const logs = await intelligenceApi.queryAuditLogs({
 *   page: 1,
 *   pageSize: 20,
 *   status: 'SUCCESS',
 *   action: 'order:hold'
 * });
 */
export interface AuditLogQuery {
  page?: number;
  pageSize?: number;
  status?: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  action?: string;
  startTime?: string;
  endTime?: string;
}

export async function queryAuditLogs(options: AuditLogQuery = {}): Promise<any> {
  const response = await api.get<ApiResult<any>>(
    '/intelligence/audit-logs',
    { params: options }
  );
  return response.data;
}

/**
 * 获取 AI 执行统计数据（用于仪表板）
 *
 * @returns 执行统计数据
 *
 * @example
 * const stats = await intelligenceApi.getExecutionStats();
 * console.log(stats.totalExecuted);      // 1250
 * console.log(stats.successRate);        // 94.5%
 * console.log(stats.userSatisfactionScore); // 4.2/5
 */
export interface ExecutionStats {
  totalExecuted: number;
  successRate: number;
  avgDuration: number;
  commandTypeDistribution: Record<string, number>;
  userSatisfactionScore: number;
  topRecommendedActions: Array<{ action: string; count: number }>;
}

export async function getExecutionStats(): Promise<ExecutionStats> {
  const response = await api.get<ApiResult<ExecutionStats>>(
    '/intelligence/execution-stats'
  );
  return response.data;
}

/**
 * 获取特定命令的执行详情
 *
 * @param commandId - 命令ID
 * @returns 命令执行详情
 *
 * @example
 * const detail = await intelligenceApi.getCommandDetail('CMD-001');
 */
export async function getCommandDetail(commandId: string): Promise<any> {
  const response = await api.get<ApiResult<any>>(
    `/intelligence/commands/${commandId}`
  );
  return response.data;
}

/**
 * 提交用户反馈（AI 学习用）
 *
 * @param commandId - 命令ID
 * @param feedback - 反馈内容
 * @returns 提交结果
 *
 * @example
 * await intelligenceApi.submitFeedback('CMD-001', {
 *   satisfactionScore: 5,
 *   feedbackText: '建议非常准确，帮助很大',
 *   impactDescription: '成功防止了订单延期'
 * });
 */
export interface FeedbackData {
  satisfactionScore: number;  // 1-5
  feedbackText?: string;
  impactDescription?: string;
}

export async function submitFeedback(
  commandId: string,
  feedback: FeedbackData
): Promise<any> {
  const response = await api.post<ApiResult<any>>(
    `/intelligence/commands/${commandId}/feedback`,
    feedback
  );
  return response.data;
}

/**
 * 查询工作流执行历史
 *
 * @param commandId - 命令ID
 * @returns 工作流日志
 *
 * @example
 * const workflow = await intelligenceApi.queryWorkflowHistory('CMD-001');
 */
export async function queryWorkflowHistory(commandId: string): Promise<any> {
  const response = await api.get<ApiResult<any>>(
    `/intelligence/commands/${commandId}/workflow`
  );
  return response.data;
}

/**
 * 获取 AI 执行配置
 *
 * @returns 当前租户的执行配置
 *
 * @example
 * const config = await intelligenceApi.getExecutionConfig();
 * console.log(config.autoExecutionEnabled);  // true/false
 * console.log(config.autoExecutionThreshold); // 2
 */
export interface ExecutionConfig {
  autoExecutionEnabled: boolean;
  autoExecutionThreshold: number;
  approvalTimeoutMinutes: number;
  notificationEnabled: boolean;
  auditEnabled: boolean;
}

export async function getExecutionConfig(): Promise<ExecutionConfig> {
  const response = await api.get<ApiResult<ExecutionConfig>>(
    '/intelligence/config'
  );
  return response.data;
}

/**
 * 更新 AI 执行配置（管理员权限）
 *
 * @param config - 新的配置
 * @returns 更新结果
 *
 * @example
 * await intelligenceApi.updateExecutionConfig({
 *   autoExecutionThreshold: 3,
 *   approvalTimeoutMinutes: 3600
 * });
 */
export async function updateExecutionConfig(
  config: Partial<ExecutionConfig>
): Promise<any> {
  const response = await api.put<ApiResult<any>>(
    '/intelligence/config',
    config
  );
  return response.data;
}

// 导出所有方法
export const intelligenceApi = {
  executeCommand,
  approveCommand,
  rejectCommand,
  getPendingCommands,
  queryAuditLogs,
  getExecutionStats,
  getCommandDetail,
  submitFeedback,
  queryWorkflowHistory,
  getExecutionConfig,
  updateExecutionConfig,
  getMetricsOverview,
  runMultiAgentGraph,
  getGraphHistory,
  submitGraphFeedback,
  getGraphAbStats,
};

export interface MetricsSceneStat {
  scene: string;
  total_calls: number;
  success_count: number;
  avg_latency_ms: number;
  fallback_count: number;
}

export async function getMetricsOverview(days = 7): Promise<MetricsSceneStat[]> {
  const response = await api.get<ApiResult<MetricsSceneStat[]>>(
    '/intelligence/metrics/overview',
    { params: { days } }
  );
  return response.data;
}

/** Hybrid Graph MAS v4.0 — 多代理图执行 */
export async function runMultiAgentGraph(params: {
  scene?: string;
  orderIds?: string[];
  question?: string;
}): Promise<any> {
  const response = await api.post<ApiResult<any>>(
    '/intelligence/multi-agent-graph/run',
    params
  );
  return response.data;
}

/** Graph MAS v4.1 — 查询执行历史 */
export async function getGraphHistory(page = 1, size = 20): Promise<any[]> {
  const response = await api.get<ApiResult<any[]>>(
    '/intelligence/multi-agent-graph/history',
    { params: { page, size } }
  );
  return response.data;
}

/** Graph MAS v4.1 — 提交用户反馈评分 */
export async function submitGraphFeedback(executionId: string, score: number, note?: string): Promise<void> {
  await api.post('/intelligence/multi-agent-graph/feedback', { executionId, score, note });
}

/** Graph MAS v4.1 — A/B 测试统计（按 scene 聚合） */
export interface ABSceneStat {
  scene: string;
  totalRuns: number;
  successCount: number;
  avgLatencyMs: number;
  avgConfidence: number;
  feedbackCount: number;
  avgFeedback: number;
}
export async function getGraphAbStats(days = 30): Promise<ABSceneStat[]> {
  const response = await api.get<ApiResult<ABSceneStat[]>>(
    '/intelligence/multi-agent-graph/ab-stats',
    { params: { days } }
  );
  return response.data;
}

/** ── 推演仿真（What-If）── */

export interface WhatIfParams {
  orderIds: number[];
  scenarios: { scenarioKey: string; description: string; tweaks: Record<string, number> }[];
}
export interface ScenarioResult {
  scenarioKey: string;
  description: string;
  finishDateDeltaDays: number;
  costDelta: number;
  overdueRiskDelta: number;
  score: number;
  action: string;
}
export interface WhatIfResult {
  baseline: ScenarioResult;
  scenarios: ScenarioResult[];
  recommendedScenario: string;
  summary: string;
}
export async function simulateWhatIf(params: WhatIfParams): Promise<WhatIfResult> {
  const response = await api.post<ApiResult<WhatIfResult>>(
    '/intelligence/whatif/simulate',
    params
  );
  return response.data as unknown as WhatIfResult;
}

export default intelligenceApi;
