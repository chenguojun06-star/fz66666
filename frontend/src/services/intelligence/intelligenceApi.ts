/**
 * 智能运营服务 API — 独立模块
 *
 * 从 services/production/productionApi.ts 提取，避免模块职责混淆。
 * 导入方式：
 *   import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
 *
 * 注意：services/production/productionApi.ts 已保留 re-export，旧导入路径仍兼容。
 */
import type { AxiosRequestConfig } from 'axios';
import api, { type ApiResult } from '../../utils/api';
import { unwrapApiData } from '../../utils/api/core';
import { downloadFile } from '../../utils/fileUrl';
import type {
  ABSceneStat,
  ActionCenterResponse,
  ActionTaskFeedbackItem,
  ActionTaskFeedbackRequest,
  AgentMeetingRecord,
  AnomalyDetectionResponse,
  AuditLogQuery,
  BottleneckDetectionResponse,
  ChatHistoryMessage,
  DefectHeatmapResponse,
  DefectTraceResponse,
  DeliveryDateSuggestionResponse,
  DeliveryPredictionResponse,
  DeliveryRiskResponse,
  PreOrderDeliveryPredictionRequest,
  PreOrderDeliveryPredictionResponse,
  CapacityGapResponse,
  FactoryActiveOrderDTO,
  FactoryDailyOutputResponse,
  DailyBriefing,
  PredictionDeliveryRiskItem,
  PredictionRestockSuggestionItem,
  GeneratePurchaseRequestPayload,
  GeneratePurchaseRequestResult,
  AgentBackgroundTaskDTO,
  BackgroundTaskListResponse,
  DifficultyAssessment,
  ExecutionConfig,
  ExecutionStats,
  FactoryBottleneckItem,
  StageBottleneckHeatmapResponse,
  FactoryLeaderboardResponse,
  FeedbackData,
  FeedbackReasonRecord,
  FinanceAuditResponse,
  ForecastRequest,
  ForecastResult,
  HealthIndexResponse,
  HyperAdvisorResponse,
  IntelligenceBrainSnapshotResponse,
  LearningReportResponse,
  LiveCostResponse,
  LivePulseResponse,
  MaterialShortageResult,
  MetricsSceneStat,
  MindPushRuleDTO,
  MindPushStatusData,
  NlQueryResponse,
  PatrolAction,
  PatrolSummary,
  ProcessKnowledgeResponse,
  ProcessPriceHintResponse,
  ProcessTemplateResponse,
  ProfitEstimationResponse,
  RhythmDnaResponse,
  SchedulingAdoptionResult,
  SchedulingSuggestionResponse,
  SelfHealingResponse,
  SmartAssignmentResponse,
  SmartNotificationResponse,
  StyleIntelligenceProfileResponse,
  StyleQuoteSuggestionResponse,
  SupplierScorecardResponse,
  VisualAIRequest,
  VisualAIResponse,
  StyleFieldParseResult,
  WhatIfParams,
  WhatIfResult,
  WorkerEfficiencyResponse,
  ProactiveInsightItem,
} from './intelligenceTypes';

// 类型定义已提取至 intelligenceTypes.ts，此处 re-export 以保持所有消费方导入兼容
export * from './intelligenceTypes';

/* ================================================================
   本地类型定义 — 命令执行引擎 / 采购单据 / 多代理图等接口响应
================================================================ */

/** 采购单据执行响应（autoExecutePurchaseDoc / replayPurchaseDoc 共用） */
interface PurchaseDocExecResponse {
  code: number;
  data: Record<string, unknown>;
  message?: string;
}

/** 待审批命令条目 */
interface PendingCommandItem {
  commandId: string;
  action?: string;
  targetId?: string;
  reason?: string;
  riskLevel?: number;
  waitingFor?: string[];
  createdAt?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 待审批命令列表响应 */
interface PendingCommandsResponse {
  pending: PendingCommandItem[];
  totalCount: number;
}

/** 命令详情 */
interface CommandDetail {
  commandId?: string;
  action?: string;
  targetId?: string;
  reason?: string;
  riskLevel?: number;
  waitingFor?: string[];
  createdAt?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

/** 命令执行结果（executeCommand / approveCommand / rejectCommand 共用） */
interface CommandExecuteResult {
  commandId?: string;
  status?: string;
  message?: string;
  data?: unknown;
  cascadedTasks?: number;
  notifiedRecipients?: string[];
  [key: string]: unknown;
}

/** 命令执行入参 */
interface CommandExecutePayload {
  commandId?: string;
  action?: string;
  targetId?: string;
  params?: Record<string, unknown>;
  riskLevel?: number;
  waitingFor?: string[];
  reason?: string;
  [key: string]: unknown;
}

/** 审计日志查询结果 */
interface AuditLogQueryResult {
  rows?: Array<Record<string, unknown>>;
  total?: number;
  [key: string]: unknown;
}

/** 命令工作流历史 */
interface WorkflowHistoryResult {
  steps?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** 多代理图运行结果 */
interface MultiAgentGraphResult {
  route: string;
  confidenceScore: number;
  reflection: string;
  optimizationSuggestion: string;
  contextSummary: string;
  success: boolean;
  errorMessage?: string;
  executedAt: string;
  latencyMs: number;
  specialistResults?: Record<string, string>;
  nodeTrace?: string[];
  executionId?: string;
  digitalTwinSnapshot?: string;
  [key: string]: unknown;
}

/** 多代理图历史条目 */
interface GraphHistoryItem {
  id: string;
  scene: string;
  route: string;
  confidenceScore: number;
  status: string;
  latencyMs: number;
  createTime: string;
  userFeedback?: number;
  [key: string]: unknown;
}

/** 款式图片搜索结果 */
interface StyleSearchResult {
  success: boolean;
  matchCount: number;
  matches: Array<{
    styleNo: string;
    difficultyLevel: string;
    difficultyScore: number;
    similarity: string;
  }>;
  error?: string;
}

/** 票据 OCR 解析结果 */
interface ReceiptParseResult {
  imageUrl: string;
  available: boolean;
  errorMessage?: string;
  confidence?: number;
  amount?: number;
  invoiceDate?: string;
  invoiceNo?: string;
  supplierName?: string;
  expenseType?: string;
  taxRate?: string;
  taxAmount?: number;
  items?: string[];
}

/** AxiosRequestConfig 项目扩展（retry 字段已在拦截器 core.ts 中使用） */
type ApiRequestConfig = AxiosRequestConfig & { retry?: number };

/* ================================================================
   intelligenceApi — 全部智能运营接口
================================================================ */
export const intelligenceApi = {
  /** AI 大脑总快照：统一感知、判断、行动、学习状态入口 */
  getBrainSnapshot: async () =>
    unwrapApiData<IntelligenceBrainSnapshotResponse>(await api.get('/intelligence/brain/snapshot'), '智能服务请求失败'),

  /** 行动中心：多域风险转可执行任务 */
  getActionCenter: async () =>
    unwrapApiData<ActionCenterResponse>(await api.get('/intelligence/action-center'), '智能服务请求失败'),

  submitActionTaskFeedback: async (payload: ActionTaskFeedbackRequest) =>
    unwrapApiData<ActionTaskFeedbackItem>(await api.post('/intelligence/action-center/task-feedback', payload), '智能服务请求失败'),

  listActionTaskFeedback: async (limit = 20) =>
    unwrapApiData<ActionTaskFeedbackItem[]>(await api.get('/intelligence/action-center/task-feedback/list', { params: { limit } }), '智能服务请求失败'),

  /** 服务端租户级智能开关，优先级应高于前端 localStorage */
  getTenantSmartFeatureFlags: async () =>
    unwrapApiData<Record<string, boolean>>(await api.get('/system/tenant-smart-feature/list'), '智能服务请求失败'),

  /** @deprecated 使用 tenantSmartFeatureService.save 替代 */
  saveTenantSmartFeatureFlags: async (features: Record<string, boolean>) =>
    unwrapApiData<Record<string, boolean>>(await api.put('/system/tenant-smart-feature', { features }), '智能服务请求失败'),

  precheckScan: async (payload: {
    orderId?: string;
    orderNo?: string;
    stageName?: string;
    processName?: string;
    quantity?: number;
    operatorId?: string;
    operatorName?: string;
  }) => unwrapApiData<{ riskLevel?: string; issues?: Array<{ title?: string; reason?: string; suggestion?: string }> }>(await api.post('/intelligence/precheck/scan', payload), '智能服务请求失败'),

  predictFinishTime: async (payload: {
    orderId?: string;
    orderNo?: string;
    styleNo?: string;
    stageName?: string;
    processName?: string;
    currentProgress?: number;
  }) => unwrapApiData<{
    predictedFinishTime?: string;
    confidence?: number;
    reasons?: string[];
    suggestions?: string[];
    predictionId?: string;
    totalQuantity?: number;
    doneQuantity?: number;
    remainingQuantity?: number;
  }>(await api.post('/intelligence/predict/finish-time', payload), '智能服务请求失败'),

  /** 出入库智能分流建议 */
  recommendInout: async (payload: {
    orderNo?: string;
    operatorId?: string;
    operatorName?: string;
    purchaseIds?: string[];
  }) => unwrapApiData<{
    strategy?: string;
    reason?: string;
    suggestions?: string[];
    relatedPurchaseIds?: string[];
  }>(await api.post('/intelligence/recommend/inout', payload), '智能服务请求失败'),

  /** 反馈闭环 — 静默提交实际完成数据 */
  feedback: async (payload: {
    predictionId?: string;
    suggestionType?: string;
    reasonCode?: string;
    reasonText?: string;
    orderId?: string;
    orderNo?: string;
    stageName?: string;
    processName?: string;
    predictedFinishTime?: string;
    actualFinishTime?: string;
    actualResult?: string;
    acceptedSuggestion?: boolean;
  }) => unwrapApiData<{
    accepted?: boolean;
    deviationMinutes?: number;
    message?: string;
  }>(await api.post('/intelligence/feedback', payload), '智能服务请求失败'),

  /** 工人效率画像 */
  workerProfile: async (payload: {
    operatorName?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => unwrapApiData<{
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
  }>(await api.post('/intelligence/worker-profile', payload), '智能服务请求失败'),

  // ── 第二批智能化 API ──

  /** 工序瓶颈检测 */
  detectBottleneck: async (payload?: { orderId?: string; orderNo?: string }) =>
    unwrapApiData<BottleneckDetectionResponse>(await api.post('/intelligence/bottleneck/detect', payload ?? {}), '智能服务请求失败'),

  /** 交期风险评估 */
  assessDeliveryRisk: async (payload?: { orderId?: string }) =>
    unwrapApiData<DeliveryRiskResponse>(await api.post('/intelligence/delivery-risk/assess', payload ?? {}), '智能服务请求失败'),

  /** 异常行为检测 */
  detectAnomalies: async () =>
    unwrapApiData<AnomalyDetectionResponse>(await api.post('/intelligence/anomaly/detect', {}), '智能服务请求失败'),

  /** 智能派工推荐 */
  recommendAssignment: async (payload: { stageName: string; quantity?: number; orderId?: string }) =>
    unwrapApiData<SmartAssignmentResponse>(await api.post('/intelligence/smart-assignment/recommend', payload), '智能服务请求失败'),

  /** AI 学习报告 */
  getLearningReport: async () =>
    unwrapApiData<LearningReportResponse>(await api.get('/intelligence/learning-report'), '智能服务请求失败'),

  /** 手动触发 AI 学习 */
  triggerLearning: async () =>
    unwrapApiData<{ message: string; updatedCount: number }>(await api.post('/intelligence/learning/trigger', {}), '智能服务请求失败'),

  // ── 第三批：12大黑科技 API ──

  /** ① 实时生产脉搏 */
  getLivePulse: async () =>
    unwrapApiData<LivePulseResponse>(await api.post('/intelligence/live-pulse', {}), '智能服务请求失败'),

  /** ② 工人效率画像 */
  getWorkerEfficiency: async () =>
    unwrapApiData<WorkerEfficiencyResponse>(await api.post('/intelligence/worker-efficiency', {}), '智能服务请求失败'),

  /** ③ 完工日期预测 */
  predictDelivery: async (payload: { orderId: string }) =>
    unwrapApiData<DeliveryPredictionResponse>(await api.post('/intelligence/delivery-prediction', payload), '智能服务请求失败'),

  /** ③b 预下单三档交期预测（不依赖 orderId，下单页详情抽屉用） */
  predictPreOrderDelivery: async (payload: PreOrderDeliveryPredictionRequest) =>
    unwrapApiData<PreOrderDeliveryPredictionResponse>(await api.post('/intelligence/pre-order-delivery-prediction', payload), '智能服务请求失败'),

  /** ③c 工厂在产订单明细（下单页详情抽屉用） */
  getFactoryActiveOrders: async (factoryName: string) =>
    unwrapApiData<FactoryActiveOrderDTO[]>(await api.get('/intelligence/factory-active-orders', { params: { factoryName } }), '智能服务请求失败'),

  /** ③d 工厂逐日产出（产能走势图，2026-10-29）— 口径同预下单预测 factoryDailyVelocity */
  getFactoryDailyOutput: async (factoryName: string, days = 14) =>
    unwrapApiData<FactoryDailyOutputResponse>(
      await api.get('/intelligence/factory-daily-output', { params: { factoryName, days } }),
      '智能服务请求失败',
    ),

  /** ④ 订单利润预估 */
  estimateProfit: async (payload: { orderId: string }) =>
    unwrapApiData<ProfitEstimationResponse>(await api.post('/intelligence/profit-estimation', payload), '智能服务请求失败'),

  /** ⑤ 工厂绩效排行 */
  getFactoryLeaderboard: async () =>
    unwrapApiData<FactoryLeaderboardResponse>(await api.post('/intelligence/factory-leaderboard', {}), '智能服务请求失败'),

  /** ⑥ 生产节奏DNA */
  getRhythmDna: async () =>
    unwrapApiData<RhythmDnaResponse>(await api.post('/intelligence/rhythm-dna', {}), '智能服务请求失败'),

  /** ⑦ 智能异常自愈（诊断） */
  runSelfHealing: async () =>
    unwrapApiData<SelfHealingResponse>(await api.post('/intelligence/self-healing', {}), '智能服务请求失败'),

  /** ⑦b 智能异常自愈 — 一键修复 */
  runSelfHealingRepair: async () =>
    unwrapApiData<SelfHealingResponse>(await api.post('/intelligence/self-healing/repair', {}), '智能服务请求失败'),

  /** Agent例会 — 召开 */
  holdAgentMeeting: async (topic: string, meetingType?: string) =>
    unwrapApiData<AgentMeetingRecord>(await api.post('/intelligence/meeting/hold', { topic, meetingType: meetingType ?? 'decision_debate' }), '智能服务请求失败'),

  /** Agent例会 — 历史列表 */
  listAgentMeetings: async (limit = 10) =>
    unwrapApiData<AgentMeetingRecord[]>(await api.get(`/intelligence/meeting/list?limit=${limit}`), '智能服务请求失败'),

  /** ⑧ 小程序智能提醒 */
  getSmartNotifications: async () =>
    unwrapApiData<SmartNotificationResponse>(await api.post('/intelligence/smart-notification', {}), '智能服务请求失败'),

  /** ⑨ AI决策助手 */
  nlQuery: async (payload: { question: string }) =>
    unwrapApiData<NlQueryResponse>(await api.post('/intelligence/nl-query', payload), '智能服务请求失败'),

  /** ⑩ 供应链健康指数 */
  getHealthIndex: async () =>
    unwrapApiData<HealthIndexResponse>(await api.post('/intelligence/health-index', {}), '智能服务请求失败'),

  /** ⑪ 自动排产建议 */
  suggestScheduling: async (payload: { styleNo: string; quantity: number; deadline: string; productCategory?: string }) =>
    unwrapApiData<SchedulingSuggestionResponse>(await api.post('/intelligence/scheduling-suggestion', payload), '智能服务请求失败'),

  /** ⑪-2 采纳排产建议（D-754 P4）：写回订单工厂/计划起止并留采纳痕迹 */
  adoptScheduling: async (payload: {
    orderId: string;
    factoryName: string;
    factoryId?: string;
    plannedStartDate?: string;
    plannedEndDate?: string;
    matchScore?: number;
    reason?: string;
  }) =>
    unwrapApiData<SchedulingAdoptionResult>(await api.post('/intelligence/scheduling-suggestion/adopt', payload), '智能服务请求失败'),

  /** ⑫ 质量缺陷热力图 */
  getDefectHeatmap: async () =>
    unwrapApiData<DefectHeatmapResponse>(await api.post('/intelligence/defect-heatmap', {}), '智能服务请求失败'),

  /** ⑬ 财务审核智能分析 */
  getFinanceAudit: async () =>
    unwrapApiData<FinanceAuditResponse>(await api.post('/intelligence/finance-audit', {}), '智能服务请求失败'),

  /** ⑭ 产能缺口分析（下单页详情抽屉用） */
  getCapacityGap: async () =>
    unwrapApiData<CapacityGapResponse>(await api.get('/intelligence/capacity-gap'), '智能服务请求失败'),

  // ── 嵌入式智能 API ──

  /** 次品溯源（按订单聚合） */
  getDefectTrace: async (orderId: string) =>
    unwrapApiData<DefectTraceResponse>(await api.get('/intelligence/defect-trace', { params: { orderId } }), '智能服务请求失败'),

  /** 款式报价建议（按款号聚合） */
  getStyleQuoteSuggestion: async (styleNo: string) =>
    unwrapApiData<StyleQuoteSuggestionResponse>(await api.get('/intelligence/style-quote-suggestion', { params: { styleNo } }), '智能服务请求失败'),

  /** 款式智能档案卡（按款式聚合开发/生产/库存/财务） */
  getStyleIntelligenceProfile: async (params: { styleId?: string | number; styleNo?: string }) =>
    unwrapApiData<StyleIntelligenceProfileResponse>(await api.get('/intelligence/style-profile', { params }), '智能服务请求失败'),

  /** 款式制作难度 AI 增强分析（用户主动触发，含图像分析） */
  analyzeStyleDifficulty: async (params: { styleId: number | string; coverUrl?: string }) =>
    unwrapApiData<DifficultyAssessment>(await api.post('/intelligence/style-difficulty', params), '智能服务请求失败'),

  /** 工序单价 AI 提示 */
  getProcessPriceHint: async (processName: string, standardTime?: number) =>
    unwrapApiData<ProcessPriceHintResponse>(await api.get('/intelligence/process-price-hint', {
      params: { processName, ...(standardTime != null ? { standardTime } : {}) },
    }), '智能服务请求失败'),

  /** 工序知识库 */
  getProcessKnowledge: async (keyword?: string, category?: string, difficultyLevel?: string) =>
    unwrapApiData<ProcessKnowledgeResponse>(await api.get('/intelligence/process-knowledge', {
      params: {
        ...(keyword ? { keyword } : {}),
        ...(category ? { category } : {}),
        ...(difficultyLevel ? { difficultyLevel } : {}),
      },
    }), '智能服务请求失败'),

  /** 面料缺口预测 */
  getMaterialShortage: async () =>
    unwrapApiData<MaterialShortageResult>(await api.get('/intelligence/material-shortage'), '智能服务请求失败'),

  /** 工厂工序瓶颈分析 — 基于真实扫码数据 */
  getFactoryBottleneck: async () =>
    unwrapApiData<FactoryBottleneckItem[]>(await api.get('/intelligence/factory-bottleneck'), '智能服务请求失败'),

  /** 环节瓶颈热力看板 — 工厂×环节积压量 + 按在岗人力折算的消化天数（D-754 P2） */
  getStageBottleneckHeatmap: async () =>
    unwrapApiData<StageBottleneckHeatmapResponse>(await api.get('/intelligence/advanced/stage-bottleneck/heatmap'), '智能服务请求失败'),

  /** 最近智能建议反馈原因 */
  listFeedbackReasons: async (limit = 20) =>
    unwrapApiData<FeedbackReasonRecord[]>(await api.get('/intelligence/feedback-reason/list', {
      params: { limit },
    }), '智能服务请求失败'),

  /** AI顾问状态（是否已配置 DEEPSEEK_API_KEY） */
  getAiAdvisorStatus: async () =>
    unwrapApiData<{ enabled: boolean; message: string }>(await api.get('/intelligence/ai-advisor/status'), '智能服务请求失败'),

  /** AI顾问问答 — 优先本地规则引擎，无法回答时走 DeepSeek */
  /**
   * D-755：rawQuestion 是「用户原话」。
   *
   * question 里同时含页面快捷建议与历史对话摘要（buildContextualText 拼接），
   * 后端直查判定是「包含关键词」的松散正则 —— 只看原话才能避免
   * 「停在生产管理页 → 任何问题（连订单号）都被异常检测直查劫持」。
   */
  aiAdvisorChat: async (question: string, rawQuestion?: string) =>
    unwrapApiData<{
      answer: string;
      displayAnswer?: string;
      source: 'local' | 'ai' | 'none' | 'error';
      commandId?: string;
      suggestions?: string[];
      cards?: Array<Record<string, unknown>>;
    }>(await api.post(
      '/intelligence/ai-advisor/chat',
      { question, rawQuestion },
      { timeout: 90000 },
    ), '智能服务请求失败'),

  getAiAgentTraceDetail: async (commandId: string) =>
    unwrapApiData<{ commandId: string; logs: Array<Record<string, unknown>>; count: number }>(await api.get(`/intelligence/ai-agent/traces/${commandId}`), '智能服务请求失败'),

  getAiAgentRecentTraces: async (params?: {
    limit?: number;
    toolName?: string;
    status?: string;
    executorKeyword?: string;
    startTime?: string;
    endTime?: string;
  }) =>
    unwrapApiData<Array<Record<string, unknown>>>(await api.get('/intelligence/ai-agent/traces/recent', { params }), '智能服务请求失败'),

  getAgentActivityList: async () =>
    unwrapApiData<Array<Record<string, unknown>>>(await api.get('/intelligence/agent-activity/agents'), '智能服务请求失败'),

  getAgentTrajectory: async (agentId: string, startTime?: string, endTime?: string) =>
    unwrapApiData<Array<Record<string, unknown>>>(await api.get(`/intelligence/agent-activity/agents/${agentId}/trajectory`, {
      params: { startTime, endTime },
    }), '智能服务请求失败'),

  getAgentDepartmentStats: async () =>
    unwrapApiData<Array<Record<string, unknown>>>(await api.get('/intelligence/agent-activity/departments'), '智能服务请求失败'),

  getAgentAlerts: async () =>
    unwrapApiData<Array<Record<string, unknown>>>(await api.get('/intelligence/agent-activity/alerts'), '智能服务请求失败'),

  /** SafeAdvisor — RAG 增强问答（知识库召回 + DeepSeek 推理，精度更高） */
  safeAdvisorAnalyze: async (question: string) =>
    unwrapApiData<{ answer: string; source: string }>(await api.post(
      '/intelligence/safe-advisor/analyze',
      { question },
      { timeout: 90000 },
    ), '智能服务请求失败'),

  /** AI顾问流式问答 — SSE 实时推送思考/工具调用/回答事件 */
  aiAdvisorChatStream: (
    question: string,
    pageContext: string | undefined,
    onEvent: (event: { type: string; data: Record<string, unknown> }) => void,
    onDone: () => void,
    onError: (err: string) => void,
    imageUrl?: string,
    /** D-755：用户原话。后端直查判定只看它，不看含页面建议/历史摘要的 question */
    rawQuestion?: string,
  ) => {
    const token = localStorage.getItem('authToken') || '';
    let url = `/api/intelligence/ai-advisor/chat/stream?question=${encodeURIComponent(question)}`;
    if (pageContext) url += `&pageContext=${encodeURIComponent(pageContext)}`;
    if (imageUrl && imageUrl.startsWith('http')) url += `&imageUrl=${encodeURIComponent(imageUrl)}`;
    if (rawQuestion && rawQuestion.trim()) url += `&rawQuestion=${encodeURIComponent(rawQuestion)}`;
    const ctrl = new AbortController();
    fetch(url, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (res.status === 401) {
          try { localStorage.removeItem('authToken'); localStorage.removeItem('userId'); } catch { /* ignore */ }
          const w = window as unknown as Window & { __appAuthLogoutNavigate?: () => void };
          if (typeof w.__appAuthLogoutNavigate === 'function') w.__appAuthLogoutNavigate();
          else window.location.href = '/login';
          onError('登录已过期，请重新登录');
          return;
        }
        if (!res.ok || !res.body) {
          onError(`HTTP ${res.status}`);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let eventName = '';
        let doneCalled = false;
        const safeDone = () => { if (doneCalled) return; doneCalled = true; onDone(); };
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith(':')) {
              // D-861：后端心跳是 SSE comment（": heartbeat <ts>"），此前直接 continue 丢弃，
              // 前端的 inactivity 计时器永远得不到重置 → 长回答被误判为「小云思考时间较长」。
              if (line.includes('heartbeat')) {
                onEvent({ type: 'heartbeat', data: {} });
              }
              continue;
            } else if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              const dataStr = line.slice(5).trim();
              if (eventName) {
                try {
                  const parsed = JSON.parse(dataStr);
                  if (eventName === 'done') {
                    safeDone();
                  } else {
                    onEvent({ type: eventName, data: parsed });
                  }
                } catch {
                  onEvent({ type: eventName, data: { content: dataStr } });
                }
              }
              eventName = '';
            } else if (line.trim() === '') {
              eventName = '';
            }
          }
        }
        safeDone();
      })
      .catch((err) => {
        if (err.name !== 'AbortError') onError(err.message || '网络错误');
      });
    return ctrl;
  },

  // ── 第五批：新建订单智能辅助 ──

  /** 交货期智能建议 */
  getDeliveryDateSuggestion: async (factoryName?: string, orderQuantity?: number) =>
    unwrapApiData<DeliveryDateSuggestionResponse>(await api.get(
      '/intelligence/delivery-date-suggestion',
      { params: { ...(factoryName ? { factoryName } : {}), ...(orderQuantity != null ? { orderQuantity } : {}) } },
    ), '智能服务请求失败'),

  /** 工序AI补全 */
  getProcessTemplate: async (category?: string, styleId?: string) =>
    unwrapApiData<ProcessTemplateResponse>(await api.get(
      '/intelligence/process-template',
      { params: { ...(category ? { category } : {}), ...(styleId ? { styleId } : {}) } },
    ), '智能服务请求失败'),

  // ── 第六批：MindPush 主动推送中枢 + OrderTrack 客户进度门户 ──

  /** 获取推送规则配置和最近日志 */
  getMindPushStatus: async () =>
    unwrapApiData<MindPushStatusData>(await api.get('/intelligence/mind-push/status'), '智能服务请求失败'),

  /** 保存推送规则（启停/阈值） */
  saveMindPushRule: async (rule: MindPushRuleDTO) =>
    unwrapApiData<string>(await api.post('/intelligence/mind-push/rule', rule), '智能服务请求失败'),

  /** 手动触发推送检测，返回触发条数 */
  runMindPushCheck: async () =>
    unwrapApiData<number>(await api.post('/intelligence/mind-push/check', {}), '智能服务请求失败'),

  /** 保存推送时段（所有规则统一时段） */
  savePushTime: async (notifyTimeStart: string, notifyTimeEnd: string) =>
    unwrapApiData<string>(await api.post('/intelligence/mind-push/push-time', { notifyTimeStart, notifyTimeEnd }), '智能服务请求失败'),

  /** 生成订单分享 token（固定1小时有效） */
  generateShareToken: async (orderId: string) =>
    unwrapApiData<string>(await api.post('/intelligence/order-track/generate-token', { orderId }), '智能服务请求失败'),

  /** 撤销订单分享 token */
  revokeShareToken: async (orderId: string) =>
    unwrapApiData<string>(await api.delete(`/intelligence/order-track/revoke/${orderId}`), '智能服务请求失败'),

  // ── 第七批：款式报价 + 供应商评分卡 + 实时成本追踪 ──

  /** 供应商智能评分卡（近3个月工厂履约/质量得分） */
  getSupplierScorecard: async () =>
    unwrapApiData<SupplierScorecardResponse>(await api.get('/intelligence/supplier-scorecard'), '智能服务请求失败'),

  /** 实时成本追踪（订单工序成本进度与利润预估） */
  getLiveCostTracker: async (orderId: string) =>
    unwrapApiData<LiveCostResponse>(await api.get('/intelligence/live-cost', { params: { orderId } }), '智能服务请求失败'),

  /** 销量预测（基于历史入库数据的WMA预测） */
  getSalesForecast: async (styleNo: string, horizonMonths = 1) =>
    unwrapApiData<import('./intelligenceTypes').SalesForecastResponse>(await api.get('/intelligence/sales-forecast', {
      params: { styleNo, horizonMonths },
    }), '智能服务请求失败'),

  /** 尺码曲线预测（基于历史入库数据的尺码分布） */
  getSizeCurve: async (styleNo: string) =>
    unwrapApiData<import('./intelligenceTypes').SizeCurveResponse>(await api.get('/intelligence/size-curve', {
      params: { styleNo },
    }), '智能服务请求失败'),

  // ── 专业报告 ──

  /** 获取专业运营报告 JSON 摘要（卡片预览，与 Excel 同源数据） */
  getProfessionalReportPreview: async (type: 'daily' | 'weekly' | 'monthly' = 'daily', date?: string) =>
    unwrapApiData<import('@/components/common/GlobalAiAssistant/types').ReportPreviewData>(await api.get(
      '/intelligence/professional-report/preview',
      { params: date ? { type, date } : { type } },
    ), '智能服务请求失败'),

  /** 下载专业运营报告（Excel） */
  downloadProfessionalReport: async (type: 'daily' | 'weekly' | 'monthly' = 'daily', date?: string) => {
    const params = new URLSearchParams({ type });
    if (date) params.append('date', date);

    const token = localStorage.getItem('authToken') || '';
    if (token) params.append('token', token);

    downloadFile(`/api/intelligence/professional-report/download?${params.toString()}`);
    await new Promise(r => setTimeout(r, 500));
  },

  // ── 文件上传分析 ──

  /** 上传 Excel/CSV/图片，解析为 Markdown 文本供 AI 分析 */
  uploadAnalyze: async (file: File): Promise<{ filename: string; parsedContent: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('authToken') || '';
    const res = await fetch('/api/intelligence/ai-advisor/upload-analyze', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const json = await res.json() as { code: number; data: { filename: string; parsedContent: string }; message?: string };
    if (json.code !== 200) throw new Error(json.message ?? '文件分析失败');
    return json.data;
  },

  recognizePurchaseDoc: async (file: File, orderNo?: string): Promise<Record<string, unknown>> => {
    const formData = new FormData();
    formData.append('file', file);
    if (orderNo) formData.append('orderNo', orderNo);
    const token = localStorage.getItem('authToken') || '';
    const res = await fetch(`/api/production/purchase/recognize-doc${orderNo ? `?orderNo=${encodeURIComponent(orderNo)}` : ''}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const json = await res.json() as { code: number; data: Record<string, unknown>; message?: string };
    if (json.code !== 200) throw new Error(json.message ?? '采购单据识别失败');
    return json.data;
  },

  autoExecutePurchaseDoc: async (payload: {
    docId?: string;
    orderNo?: string;
    warehouseLocation?: string;
    confirmInbound?: boolean;
  }): Promise<Record<string, unknown>> => {
    const resp = await api.post<PurchaseDocExecResponse>('/production/purchase/auto-execute-doc', payload);
    // 后端可能返回双层嵌套（resp.data 内层为带 code 的响应），用类型守卫处理
    const inner = (typeof resp.data === 'object' && resp.data !== null && 'code' in resp.data)
      ? resp.data as unknown as PurchaseDocExecResponse
      : undefined;
    if (inner?.code && inner.code !== 200) throw new Error(inner.message ?? '采购单据自动执行失败');
    return inner?.data ?? resp.data;
  },

  replayPurchaseDoc: async (payload: { docId?: string; orderNo?: string }): Promise<Record<string, unknown>> => {
    const resp = await api.post<PurchaseDocExecResponse>('/production/purchase/replay-doc', payload);
    const inner = (typeof resp.data === 'object' && resp.data !== null && 'code' in resp.data)
      ? resp.data as unknown as PurchaseDocExecResponse
      : undefined;
    if (inner?.code && inner.code !== 200) throw new Error(inner.message ?? '采购单据回放失败');
    return inner?.data ?? resp.data;
  },

  /** 催单：更新订单的预计出货日期和备注 */
  quickEditOrder: async (payload: {
    orderNo: string;
    expectedShipDate?: string;
    remarks?: string;
    urgencyLevel?: string;
  }): Promise<void> => {
    const token = localStorage.getItem('authToken') || '';
    const res = await fetch('/api/production/order/quick-edit', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json() as { code: number; message?: string };
    if (json.code !== 200) throw new Error(json.message ?? '更新失败');
  },

  /** 超级顾问：主对话 */
  hyperAdvisorAsk: async (sessionId: string, userMessage: string): Promise<HyperAdvisorResponse> => {
    const resp = await api.post<ApiResult<HyperAdvisorResponse>>('/hyper-advisor/ask', { sessionId, userMessage });
    return (resp?.data ?? resp) as HyperAdvisorResponse;
  },

  /** 超级顾问：评分反馈 */
  hyperAdvisorFeedback: async (params: {
    sessionId: string; traceId: string; query: string; advice: string; score: number; feedbackText?: string;
  }): Promise<void> => {
    await unwrapApiData<unknown>(await api.post('/hyper-advisor/feedback', params), '智能服务请求失败');
  },

  /** P0: AI Agent 对话消息显式反馈（👍/👎），写入 PRM 表用于自适应工具权重 */
  submitAiMessageFeedback: async (params: {
    sessionId: string; commandId?: string; score: number; userQuery?: string; aiContent?: string;
  }): Promise<void> => {
    await unwrapApiData<unknown>(await api.post('/intelligence/feedback-reason/ai-message-feedback', params), '智能服务请求失败');
  },

  /** 超级顾问：加载历史聊天记录（按 createTime 升序） */
  hyperAdvisorHistory: async (sessionId: string): Promise<ChatHistoryMessage[]> => {
    const resp = await api.get<ApiResult<ChatHistoryMessage[]>>(`/hyper-advisor/history/${sessionId}`);
    return Array.isArray(resp?.data) ? resp.data : [];
  },

  /**
   * D-871：按当前用户拉最近对话（不限 sessionId，后端返回时间倒序）。
   * 主对话历史此前按 localStorage sessionId 查，换 session/清缓存就全空——
   * 打开小云看到「新界面」的真因就在这里，与后端是否存了历史是两件事。
   */
  recentAdvisorHistory: async (limit = 60): Promise<ChatHistoryMessage[]> => {
    const resp = await api.get<ApiResult<ChatHistoryMessage[]>>('/hyper-advisor/history/recent', { params: { limit } });
    const list = Array.isArray(resp?.data) ? resp.data : [];
    // 后端按 create_time 倒序取最近 N 条，前端展示要按时间正序
    return list.slice().reverse();
  },

  /** 小云全域待办任务聚合：裁剪/质检/返修/物料/逾期订单/异常/样衣/工资/对账/报销 */
  getMyPendingTasks: async () =>
    unwrapApiData<import('./intelligenceTypes').PendingTaskDTO[]>(await api.get('/intelligence/pending-tasks/my', { retry: 0 } as ApiRequestConfig), '智能服务请求失败'),

  getMyPendingTaskSummary: async () =>
    unwrapApiData<import('./intelligenceTypes').PendingTaskSummaryDTO>(await api.get('/intelligence/pending-tasks/summary', { retry: 0 } as ApiRequestConfig), '智能服务请求失败'),

  createTask: async (data: Record<string, unknown>) =>
    unwrapApiData<Record<string, unknown>>(await api.post('/intelligence/task-center/tasks', data), '智能服务请求失败'),

  updateTask: async (taskId: string, data: Record<string, unknown>) =>
    unwrapApiData<Record<string, unknown>>(await api.put(`/intelligence/task-center/tasks/${taskId}`, data), '智能服务请求失败'),

  deleteTask: (taskId: string) =>
    api.delete<{ code: number }>(`/intelligence/task-center/tasks/${taskId}`),

  claimTask: async (taskId: string) =>
    unwrapApiData<Record<string, unknown>>(await api.post(`/intelligence/task-center/tasks/${taskId}/claim`), '智能服务请求失败'),

  getMyTasks: async (status?: string, priority?: string, module?: string, page?: number, size?: number, includeCompleted?: boolean) =>
    unwrapApiData<{ rows: unknown[]; total: number }>(await api.get('/intelligence/task-center/my-tasks', {
      params: { status, priority, module, includeCompleted, page: page ?? 1, size: size ?? 50 }
    }), '智能服务请求失败'),

  updateTaskStatus: async (taskId: string, status: string, note?: string) =>
    unwrapApiData<Record<string, unknown>>(await api.put(`/intelligence/task-center/tasks/${taskId}/status`, {
      status, note: note ?? ''
    }), '智能服务请求失败'),

  // 订单关联和监控 API
  linkTaskToOrder: async (taskId: string, orderNo: string) =>
    unwrapApiData<Record<string, unknown>>(await api.post(`/intelligence/task-center/tasks/${taskId}/link-order`, { orderNo }), '智能服务请求失败'),

  refreshTaskOrderStatus: async (taskId: string) =>
    unwrapApiData<Record<string, unknown>>(await api.post(`/intelligence/task-center/tasks/${taskId}/refresh-order-status`), '智能服务请求失败'),

  getTasksByOrderNo: async (orderNo: string) =>
    unwrapApiData<Record<string, unknown>[]>(await api.get(`/intelligence/task-center/tasks/by-order/${orderNo}`), '智能服务请求失败'),

  scanOrphanData: async () =>
    unwrapApiData<import('./intelligenceTypes').OrphanDataScanResultDTO>(await api.get('/intelligence/orphan-data/scan'), '智能服务请求失败'),

  listOrphanData: async (tableName: string, page = 1, pageSize = 20) =>
    unwrapApiData<import('./intelligenceTypes').OrphanDataItemDTO[]>(await api.get('/intelligence/orphan-data/list', {
      params: { tableName, page, pageSize },
    }), '智能服务请求失败'),

  deleteOrphanData: async (tableName: string, ids: string[]) =>
    unwrapApiData<number>(await api.post('/intelligence/orphan-data/delete', { tableName, ids }), '智能服务请求失败'),

  platformSuperDashboard: async (days = 30): Promise<Record<string, unknown>> =>
    unwrapApiData<Record<string, unknown>>(await api.get('/intelligence/platform/super-dashboard', { params: { days } }), '智能服务请求失败') ?? {},

  platformToolPerformance: async (days = 30): Promise<Record<string, unknown>[]> =>
    unwrapApiData<Record<string, unknown>[]>(await api.get('/intelligence/platform/tool-performance', { params: { days } }), '智能服务请求失败') ?? [],

  platformDecisionAdoption: async (days = 30): Promise<Record<string, unknown>[]> =>
    unwrapApiData<Record<string, unknown>[]>(await api.get('/intelligence/platform/decision-adoption', { params: { days } }), '智能服务请求失败') ?? [],

  platformPatrolMttr: async (days = 30): Promise<Record<string, unknown>[]> =>
    unwrapApiData<Record<string, unknown>[]>(await api.get('/intelligence/platform/patrol-mttr', { params: { days } }), '智能服务请求失败') ?? [],

  // D-853：AI 决策建议「列表 + 采纳/反馈」。
  // 此前 t_ai_decision_card 有 58 张建议但 adopted 全 0、feedback 0 条——
  // 不是用户不采纳，而是前端没有任何接口能列出/采纳（后端方法写好了没端点）。
  aiDecisionCards: async (limit = 20): Promise<Record<string, unknown>[]> =>
    unwrapApiData<Record<string, unknown>[]>(await api.get('/intelligence/decision-cards', { params: { limit } }), 'AI 建议加载失败') ?? [],

  aiDecisionFeedback: async (id: number, adopted: 0 | 1, reason?: string, feedbackScore?: number): Promise<void> => {
    await api.post(`/intelligence/decision-cards/${id}/feedback`, null, {
      params: { adopted, ...(reason ? { reason } : {}), ...(feedbackScore != null ? { feedbackScore } : {}) },
    });
  },

  evolutionPending: async (): Promise<Record<string, unknown>[]> =>
    unwrapApiData<Record<string, unknown>[]>(await api.get('/intelligence/evolution/pending'), '智能服务请求失败') ?? [],

  evolutionHistory: async (days = 30): Promise<Record<string, unknown>[]> =>
    unwrapApiData<Record<string, unknown>[]>(await api.get('/intelligence/evolution/history', { params: { days } }), '智能服务请求失败') ?? [],

  evolutionActiveOverrides: async (): Promise<Record<string, string>> =>
    unwrapApiData<Record<string, string>>(await api.get('/intelligence/evolution/active-overrides'), '智能服务请求失败') ?? {},

  evolutionApprove: async (proposalId: string): Promise<boolean> =>
    (await unwrapApiData<boolean>(await api.post(`/intelligence/evolution/approve/${proposalId}`), '智能服务请求失败')) === true,

  evolutionRollback: async (proposalId: string): Promise<boolean> =>
    (await unwrapApiData<boolean>(await api.post(`/intelligence/evolution/rollback/${proposalId}`), '智能服务请求失败')) === true,

  evolutionTest: async (proposalId: string): Promise<Record<string, unknown>> =>
    unwrapApiData<Record<string, unknown>>(await api.post(`/intelligence/evolution/test/${proposalId}`), '智能服务请求失败') ?? {},

  evolutionDeploy: async (proposalId: string): Promise<boolean> =>
    (await unwrapApiData<boolean>(await api.post(`/intelligence/evolution/deploy/${proposalId}`), '智能服务请求失败')) === true,

  // ── 命令执行引擎 ──

  executeCommand: async (command: CommandExecutePayload): Promise<CommandExecuteResult> => {
    const response = await api.post<ApiResult<CommandExecuteResult>>('/intelligence/commands/execute', command);
    return response.data;
  },

  approveCommand: async (commandId: string, body?: { remark?: string }): Promise<CommandExecuteResult> => {
    const response = await api.post<ApiResult<CommandExecuteResult>>(`/intelligence/commands/${commandId}/approve`, body || {});
    return response.data;
  },

  rejectCommand: async (commandId: string, body: { reason?: string }): Promise<CommandExecuteResult> => {
    const response = await api.post<ApiResult<CommandExecuteResult>>(`/intelligence/commands/${commandId}/reject`, body);
    return response.data;
  },

  getPendingCommands: async (): Promise<PendingCommandsResponse> => {
    const response = await api.get<ApiResult<PendingCommandsResponse>>('/intelligence/commands/pending');
    if (response == null || (response.code != null && response.code !== 200)) {
      throw new Error(response?.message || '获取待审批命令失败');
    }
    return response.data ?? { pending: [], totalCount: 0 };
  },

  getCommandDetail: async (commandId: string): Promise<CommandDetail> => {
    const response = await api.get<ApiResult<CommandDetail>>(`/intelligence/commands/${commandId}`);
    return response.data;
  },

  // ── 审计/统计 ──

  queryAuditLogs: async (options: AuditLogQuery = {}): Promise<AuditLogQueryResult> => {
    const response = await api.get<ApiResult<AuditLogQueryResult>>('/intelligence/audit-logs', { params: options });
    return response.data;
  },

  getExecutionStats: async (): Promise<ExecutionStats> => {
    const response = await api.get<ApiResult<ExecutionStats>>('/intelligence/execution-stats');
    return response.data;
  },

  getMetricsOverview: async (days = 7): Promise<MetricsSceneStat[]> => {
    const response = await api.get<ApiResult<MetricsSceneStat[]>>('/intelligence/metrics/overview', { params: { days } });
    return response.data;
  },

  // ── 反馈/配置 ──

  submitFeedback: async (commandId: string, feedback: FeedbackData): Promise<CommandExecuteResult | null> => {
    try {
      const response = await api.post<ApiResult<CommandExecuteResult>>(`/intelligence/commands/${commandId}/feedback`, feedback);
      return response.data;
    } catch {
      return null;
    }
  },

  queryWorkflowHistory: async (commandId: string): Promise<WorkflowHistoryResult | null> => {
    try {
      const response = await api.get<ApiResult<WorkflowHistoryResult>>(`/intelligence/commands/${commandId}/workflow`);
      return response.data;
    } catch {
      return null;
    }
  },

  getExecutionConfig: async (): Promise<ExecutionConfig> => {
    try {
      const response = await api.get<ApiResult<ExecutionConfig>>('/intelligence/config');
      return response.data;
    } catch {
      return {
        autoExecutionEnabled: false,
        autoExecutionThreshold: 3,
        approvalTimeoutMinutes: 60,
        notificationEnabled: true,
        auditEnabled: true,
      };
    }
  },

  updateExecutionConfig: async (config: Partial<ExecutionConfig>): Promise<ExecutionConfig | null> => {
    try {
      const response = await api.put<ApiResult<ExecutionConfig>>('/intelligence/config', config);
      return response.data;
    } catch {
      return null;
    }
  },

  // ── 多代理图 ──

  runMultiAgentGraph: async (params: { scene?: string; orderIds?: string[]; question?: string }): Promise<MultiAgentGraphResult> => {
    const response = await api.post<ApiResult<MultiAgentGraphResult>>('/intelligence/multi-agent-graph/run', params);
    return response.data;
  },

  getGraphHistory: async (page = 1, size = 20): Promise<GraphHistoryItem[]> => {
    const response = await api.get<ApiResult<GraphHistoryItem[]>>('/intelligence/multi-agent-graph/history', { params: { page, size } });
    return response.data;
  },

  submitGraphFeedback: async (executionId: string, score: number, note?: string): Promise<void> => {
    await unwrapApiData<unknown>(await api.post('/intelligence/multi-agent-graph/feedback', { executionId, score, note }), '智能服务请求失败');
  },

  getGraphAbStats: async (days = 30): Promise<ABSceneStat[]> => {
    const response = await api.get<ApiResult<ABSceneStat[]>>('/intelligence/multi-agent-graph/ab-stats', { params: { days } });
    return response.data;
  },

  // ── 推演/预测/视觉 ──

  simulateWhatIf: async (params: WhatIfParams): Promise<WhatIfResult> => {
    const response = await api.post<ApiResult<WhatIfResult>>('/intelligence/whatif/simulate', params);
    return unwrapApiData<WhatIfResult>(response, '推演仿真请求失败');
  },

  runForecast: async (params: ForecastRequest): Promise<ForecastResult> => {
    const response = await api.post<ApiResult<ForecastResult>>('/intelligence/forecast', params);
    return response.data;
  },

  visualAnalyze: async (params: VisualAIRequest): Promise<VisualAIResponse> => {
    const response = await api.post<ApiResult<VisualAIResponse>>('/intelligence/visual/analyze', params);
    return response.data;
  },

  styleSearchByImage: async (imageUrl: string, topK = 5): Promise<StyleSearchResult> => {
    const response = await api.post<ApiResult<StyleSearchResult>>('/intelligence/visual/style-search', { imageUrl, topK });
    return response?.data ?? { success: false, matchCount: 0, matches: [] };
  },

  /** 样衣图片结构化字段解析：返回款名建议、颜色列表、品类、季节、图案、面料、袖型、领型、版型 */
  styleParseFromImage: async (imageUrl: string): Promise<StyleFieldParseResult> => {
    const response = await api.post<ApiResult<StyleFieldParseResult>>('/intelligence/visual/style-parse', { imageUrl });
    return response?.data ?? { available: false, errorMessage: '返回为空', colors: [], overallConfidence: 0 };
  },

  /** 发票/收据/采购单据 OCR 识别：返回金额、开票日期、发票号、开票单位、费用类型、税率 */
  receiptParse: async (imageUrl: string): Promise<ReceiptParseResult> => {
    const response = await api.post<ApiResult<ReceiptParseResult>>('/intelligence/visual/receipt-parse', { imageUrl });
    return response?.data ?? { imageUrl, available: false, errorMessage: '返回为空' };
  },

  // ── 巡检 ──

  getPatrolActionsByTarget: async (targetType: string, targetId: string, limit = 10): Promise<PatrolAction[]> => {
    const response = await api.get<ApiResult<PatrolAction[]>>('/intelligence/patrol/actions/by-target', { params: { targetType, targetId, limit } });
    return response?.data ?? [];
  },

  getPatrolRecentActions: async (limit = 20): Promise<PatrolAction[]> => {
    const response = await api.get<ApiResult<PatrolAction[]>>('/intelligence/patrol/actions/recent', { params: { limit } });
    return response?.data ?? [];
  },

  getPatrolSummary: async (): Promise<PatrolSummary> => {
    const response = await api.get<ApiResult<PatrolSummary>>('/intelligence/patrol/summary');
    return response?.data ?? { pendingCount: 0, autoExecutedToday: 0, highRiskPending: 0, recentActions: [] };
  },

  approvePatrolAction: async (actionId: number, remark?: string): Promise<void> => {
    await unwrapApiData<unknown>(await api.post(`/intelligence/patrol/actions/${actionId}/approve`, { remark: remark ?? '' }), '智能服务请求失败');
  },

  rejectPatrolAction: async (actionId: number, remark?: string): Promise<void> => {
    await unwrapApiData<unknown>(await api.post(`/intelligence/patrol/actions/${actionId}/reject`, { remark: remark ?? '' }), '智能服务请求失败');
  },

  getPendingPatrolActions: async (): Promise<PatrolAction[]> => {
    const response = await api.get<ApiResult<PatrolAction[]>>('/intelligence/patrol/actions/pending');
    return response?.data ?? [];
  },

  getPatrolActionsByStatus: async (status?: string, limit?: number): Promise<PatrolAction[]> => {
    const response = await api.get<ApiResult<PatrolAction[]>>('/intelligence/patrol/actions/by-status', { params: { status, limit } });
    return response?.data ?? [];
  },

  executePatrolAction: async (actionId: number, result?: string): Promise<void> => {
    await unwrapApiData<unknown>(await api.post(`/intelligence/patrol/actions/${actionId}/execute`, { result: result ?? '' }), '智能服务请求失败');
  },

  cancelPatrolAction: async (actionId: number, reason?: string): Promise<void> => {
    await unwrapApiData<unknown>(await api.post(`/intelligence/patrol/actions/${actionId}/cancel`, { reason: reason ?? '' }), '智能服务请求失败');
  },

  closePatrolAction: async (actionId: number): Promise<void> => {
    await unwrapApiData<unknown>(await api.post(`/intelligence/patrol/actions/${actionId}/close`), '智能服务请求失败');
  },

  failPatrolAction: async (actionId: number, reason?: string): Promise<void> => {
    await unwrapApiData<unknown>(await api.post(`/intelligence/patrol/actions/${actionId}/fail`, { reason: reason ?? '' }), '智能服务请求失败');
  },

  submitPatrolFeedback: async (actionId: number, feedback: string, rating: number): Promise<void> => {
    await unwrapApiData<unknown>(await api.post(`/intelligence/patrol/actions/${actionId}/feedback`, { feedback, rating: String(rating) }), '智能服务请求失败');
  },

  // ===== P1升级: AI质量评估 =====

  /** 运行Golden Test Dataset回归测试 */
  runGoldenEval: async () =>
    unwrapApiData<{ status: string; total: number; passed: number; avgScore: number; results: Array<Record<string, unknown>> }>(await api.post(
      '/intelligence/golden-eval',
    ), '智能服务请求失败'),

  // ===== P2升级: 安全护栏管理 =====

  /** 查看安全规则配置 */
  getGuardrails: async () =>
    unwrapApiData<Record<string, unknown>>(await api.get('/intelligence/guardrails'), '智能服务请求失败'),

  /** 热更新安全规则 */
  reloadGuardrails: async () =>
    unwrapApiData<{ status: string; message: string }>(await api.post('/intelligence/guardrails/reload'), '智能服务请求失败'),

  // ── 仪表盘卡片专用预测接口 ──

  getDailyBriefing: async (): Promise<DailyBriefing> =>
    unwrapApiData<DailyBriefing>(await api.get('/dashboard/briefing/today'), '智能服务请求失败') ?? ({} as DailyBriefing),

  getDeliveryRisks: async (topN = 10): Promise<PredictionDeliveryRiskItem[]> =>
    unwrapApiData<PredictionDeliveryRiskItem[]>(await api.get(
        '/intelligence/prediction/delivery-risks',
        { params: { topN } },
      ), '智能服务请求失败') ?? [],

  getRestockSuggestions: async (topN = 10): Promise<PredictionRestockSuggestionItem[]> =>
    unwrapApiData<PredictionRestockSuggestionItem[]>(await api.get(
        '/intelligence/prediction/restock-suggestions',
        { params: { topN } },
      ), '智能服务请求失败') ?? [],

  generatePurchaseRequest: async (payload: GeneratePurchaseRequestPayload): Promise<GeneratePurchaseRequestResult> =>
    unwrapApiData<GeneratePurchaseRequestResult>(await api.post(
        '/intelligence/prediction/purchase-request/generate',
        payload,
      ), '智能服务请求失败') ?? ({} as GeneratePurchaseRequestResult),

  getBackgroundActiveTasks: async (limit = 20): Promise<AgentBackgroundTaskDTO[]> =>
    unwrapApiData<AgentBackgroundTaskDTO[]>(await api.get(
        '/intelligence/background-task/active',
        { params: { limit } },
      ), '智能服务请求失败') ?? [],

  getBackgroundTaskList: async (pageNum = 1, pageSize = 20): Promise<BackgroundTaskListResponse> =>
    unwrapApiData<BackgroundTaskListResponse>(await api.get(
        '/intelligence/background-task/list',
        { params: { pageNum, pageSize } },
      ), '智能服务请求失败') ?? { list: [], total: 0, pageNum: 1, pageSize: 20 },

  getBackgroundTaskDetail: async (taskId: string): Promise<AgentBackgroundTaskDTO | null> =>
    unwrapApiData<AgentBackgroundTaskDTO>(await api.get(
        `/intelligence/background-task/${taskId}`,
      ), '智能服务请求失败') ?? null,

  cancelBackgroundTask: async (taskId: string): Promise<boolean> =>
    unwrapApiData<boolean>(await api.post(
        `/intelligence/background-task/${taskId}/cancel`,
      ), '智能服务请求失败') ?? false,

  // ── P1-3: 小云主动洞察（Redis 未读列表 + 标记已读） ──
  getProactiveInsights: async (): Promise<ProactiveInsightItem[]> =>
    unwrapApiData<ProactiveInsightItem[]>(await api.get('/intelligence/insights', { retry: 0 } as ApiRequestConfig), '智能服务请求失败') ?? [],

  markProactiveInsightRead: async (id: string): Promise<boolean> =>
    { await unwrapApiData<null>(await api.post(`/intelligence/insights/${id}/read`), '智能服务请求失败'); return true; },

};

export const getPatrolActionsByTarget = intelligenceApi.getPatrolActionsByTarget;
export const getPatrolSummary = intelligenceApi.getPatrolSummary;
export const getGraphAbStats = intelligenceApi.getGraphAbStats;
export const visualAnalyze = intelligenceApi.visualAnalyze;
export const styleSearchByImage = intelligenceApi.styleSearchByImage;
export const styleParseFromImage = intelligenceApi.styleParseFromImage;
export const runMultiAgentGraph = intelligenceApi.runMultiAgentGraph;
export const getGraphHistory = intelligenceApi.getGraphHistory;
export const submitGraphFeedback = intelligenceApi.submitGraphFeedback;

