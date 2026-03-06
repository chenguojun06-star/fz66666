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
  createTime?: string;
  creatorName?: string;
}

export interface ReceivableStats {
  totalPending: number;
  totalOverdue: number;
  overdueCount: number;
  newThisMonth: number;
}

export const receivableApi = {
  list: (params: { page?: number; pageSize?: number; customerId?: string; status?: string }) =>
    api.post<PageResult<Receivable>>('/crm/receivables/list', params),

  stats: () => api.get<ApiResult<ReceivableStats>>('/crm/receivables/stats'),

  create: (data: Receivable) => api.post<ApiResult<Receivable>>('/crm/receivables', data),

  markReceived: (id: string, amount: number) =>
    api.post<ApiResult<void>>(`/crm/receivables/${id}/receive`, { amount }),

  delete: (id: string) => api.delete<ApiResult<void>>(`/crm/receivables/${id}`),
};

// ─── 客户追踪门户（Portal Token）─────────────────────────────────────────────

export interface PortalToken {
  id?: string;
  token: string;
  customerId: string;
  orderId: string;
  orderNo: string;
  expireTime: string;
}

/** 员工登录后，为客户生成追踪链接 */
export const generatePortalLink = (customerId: string, orderId: string) =>
  api.post<ApiResult<PortalToken>>(`/crm/customers/${customerId}/portal-link`, { orderId });

/** 客户无需登录，凭 token 查看订单进度（公开接口） */
export const getOrderStatusByToken = (token: string) =>
  api.get<ApiResult<Record<string, unknown>>>(`/public/portal/order-status?token=${token}`);
