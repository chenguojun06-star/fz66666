import api, { unwrapApiData } from '../../utils/api';
import { downloadFile } from '../../utils/fileUrl';
import type { ProductionQueryParams, ProductionOrder } from '../../types/production';
import type { ApiResponse, PaginatedData } from '../../types/api';

export type ProductionOrderListParams = ProductionQueryParams & {
  startDate?: string;
  endDate?: string;
};

/**
 * 外发工厂产能台账行（D-779）
 *
 * status 语义（区分「不知道」与「很闲」是关键）：
 * - UNCONFIGURED 未配置产能 → loadRate/freeCapacity 为 null，**不可当作有余量**
 * - OVERLOADED 负荷 >100%（正是需要外推的信号）
 * - TIGHT 负荷 80%~100%
 * - AVAILABLE 负荷 <80%，有余量
 * - UNKNOWN 有产能但没有排产数据 → 数值同样为 null
 */
export type CapacityLedgerStatus =
  | 'UNCONFIGURED'
  | 'OVERLOADED'
  | 'TIGHT'
  | 'AVAILABLE'
  | 'UNKNOWN';

export interface CapacityLedgerRow {
  factoryId: string;
  factoryName: string;
  factoryType?: string;
  /** 手工配置日产能（件/天）；null = 未配置 */
  dailyCapacity: number | null;
  /** 实测扫码推算日产能；0 = 无实测 */
  realDailyOutput: number;
  /** 生效日产能 = max(实测, 配置) */
  effectiveDailyCapacity: number;
  capacitySource: 'real' | 'configured' | 'none';
  inProgressQuantity: number;
  inProgressOrders: number;
  /** 近 30 天可接单总量 */
  capacity30d: number;
  /** 负荷率 %，不可知为 null */
  loadRate: number | null;
  /** 近 30 天余量（件），不可知为 null，负数=超载 */
  freeCapacity30d: number | null;
  status: CapacityLedgerStatus;
  qualityScore: number;
  completionRate: number;
  overallScore: number;
  supplierTier?: string;
}

export interface FactoryCapacityItem {
  factoryName: string;
  totalOrders: number;
  totalQuantity: number;
  atRiskCount: number;
  overdueCount: number;
  deliveryOnTimeRate: number;
  activeWorkers: number;
  avgDailyOutput: number;
  estimatedCompletionDays: number;
  matchScore: number;
  capacitySource: 'real' | 'configured' | 'none';
  /** 历史评价：品质分（近一年扫码合格率，-1=无数据） */
  qualityScore: number;
  /** 历史评价：完成率（%），-1=无数据 */
  completionRate: number;
  /** 历史评价：综合评分（-1=无数据） */
  overallScore: number;
  /** 历史评价：评级 S/A/B/C */
  supplierTier?: string;
  /** 历史评价：累计单量（近一年已完成 + 当前在制） */
  historyTotalOrders: number;
  /** 历史评价：已完成单数 */
  historyCompletedOrders: number;
  /** 历史评价：历史逾期单数 */
  historyOverdueOrders: number;
}

export interface ProductionOrderStats {
  activeOrders: number;
  activeQuantity: number;
  completedOrders: number;
  completedQuantity: number;
  scrappedOrders: number;
  scrappedQuantity: number;
  totalOrders: number;
  totalQuantity: number;
  delayedOrders: number;
  delayedQuantity: number;
  todayOrders: number;
  todayQuantity: number;
}

export const productionOrderApi = {
    exportExcel: (params: Record<string, unknown>) => {
    // 将过滤中的数组参数进行逗号拼接
    const query = { ...params };
    if (Array.isArray(query.status)) query.status = query.status.join(',');
    // 构建 query string，使用 downloadFile 附加 JWT token
    const queryString = new URLSearchParams(query as Record<string, string>).toString();
    downloadFile(`/api/production/order/export-excel?${queryString}`);
  },
  list: async (params: ProductionOrderListParams): Promise<PaginatedData<ProductionOrder>> =>
    unwrapApiData<PaginatedData<ProductionOrder>>(
      await api.get('/production/order/list', { params }),
      '生产订单加载失败',
    ),
  // detail 已废弃，统一使用 list({ orderNo: 'xxx' }) 查询单个订单
  close: async (id: string, sourceModule: string, remark?: string, specialClose?: boolean): Promise<boolean> =>
    unwrapApiData<boolean>(await api.post<ApiResponse<boolean>>('/production/order/close', { id, sourceModule, remark, specialClose }), '关单失败'),
  copy: async (id: string): Promise<unknown> =>
    unwrapApiData<unknown>(await api.post<ApiResponse<unknown>>(`/production/order/copy/${encodeURIComponent(id)}`), '复制订单失败'),
  updateProgress: async (payload: Record<string, unknown>): Promise<boolean> =>
    unwrapApiData<boolean>(await api.post<ApiResponse<boolean>>('/production/order/update-progress', payload), '更新进度失败'),
  saveProgressWorkflow: async (payload: Record<string, unknown>): Promise<boolean> =>
    unwrapApiData<boolean>(await api.post<ApiResponse<boolean>>('/production/order/progress-workflow/lock', payload), '锁定工序流程失败'),
  rollbackProgressWorkflow: async (payload: Record<string, unknown>): Promise<boolean> =>
    unwrapApiData<boolean>(await api.post<ApiResponse<boolean>>('/production/order/progress-workflow/rollback', payload), '回滚工序流程失败'),
  quickEdit: async (payload: Partial<ProductionOrder> & { id: string }): Promise<ProductionOrder> =>
    unwrapApiData<ProductionOrder>(
      await api.put('/production/order/quick-edit', payload),
      '保存失败',
    ),
  // 节点操作记录 API
  getNodeOperations: async (id: string): Promise<string> =>
    unwrapApiData<string>(await api.get<ApiResponse<string>>(`/production/order/node-operations/${encodeURIComponent(id)}`), '节点操作记录加载失败'),
  saveNodeOperations: async (id: string, nodeOperations: string): Promise<void> => {
    await unwrapApiData<void>(await api.post<ApiResponse<void>>('/production/order/node-operations', { id, nodeOperations }), '保存节点操作记录失败');
  },
  /** 菲号批量委派（裁剪后节点 → 外发工厂/人员） */
  bundleDelegate: async (payload: Record<string, unknown>): Promise<{ delegatedCount?: number } | undefined> =>
    unwrapApiData<{ delegatedCount?: number } | undefined>(
      await api.post<ApiResponse<{ delegatedCount?: number } | undefined>>('/production/order/bundle-delegate', payload),
      '菲号委派失败',
    ),
  stats: async (params?: Partial<ProductionOrderListParams>): Promise<ProductionOrderStats> =>
    unwrapApiData<ProductionOrderStats>(await api.get<ApiResponse<ProductionOrderStats>>('/production/order/stats', { params }), '生产统计加载失败'),
  // 工厂产能雷达
  getFactoryCapacity: async (): Promise<FactoryCapacityItem[]> =>
    unwrapApiData<FactoryCapacityItem[]>(await api.get<ApiResponse<FactoryCapacityItem[]>>('/production/order/factory-capacity'), '工厂产能加载失败'),
  /** D-779：外发工厂产能台账（判断「订单该外推给谁」） */
  getCapacityLedger: async (): Promise<CapacityLedgerRow[]> =>
    unwrapApiData<CapacityLedgerRow[]>(await api.get<ApiResponse<CapacityLedgerRow[]>>('/production/order/capacity-ledger'), '产能台账加载失败'),
  // 客户分享链接：生成分享令牌（30天有效）
  generateShareToken: async (orderId: string): Promise<{ token: string; shareUrl: string }> =>
    unwrapApiData<{ token: string; shareUrl: string }>(
      await api.post<ApiResponse<{ token: string; shareUrl: string }>>(
        `/production/orders/${encodeURIComponent(orderId)}/share-token`,
        {},
      ),
      '生成分享链接失败',
    ),
};

export const productionCuttingApi = {
    exportExcel: (params: Record<string, unknown>) => {
    // 将过滤中的数组参数进行逗号拼接
    const query = { ...params };
    if (Array.isArray(query.status)) query.status = query.status.join(',');
    // 构建 query string，使用 downloadFile 附加 JWT token
    const queryString = new URLSearchParams(query as Record<string, string>).toString();
    downloadFile(`/api/production/order/export-excel?${queryString}`);
  },
  list: async (params: unknown): Promise<{ records: unknown[]; total: number }> =>
    unwrapApiData<{ records: unknown[]; total: number }>(
      await api.get<ApiResponse<{ records: unknown[]; total: number }>>('/production/cutting/list', { params }),
      '裁剪任务加载失败',
    ),
  getByCode: async (qrCode: string): Promise<unknown> =>
    unwrapApiData<unknown>(await api.post<ApiResponse<unknown>>('/production/cutting/by-code', { qrCode }), '扫码查询失败'),
  listBundles: async (orderId: string): Promise<unknown[]> =>
    unwrapApiData<unknown[]>(
      await api.get(`/production/cutting/bundles/${encodeURIComponent(String(orderId || '').trim())}`),
      '加载裁剪分扎失败',
    ),
};

export const productionScanApi = {
  execute: async (payload: Record<string, unknown>): Promise<unknown> =>
    unwrapApiData<unknown>(await api.post<ApiResponse<unknown>>('/production/scan/execute', payload), '扫码执行失败'),
  listByOrderId: async (orderId: string, params: Record<string, unknown>): Promise<unknown[]> =>
    unwrapApiData<unknown[]>(
      await api.get<ApiResponse<unknown[]>>('/production/scan/list', { params: { orderId: String(orderId || '').trim(), ...params } }),
      '扫码记录加载失败',
    ),
  /** 撤回扫码记录（1小时内、未结算、订单未完成） */
  undo: async (payload: { recordId: string }): Promise<{ success: boolean; message: string }> =>
    unwrapApiData<{ success: boolean; message: string }>(
      await api.post<ApiResponse<{ success: boolean; message: string }>>('/production/scan/undo', payload),
      '撤回扫码失败',
    ),
};

// ─── ⌘K 全局搜索 ─────────────────────────────────────────────

export interface GlobalSearchOrderItem {
  id: number;
  orderNo: string;
  styleName: string;
  styleNo: string;
  factoryName: string;
  status: string;
  statusLabel: string;
  progress: number;
}

export interface GlobalSearchStyleItem {
  id: number;
  styleNo: string;
  styleName: string;
  category: string;
  coverUrl?: string;
}

export interface GlobalSearchWorkerItem {
  id: string;
  name: string;
  phone: string;
  role: string;
  factoryName?: string;
}

export interface GlobalSearchResult {
  query: string;
  orders: GlobalSearchOrderItem[];
  styles: GlobalSearchStyleItem[];
  workers: GlobalSearchWorkerItem[];
}

export const globalSearchApi = {
  search: async (q: string): Promise<GlobalSearchResult> =>
    unwrapApiData<GlobalSearchResult>(await api.get<ApiResponse<GlobalSearchResult>>('/search/global', { params: { q } }), '全局搜索失败'),
};

export const materialPurchaseApi = {
  /**
   * 按订单查询采购记录，返回 arrivedQuantity / actualArrivalDate 等字段。
   * 使用 orderNo 精确匹配（后端 sourceType=order + orderNo 过滤），排除样衣独立采购单。
   */
  listByOrderNo: async (orderNo: string): Promise<{ records: unknown[]; total: number }> =>
    unwrapApiData<{ records: unknown[]; total: number }>(
      await api.get<ApiResponse<{ records: unknown[]; total: number }>>(
        '/production/purchase/list',
        { params: { orderNo: String(orderNo || '').trim(), sourceType: 'order', pageSize: 200, page: 1 } },
      ),
      '采购记录加载失败',
    ),

  /**
   * 按款号/订单号汇总面辅料采购数据（采购量/到货量/使用量/剩余量）
   */
  styleSummary: async (params: { styleId?: string; orderNo?: string }): Promise<unknown[]> =>
    unwrapApiData<unknown[]>(await api.get<ApiResponse<unknown[]>>('/production/purchase/style-summary', { params }), '采购汇总加载失败'),
};

/** 样衣生产详情 API */
export interface PatternProductionDetail {
  id?: string | number;
  styleNo?: string;
  styleName?: string;
  styleId?: string;
  coverImage?: string | null;
  color?: string;
  size?: string;
  quantity?: number;
  sizeColorMatrix?: unknown;
  sizeColorConfig?: unknown;
  [key: string]: unknown;
}

export const productionPatternApi = {
  /**
   * 获取样衣生产详情（enriched 数据）
   * 返回字段含 styleName / coverImage / color / size / quantity / sizeColorMatrix 等，
   * 用于样衣模式下构造订单头信息（PC 端无原生订单，需用样衣详情兜底）。
   */
  getPatternDetail: async (patternId: string): Promise<PatternProductionDetail> =>
    unwrapApiData<PatternProductionDetail>(
      await api.get<ApiResponse<PatternProductionDetail>>(
        `/production/pattern/${encodeURIComponent(String(patternId || '').trim())}`,
      ),
      '样衣详情加载失败',
    ),

  /**
   * 获取样衣链路时间线（创建/领取/制作/审核/入库/出库/归还 + 异常列表）。
   * 后端 PatternProductionOrchestrator.getPatternTimeline 聚合 PatternScanRecord 各节点。
   * 用于"跟随模式"：合并到备注日志时间线展示，避免新建独立页面。
   */
  getTimeline: async (patternId: string): Promise<PatternTimeline> =>
    unwrapApiData<PatternTimeline>(
      await api.get<ApiResponse<PatternTimeline>>(
        `/production/pattern/${encodeURIComponent(String(patternId || '').trim())}/timeline`,
      ),
      '样衣时间线加载失败',
    ),
};

/** 样衣链路时间线（创建/领取/制作/审核/入库/出库/归还 + 异常） */
export interface PatternTimeline {
  patternId: string;
  styleNo?: string;
  status?: string;
  nodes: Array<{
    node: string;
    time: string;
    operator?: string;
    durationHours?: number;
  }>;
  anomalies: string[];
}

/** 工序→父节点动态映射 API（替代硬编码关键词列表） */
export const processParentMappingApi = {
  /** 获取全部映射 { keyword: parentNode } */
  list: async (): Promise<Record<string, string>> =>
    unwrapApiData<Record<string, string>>(await api.get<ApiResponse<Record<string, string>>>('/production/process-mapping/list'), '工序映射加载失败'),
};

// ─── AI质检建议 ─────────────────────────────────────────────
export interface QualityAiSuggestionResult {
  orderNo?: string;
  styleNo?: string;
  styleName?: string;
  productCategory?: string;
  urgent?: boolean;
  historicalDefectRate?: number;
  historicalVerdict?: 'good' | 'warn' | 'critical';
  checkpoints: string[];
  defectSuggestions: Record<string, string>;
  urgentTip?: string;
}

export const qualityAiApi = {
  getSuggestion: async (orderId: string): Promise<QualityAiSuggestionResult> =>
    unwrapApiData<QualityAiSuggestionResult>(
      await api.get<ApiResponse<QualityAiSuggestionResult>>('/quality/ai-suggestion', { params: { orderId } }),
      'AI 质检建议加载失败',
    ),
};

// ── 站内通知（跟单员收件箱）──
export interface SysNotice {
  id: number;
  tenantId: number;
  toName: string;
  fromName: string;
  orderNo: string;
  title: string;
  content: string;
  noticeType: 'stagnant' | 'deadline' | 'quality' | 'manual' | 'urge_order' | 'overdue' | 'task_overdue' | 'task_due_soon';
  isRead: 0 | 1;
  createdAt: string;
  urgeRecordId?: string;
  actionType?: string;
  actionPayload?: string;
  styleImage?: string;
}

export const urgeApi = {
  urge: (orderId: string, remark?: string) =>
    api.post('/production/order/urge', { orderId, remark: remark || '' }),
  reply: (urgeRecordId: string, replyContent: string, expectedShipDate?: string) =>
    api.post('/production/order/urge/reply', { urgeRecordId, replyContent, expectedShipDate }),
  checkUrged: async (orderIds: string[]): Promise<{ urgedOrderIds: string[] }> =>
    unwrapApiData<{ urgedOrderIds: string[] }>(
      await api.post<ApiResponse<{ urgedOrderIds: string[] }>>('/production/order/urge/check-urged', { orderIds }),
      '催单状态查询失败',
    ),
};

export const sysNoticeApi = {
  /** 发送通知给跟单员 */
  send: (orderNo: string, noticeType: string) =>
    api.post('/production/notice/send', { orderNo, noticeType }),
  /**
   * 获取当前用户通知列表（**已解包，返回裸数组**）。
   *
   * <p>retry: 0 —— 通知铃是轮询的，每隔几秒就问一次，
   * 失败还重试会把后端的并发数白白抬上去。
   */
  getMyNotices: async (): Promise<SysNotice[]> =>
    unwrapApiData<SysNotice[]>(
      await api.get('/production/notice/my', { retry: 0 } as any),
      '获取通知列表失败',
    ),
  getUnreadCount: async (): Promise<number> => {
    const r = await unwrapApiData<{ count: number }>(
      await api.get('/production/notice/unread-count', { retry: 0 } as any),
      '获取未读数失败',
    );
    return Number(r?.count ?? 0);
  },
  /** 标记单条已读 */
  markRead: (id: number) =>
    api.post(`/production/notice/${id}/read`),
};

export default {
  productionOrderApi,
  productionCuttingApi,
  productionScanApi,
  materialPurchaseApi,
  productionPatternApi,
  processParentMappingApi,
  qualityAiApi,
  sysNoticeApi,
};

