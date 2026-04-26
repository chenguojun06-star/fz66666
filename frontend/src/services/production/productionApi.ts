import api from '../../utils/api';
import { downloadFile } from '../../utils/fileUrl';
import type { ProductionQueryParams, ProductionOrder } from '../../types/production';
import type { ApiResponse, PaginatedData } from '../../types/api';

export type ProductionOrderListParams = ProductionQueryParams & {
  startDate?: string;
  endDate?: string;
};

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
  list: (params: ProductionOrderListParams) => api.get<ApiResponse<PaginatedData<ProductionOrder>>>('/production/order/list', { params }),
  // detail 已废弃，统一使用 list({ orderNo: 'xxx' }) 查询单个订单
  close: (id: string, sourceModule: string, remark?: string, specialClose?: boolean) => api.post<{ code: number; message: string; data: boolean }>('/production/order/close', { id, sourceModule, remark, specialClose }),
  copy: (id: string) => api.post<{ code: number; message: string; data: unknown }>(`/production/order/copy/${encodeURIComponent(id)}`),
  updateProgress: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/order/update-progress', payload),
  saveProgressWorkflow: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/order/progress-workflow/lock', payload),
  rollbackProgressWorkflow: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: boolean }>('/production/order/progress-workflow/rollback', payload),
  quickEdit: (payload: Partial<ProductionOrder> & { id: string }) => api.put<ApiResponse<ProductionOrder>>('/production/order/quick-edit', payload),
  // 节点操作记录 API
  getNodeOperations: (id: string) => api.get<{ code: number; data: string }>(`/production/order/node-operations/${encodeURIComponent(id)}`),
  saveNodeOperations: (id: string, nodeOperations: string) => api.post<{ code: number; message: string }>('/production/order/node-operations', { id, nodeOperations }),
  stats: (params?: Partial<ProductionOrderListParams>) => api.get<{ code: number; data: ProductionOrderStats }>('/production/order/stats', { params }),
  // 工厂产能雷达
  getFactoryCapacity: () => api.get<{ code: number; data: FactoryCapacityItem[] }>('/production/order/factory-capacity'),
  // 客户分享链接：生成分享令牌（30天有效）
  generateShareToken: (orderId: string) =>
    api.post<{ code: number; data: { token: string; shareUrl: string } }>(
      `/production/orders/${encodeURIComponent(orderId)}/share-token`,
      {}
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
  list: (params: unknown) => api.get<{ code: number; data: { records: unknown[]; total: number } }>('/production/cutting/list', { params }),
  getByCode: (qrCode: string) => api.get<{ code: number; data: unknown }>(`/production/cutting/by-code/${encodeURIComponent(String(qrCode || '').trim())}`),
  listBundles: (orderId: any) => api.get<any>(`/production/cutting/bundles/${encodeURIComponent(String(orderId || '').trim())}`),
};

export const productionScanApi = {
  execute: (payload: Record<string, unknown>) => api.post<{ code: number; message: string; data: unknown }>('/production/scan/execute', payload),
  listByOrderId: (orderId: string, params: Record<string, unknown>) => api.get<{ code: number; data: unknown[] }>(`/production/scan/list`, { params: { orderId: String(orderId || '').trim(), ...params } }),
  create: (payload: any) => api.post<any>('/production/scan/execute', payload),
  rollback: (orderId: any, payload?: any) => api.post<any>('/production/scan/rollback', { orderId, ...(payload || {}) }),
  /** 撤回扫码记录（1小时内、未结算、订单未完成） */
  undo: (payload: { recordId: string }) => api.post<{ code: number; message: string; data: { success: boolean; message: string } }>('/production/scan/undo', payload),
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
  search: (q: string) =>
    api.get<{ code: number; data: GlobalSearchResult }>('/search/global', { params: { q } }),
};

export const materialPurchaseApi = {
  /**
   * 按订单查询采购记录，返回 arrivedQuantity / actualArrivalDate 等字段。
   * 使用 orderNo 精确匹配（后端 sourceType=order + orderNo 过滤），排除样衣独立采购单。
   */
  listByOrderNo: (orderNo: string) =>
    api.get<{ code: number; data: { records: unknown[]; total: number } }>(
      '/production/purchase/list',
      { params: { orderNo: String(orderNo || '').trim(), sourceType: 'order', pageSize: 200, page: 1 } },
    ),
};

/** 工序→父节点动态映射 API（替代硬编码关键词列表） */
export const processParentMappingApi = {
  /** 获取全部映射 { keyword: parentNode } */
  list: () =>
    api.get<{ code: number; data: Record<string, string> }>('/production/process-mapping/list'),
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
  getSuggestion: (orderId: string) =>
    api.get<{ code: number; data: QualityAiSuggestionResult }>('/quality/ai-suggestion', {
      params: { orderId },
    }),
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
  noticeType: 'stagnant' | 'deadline' | 'quality' | 'manual';
  isRead: 0 | 1;
  createdAt: string;
}

export const sysNoticeApi = {
  /** 发送通知给跟单员 */
  send: (orderNo: string, noticeType: string) =>
    api.post('/production/notice/send', { orderNo, noticeType }),
  /** 获取当前用户通知列表 */
  getMyNotices: () =>
    api.get<{ code: number; data: SysNotice[] }>('/production/notice/my'),
  /** 获取未读数 */
  getUnreadCount: () =>
    api.get<{ code: number; data: { count: number } }>('/production/notice/unread-count'),
  /** 标记单条已读 */
  markRead: (id: number) =>
    api.post(`/production/notice/${id}/read`),
};

export default {
  productionOrderApi,
  productionCuttingApi,
  productionScanApi,
  materialPurchaseApi,
  processParentMappingApi,
  qualityAiApi,
  sysNoticeApi,
};

