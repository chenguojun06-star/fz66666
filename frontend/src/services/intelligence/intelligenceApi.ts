/**
 * 智能运营服务 API — 独立模块
 *
 * 从 services/production/productionApi.ts 提取，避免模块职责混淆。
 * 导入方式：
 *   import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
 *
 * 注意：services/production/productionApi.ts 已保留 re-export，旧导入路径仍兼容。
 */
import api, { type ApiResult } from '../../utils/api';
import { downloadFile } from '../../utils/fileUrl';
import type {
  ActionCenterResponse,
  ActionTaskFeedbackItem,
  ActionTaskFeedbackRequest,
  AgentMeetingRecord,
  AnomalyDetectionResponse,
  ApprovalAdvisorResponse,
  BottleneckDetectionResponse,
  CapacityGapResponse,
  ChatHistoryMessage,
  DefectHeatmapResponse,
  DefectTraceResponse,
  DeliveryDateSuggestionResponse,
  DeliveryPredictionResponse,
  DeliveryRiskResponse,
  DifficultyAssessment,
  FactoryBottleneckItem,
  FactoryLeaderboardResponse,
  FeedbackReasonRecord,
  FinanceAuditResponse,
  HealthIndexResponse,
  HyperAdvisorResponse,
  IntelligenceBrainSnapshotResponse,
  LearningReportResponse,
  LiveCostResponse,
  LivePulseResponse,
  MaterialShortageResult,
  MindPushRuleDTO,
  MindPushStatusData,
  NlQueryResponse,
  ProcessKnowledgeResponse,
  ProcessPriceHintResponse,
  ProcessTemplateResponse,
  ProfitEstimationResponse,
  ReconciliationAnomalyResponse,
  ReplenishmentAdvisorResponse,
  RhythmDnaResponse,
  SchedulingSuggestionResponse,
  SelfHealingResponse,
  SmartAssignmentResponse,
  SmartNotificationResponse,
  StagnantAlertResponse,
  StyleIntelligenceProfileResponse,
  StyleQuoteSuggestionResponse,
  SupplierScorecardResponse,
  WorkerEfficiencyResponse,
} from './intelligenceTypes';

// 类型定义已提取至 intelligenceTypes.ts，此处 re-export 以保持所有消费方导入兼容
export * from './intelligenceTypes';
/* ================================================================
   intelligenceApi — 全部智能运营接口
================================================================ */
export const intelligenceApi = {
  /** AI 大脑总快照：统一感知、判断、行动、学习状态入口 */
  getBrainSnapshot: () =>
    api.get<{ code: number; data: IntelligenceBrainSnapshotResponse }>('/intelligence/brain/snapshot'),

  /** 行动中心：多域风险转可执行任务 */
  getActionCenter: () =>
    api.get<{ code: number; data: ActionCenterResponse }>('/intelligence/action-center'),

  submitActionTaskFeedback: (payload: ActionTaskFeedbackRequest) =>
    api.post<{ code: number; data: ActionTaskFeedbackItem }>('/intelligence/action-center/task-feedback', payload),

  listActionTaskFeedback: (limit = 20) =>
    api.get<{ code: number; data: ActionTaskFeedbackItem[] }>('/intelligence/action-center/task-feedback/list', { params: { limit } }),

  /** 服务端租户级智能开关，优先级应高于前端 localStorage */
  getTenantSmartFeatureFlags: () =>
    api.get<{ code: number; data: Record<string, boolean> }>('/system/tenant-smart-feature/list'),

  saveTenantSmartFeatureFlags: (features: Record<string, boolean>) =>
    api.post<{ code: number; data: Record<string, boolean> }>('/system/tenant-smart-feature/save', { features }),

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

  /** 手动触发 AI 学习 */
  triggerLearning: () =>
    api.post<{ code: number; data: { message: string; updatedCount: number } }>('/intelligence/learning/trigger', {}),

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

  /** ⑦ 智能异常自愈（诊断） */
  runSelfHealing: () =>
    api.post<{ code: number; data: SelfHealingResponse }>('/intelligence/self-healing', {}),

  /** ⑦b 智能异常自愈 — 一键修复 */
  runSelfHealingRepair: () =>
    api.post<{ code: number; data: SelfHealingResponse }>('/intelligence/self-healing/repair', {}),

  /** Agent例会 — 召开 */
  holdAgentMeeting: (topic: string, meetingType?: string) =>
    api.post<{ code: number; data: AgentMeetingRecord }>('/intelligence/meeting/hold', { topic, meetingType: meetingType ?? 'decision_debate' }),

  /** Agent例会 — 历史列表 */
  listAgentMeetings: (limit = 10) =>
    api.get<{ code: number; data: AgentMeetingRecord[] }>(`/intelligence/meeting/list?limit=${limit}`),

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
  suggestScheduling: (payload: { styleNo: string; quantity: number; deadline: string; productCategory?: string }) =>
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
    api.get<{ code: number; data: DefectTraceResponse }>('/intelligence/defect-trace', { params: { orderId } }),

  /** 款式报价建议（按款号聚合） */
  getStyleQuoteSuggestion: (styleNo: string) =>
    api.get<{ code: number; data: StyleQuoteSuggestionResponse }>('/intelligence/style-quote-suggestion', { params: { styleNo } }),

  /** 款式智能档案卡（按款式聚合开发/生产/库存/财务） */
  getStyleIntelligenceProfile: (params: { styleId?: string | number; styleNo?: string }) =>
    api.get<{ code: number; data: StyleIntelligenceProfileResponse }>('/intelligence/style-profile', { params }),

  /** 款式制作难度 AI 增强分析（用户主动触发，含图像分析） */
  analyzeStyleDifficulty: (params: { styleId: number | string; coverUrl?: string }) =>
    api.post<{ code: number; data: DifficultyAssessment }>('/intelligence/style-difficulty', params),

  /** 工序单价 AI 提示 */
  getProcessPriceHint: (processName: string, standardTime?: number) =>
    api.get<{ code: number; data: ProcessPriceHintResponse }>('/intelligence/process-price-hint', {
      params: { processName, ...(standardTime != null ? { standardTime } : {}) },
    }),

  /** 工序知识库 */
  getProcessKnowledge: (keyword?: string) =>
    api.get<{ code: number; data: ProcessKnowledgeResponse }>('/intelligence/process-knowledge', {
      params: keyword ? { keyword } : {},
    }),

  /** 面料缺口预测 */
  getMaterialShortage: () =>
    api.get<{ code: number; data: MaterialShortageResult }>('/intelligence/material-shortage'),

  /** 工厂工序瓶颈分析 — 基于真实扫码数据 */
  getFactoryBottleneck: () =>
    api.get<{ code: number; data: FactoryBottleneckItem[] }>('/intelligence/factory-bottleneck'),

  /** 最近智能建议反馈原因 */
  listFeedbackReasons: (limit = 20) =>
    api.get<{ code: number; data: FeedbackReasonRecord[] }>('/intelligence/feedback-reason/list', {
      params: { limit },
    }),

  /** AI顾问状态（是否已配置 DEEPSEEK_API_KEY） */
  getAiAdvisorStatus: () =>
    api.get<{ code: number; data: { enabled: boolean; message: string } }>('/intelligence/ai-advisor/status'),

  /** AI顾问问答 — 优先本地规则引擎，无法回答时走 DeepSeek */
  aiAdvisorChat: (question: string) =>
    api.post<{ code: number; data: {
      answer: string;
      displayAnswer?: string;
      source: 'local' | 'ai' | 'none' | 'error';
      commandId?: string;
      suggestions?: string[];
      cards?: Array<Record<string, unknown>>;
    } }>(
      '/intelligence/ai-advisor/chat',
      { question },
      { timeout: 90000 },
    ),

  getAiAgentTraceDetail: (commandId: string) =>
    api.get<{ code: number; data: { commandId: string; logs: Array<Record<string, unknown>>; count: number } }>(`/intelligence/ai-agent/traces/${commandId}`),

  getAiAgentRecentTraces: (params?: {
    limit?: number;
    toolName?: string;
    status?: string;
    executorKeyword?: string;
    startTime?: string;
    endTime?: string;
  }) =>
    api.get<{ code: number; data: Array<Record<string, unknown>> }>('/intelligence/ai-agent/traces/recent', { params }),

  getAgentActivityList: () =>
    api.get<{ code: number; data: Array<Record<string, unknown>> }>('/intelligence/agent-activity/agents'),

  getAgentTrajectory: (agentId: string, startTime?: string, endTime?: string) =>
    api.get<{ code: number; data: Array<Record<string, unknown>> }>(`/intelligence/agent-activity/agents/${agentId}/trajectory`, {
      params: { startTime, endTime },
    }),

  getAgentDepartmentStats: () =>
    api.get<{ code: number; data: Array<Record<string, unknown>> }>('/intelligence/agent-activity/departments'),

  getAgentAlerts: () =>
    api.get<{ code: number; data: Array<Record<string, unknown>> }>('/intelligence/agent-activity/alerts'),

  /** SafeAdvisor — RAG 增强问答（知识库召回 + DeepSeek 推理，精度更高） */
  safeAdvisorAnalyze: (question: string) =>
    api.post<{ answer: string; source: string }>(
      '/intelligence/safe-advisor/analyze',
      { question },
      { timeout: 90000 },
    ),

  /** AI顾问流式问答 — SSE 实时推送思考/工具调用/回答事件 */
  aiAdvisorChatStream: (
    question: string,
    pageContext: string | undefined,
    onEvent: (event: { type: string; data: Record<string, unknown> }) => void,
    onDone: () => void,
    onError: (err: string) => void,
  ) => {
    const token = localStorage.getItem('authToken') || '';
    const url = `/api/intelligence/ai-advisor/chat/stream?question=${encodeURIComponent(question)}${pageContext ? `&pageContext=${encodeURIComponent(pageContext)}` : ''}`;
    const ctrl = new AbortController();
    fetch(url, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
      signal: ctrl.signal,
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          onError(`HTTP ${res.status}`);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let doneCalled = false;
        const safeDone = () => { if (doneCalled) return; doneCalled = true; onDone(); };
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          let eventName = '';
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:') && eventName) {
              try {
                const parsed = JSON.parse(line.slice(5).trim());
                if (eventName === 'done') {
                  safeDone();
                } else {
                  onEvent({ type: eventName, data: parsed });
                }
              } catch { /* ignore malformed */ }
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
  getDeliveryDateSuggestion: (factoryName?: string, orderQuantity?: number) =>
    api.get<{ code: number; data: DeliveryDateSuggestionResponse }>(
      '/intelligence/delivery-date-suggestion',
      { params: { ...(factoryName ? { factoryName } : {}), ...(orderQuantity != null ? { orderQuantity } : {}) } },
    ),

  /** 工序AI补全 */
  getProcessTemplate: (category?: string) =>
    api.get<{ code: number; data: ProcessTemplateResponse }>(
      '/intelligence/process-template',
      { params: { ...(category ? { category } : {}) } },
    ),

  // ── 第六批：MindPush 主动推送中枢 + OrderTrack 客户进度门户 ──

  /** 获取推送规则配置和最近日志 */
  getMindPushStatus: () =>
    api.get<{ code: number; data: MindPushStatusData }>('/intelligence/mind-push/status'),

  /** 保存推送规则（启停/阈值） */
  saveMindPushRule: (rule: MindPushRuleDTO) =>
    api.post<{ code: number; data: string }>('/intelligence/mind-push/rule', rule),

  /** 手动触发推送检测，返回触发条数 */
  runMindPushCheck: () =>
    api.post<{ code: number; data: number }>('/intelligence/mind-push/check', {}),

  /** 保存推送时段（所有规则统一时段） */
  savePushTime: (notifyTimeStart: string, notifyTimeEnd: string) =>
    api.post<{ code: number; data: string }>('/intelligence/mind-push/push-time', { notifyTimeStart, notifyTimeEnd }),

  /** 生成订单分享 token（固定1小时有效） */
  generateShareToken: (orderId: string) =>
    api.post<{ code: number; data: string }>('/intelligence/order-track/generate-token', { orderId }),

  /** 撤销订单分享 token */
  revokeShareToken: (orderId: string) =>
    api.delete<{ code: number; data: string }>(`/intelligence/order-track/revoke/${orderId}`),

  // ── 第七批：款式报价 + 供应商评分卡 + 实时成本追踪 ──

  /** 供应商智能评分卡（近3个月工厂履约/质量得分） */
  getSupplierScorecard: () =>
    api.get<{ code: number; data: SupplierScorecardResponse }>('/intelligence/supplier-scorecard'),

  /** 实时成本追踪（订单工序成本进度与利润预估） */
  getLiveCostTracker: (orderId: string) =>
    api.get<{ code: number; data: LiveCostResponse }>('/intelligence/live-cost', { params: { orderId } }),

  // ── 专业报告下载 ──

  /** 下载专业运营报告（Excel） */
  downloadProfessionalReport: async (type: 'daily' | 'weekly' | 'monthly' = 'daily', date?: string) => {
    const params = new URLSearchParams({ type });
    if (date) params.append('date', date);

    const token = localStorage.getItem('authToken') || '';
    if (token) params.append('token', token);

    downloadFile(`/api/intelligence/professional-report/download?${params.toString()}`);
    await new Promise(r => setTimeout(r, 500));
  },

  // ── 第八批：B阶段新增智能驾驶舱能力 ──

  /** B2 - 产能缺口分析 */
  getCapacityGap: () =>
    api.get<{ code: number; data: CapacityGapResponse }>('/intelligence/capacity-gap'),

  /** B3 - 停滞订单预警 */
  getStagnantAlert: () =>
    api.get<{ code: number; data: StagnantAlertResponse }>('/intelligence/stagnant-alert'),

  /** B5 - 对账异常优先级 */
  getReconciliationAnomalyPriority: () =>
    api.get<{ code: number; data: ReconciliationAnomalyResponse }>('/intelligence/reconciliation/anomaly-priority'),

  /** B6 - 审批 AI 建议 */
  getApprovalAiAdvice: () =>
    api.get<{ code: number; data: ApprovalAdvisorResponse }>('/intelligence/approval/ai-advice'),

  /** B8 - 补料采购建议 */
  getReplenishmentSuggestion: () =>
    api.get<{ code: number; data: ReplenishmentAdvisorResponse }>('/intelligence/replenishment/suggest'),

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
    const resp = await api.post<{ code: number; data: Record<string, unknown>; message?: string }>('/production/purchase/auto-execute-doc', payload);
    const raw = (resp as unknown as { data?: { code?: number; data?: Record<string, unknown>; message?: string } }).data;
    if (raw?.code && raw.code !== 200) throw new Error(raw.message ?? '采购单据自动执行失败');
    return raw?.data ?? (resp as unknown as { data: Record<string, unknown> }).data;
  },

  replayPurchaseDoc: async (payload: { docId?: string; orderNo?: string }): Promise<Record<string, unknown>> => {
    const resp = await api.post<{ code: number; data: Record<string, unknown>; message?: string }>('/production/purchase/replay-doc', payload);
    const raw = (resp as unknown as { data?: { code?: number; data?: Record<string, unknown>; message?: string } }).data;
    if (raw?.code && raw.code !== 200) throw new Error(raw.message ?? '采购单据回放失败');
    return raw?.data ?? (resp as unknown as { data: Record<string, unknown> }).data;
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
    await api.post('/hyper-advisor/feedback', params);
  },

  /** 超级顾问：加载历史聊天记录（按 createTime 升序） */
  hyperAdvisorHistory: async (sessionId: string): Promise<ChatHistoryMessage[]> => {
    const resp = await api.get<ApiResult<ChatHistoryMessage[]>>(`/hyper-advisor/history/${sessionId}`);
    return Array.isArray(resp?.data) ? resp.data : [];
  },

  /** 小云全域待办任务聚合：裁剪/质检/返修/物料/逾期订单/异常/样衣/工资/对账/报销 */
  getMyPendingTasks: () =>
    api.get<{ code: number; data: import('./intelligenceTypes').PendingTaskDTO[] }>('/intelligence/pending-tasks/my'),

  /** 小云待办任务统计摘要（气泡通知用，轻量级） */
  getMyPendingTaskSummary: () =>
    api.get<{ code: number; data: import('./intelligenceTypes').PendingTaskSummaryDTO }>('/intelligence/pending-tasks/summary'),

  scanOrphanData: () =>
    api.get<{ code: number; data: import('./intelligenceTypes').OrphanDataScanResultDTO }>('/intelligence/orphan-data/scan'),

  listOrphanData: (tableName: string, page = 1, pageSize = 20) =>
    api.get<{ code: number; data: import('./intelligenceTypes').OrphanDataItemDTO[] }>('/intelligence/orphan-data/list', {
      params: { tableName, page, pageSize },
    }),

  deleteOrphanData: (tableName: string, ids: string[]) =>
    api.post<{ code: number; data: number }>('/intelligence/orphan-data/delete', { tableName, ids }),
};

