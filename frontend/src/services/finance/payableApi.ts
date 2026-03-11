import api from '@/utils/api';

// ============================================================
// 类型定义
// ============================================================

export type PayableStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'PARTIAL';

export interface Payable {
  id?: string;
  payableNo?: string;
  supplierName: string;
  supplierId?: string;
  amount: number;
  paidAmount?: number;
  dueDate?: string;
  status?: PayableStatus;
  bizType?: string;
  bizId?: string;
  remark?: string;
  createTime?: string;
}

export interface PayableStats {
  pendingAmount: number;
  overdueAmount: number;
  paidAmount: number;
  totalCount: number;
}

export interface PayableListReq {
  page?: number;
  size?: number;
  status?: PayableStatus;
  supplierName?: string;
  startDate?: string;
  endDate?: string;
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

  /** 标记已付款 */
  markPaid: (id: string) =>
    api.post<void>(`/finance/payable/${id}/mark-paid`),
};

export default payableApi;
