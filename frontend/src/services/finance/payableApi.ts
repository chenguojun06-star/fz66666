import api, { unwrapApiData } from '@/utils/api';

// ============================================================
// 类型定义（与后端 Payable Entity 对齐）
// ============================================================

export type PayableStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'PARTIAL';

export interface Payable {
  id?: string;
  payableNo?: string;
  supplierName: string;
  supplierId?: string;
  orderId?: string;
  orderNo?: string;
  amount: number;
  paidAmount?: number;
  dueDate?: string;
  status?: PayableStatus;
  description?: string;
  createTime?: string;
  updateTime?: string;
}

/** 与后端 PayableOrchestrator.getStats() 返回字段一致 */
export interface PayableStats {
  pendingAmount: number;
  overdueAmount: number;
  overdueCount: number;
  paidAmount: number;
  newThisMonth: number;
}

export interface PayableListReq {
  page?: number;
  pageSize?: number;
  status?: PayableStatus;
  supplierId?: string;
  keyword?: string;
  /** 起始日期（YYYY-MM-DD），按到期日过滤 */
  startDate?: string;
  /** 结束日期（YYYY-MM-DD），按到期日过滤 */
  endDate?: string;
  /**
   * D-243：是否把「未填写到期日」的应付单一并纳入。
   * 不传时，dueDate 为 NULL 的记录会被日期范围条件直接过滤掉而查不到。
   */
  includeNoDueDate?: boolean;
}

// ============================================================
// API 方法
// ============================================================

const payableApi = {
  /** 分页列表 */
  list: async (params: PayableListReq): Promise<{ records: Payable[]; total: number }> =>
    unwrapApiData<{ records: Payable[]; total: number }>(
      await api.post('/finance/payable/list', params),
      '加载应付账款失败',
    ),

  /** 汇总统计 */
  stats: async (): Promise<PayableStats> =>
    unwrapApiData<PayableStats>(await api.get('/finance/payable/stats'), '加载应付统计失败'),

  /** 新建应付单 */
  create: async (data: Omit<Payable, 'id'>): Promise<Payable> =>
    unwrapApiData<Payable>(await api.post('/finance/payable/create', data), '新建应付单失败'),

  /**
   * 标记付款。amount 为 null 时后端自动结清全部剩余款项。
   */
  markPaid: async (id: string, amount?: number): Promise<void> => {
    const url = amount != null
      ? `/finance/payable/${id}/mark-paid?amount=${amount}`
      : `/finance/payable/${id}/mark-paid`;
    await unwrapApiData<void>(await api.post(url), '标记付款失败');
  },

  /**
   * 补填/修改到期日（D-752）。付款计划页到期日列行内编辑用。
   */
  updateDueDate: async (id: string, dueDate: string): Promise<Payable> =>
    unwrapApiData<Payable>(
      await api.post(`/finance/payable/${id}/due-date?dueDate=${dueDate}`),
      '更新到期日失败',
    ),
};

export default payableApi;
