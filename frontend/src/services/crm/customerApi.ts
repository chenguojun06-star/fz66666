import api from '@/utils/api';

export interface Customer {
  id?: string;
  customerNo?: string;
  companyName: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  customerLevel?: 'VIP' | 'NORMAL';
  industry?: string;
  source?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  remark?: string;
  createTime?: string;
  updateTime?: string;
  creatorName?: string;
}

export interface CustomerListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  customerLevel?: string;
}

export interface CustomerStats {
  total: number;
  newThisMonth: number;
  vip: number;
  activeCount: number;
}

interface ApiResult<T> { code: number; data: T; message?: string; }
type PageResult<T> = ApiResult<{ records: T[]; total: number; current: number; size: number }>;

export const customerApi = {
  /** 客户列表（分页） */
  list: (params: CustomerListParams = {}) =>
    api.post<PageResult<Customer>>('/crm/customers/list', params),

  /** 获取单个客户详情 */
  getById: (id: string) => api.get<ApiResult<Customer>>(`/crm/customers/${id}`),

  /** 新建客户 */
  create: (data: Customer) => api.post<ApiResult<Customer>>('/crm/customers', data),

  /** 更新客户 */
  update: (id: string, data: Partial<Customer>) =>
    api.put<ApiResult<void>>(`/crm/customers/${id}`, data),

  /** 删除客户 */
  delete: (id: string) => api.delete<ApiResult<void>>(`/crm/customers/${id}`),

  /** 获取客户关联的历史生产订单 */
  getOrders: (customerId: string) =>
    api.get<ApiResult<unknown[]>>(`/crm/customers/${customerId}/orders`),

  /** 获取统计数据 */
  getStats: () => api.get<ApiResult<CustomerStats>>('/crm/stats'),
};

// ─── 应收账款（AR）───────────────────────────────────────────────────────────

export type ReceivableStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export interface Receivable {
  id?: string;
  receivableNo?: string;
  customerId: string;
  customerName?: string;
  orderId?: string;
  orderNo?: string;
  amount: number;
  receivedAmount?: number;
  dueDate?: string;
  status?: ReceivableStatus;
  description?: string;
  sourceBizType?: string;
  sourceBizId?: string;
  sourceBizNo?: string;
  createTime?: string;
  creatorName?: string;
}

export interface ReceivableReceiptLog {
  id: string;
  receivableId: string;
  receivableNo?: string;
  sourceBizType?: string;
  sourceBizId?: string;
  sourceBizNo?: string;
  receivedAmount: number;
  remark?: string;
  receivedTime?: string;
  operatorName?: string;
}

export interface ReceivableStats {
  totalPending: number;
  totalOverdue: number;
  overdueCount: number;
  newThisMonth: number;
}

export const receivableApi = {
  list: (params: {
    page?: number;
    pageSize?: number;
    customerId?: string;
    status?: string;
    keyword?: string;
    sourceBizType?: string;
    sourceBizNo?: string;
  }) =>
    api.post<PageResult<Receivable>>('/crm/receivables/list', params),

  stats: () => api.get<ApiResult<ReceivableStats>>('/crm/receivables/stats'),

  create: (data: Receivable) => api.post<ApiResult<Receivable>>('/crm/receivables', data),

  detail: (id: string) => api.get<ApiResult<{ receivable: Receivable; receiptLogs: ReceivableReceiptLog[] }>>(`/crm/receivables/${id}`),

  markReceived: (id: string, amount: number, remark?: string) =>
    api.post<ApiResult<void>>(`/crm/receivables/${id}/receive`, { amount, remark }),

  delete: (id: string) => api.delete<ApiResult<void>>(`/crm/receivables/${id}`),
};
