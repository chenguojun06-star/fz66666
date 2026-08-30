import api from '@/utils/api';

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
  list: (params: PayableListReq) =>
    api.post<any>('/finance/payable/list', params),

  /** 汇总统计 */
  stats: () =>
    api.get<PayableStats>('/finance/payable/stats'),

  /** 新建应付单 */
  create: (data: Omit<Payable, 'id'>) =>
    api.post<Payable>('/finance/payable/create', data),

  /**
   * 标记付款。amount 为 null 时后端自动结清全部剩余款项。
   */
  markPaid: (id: string, amount?: number) => {
    const url = amount != null
      ? `/finance/payable/${id}/mark-paid?amount=${amount}`
      : `/finance/payable/${id}/mark-paid`;
    return api.post<void>(url);
  },
};

export default payableApi;
