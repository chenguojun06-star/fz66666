import api, { unwrapApiData } from '@/utils/api';

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
  extJson?: string | Record<string, unknown> | null;
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

/** 分页结果（裸数据 —— 不是信封，records/total 直接可读） */
export interface PageResult<T> {
  records: T[];
  total: number;
  current: number;
  size: number;
}

/**
 * 后端信封类型（仅 service 内部解包用）。
 * service 对外一律返回裸数据 —— 调用方拿到的就是业务对象，
 * 不需要再猜 `res?.data ?? res`（这个猜测写法已随信封一起删除）。
 */
interface ApiEnvelope<T> { code: number; data: T; message?: string; }

export const customerApi = {
  /** 客户列表（分页）——返回 PageResult，含 records/total */
  list: async (params: CustomerListParams = {}): Promise<PageResult<Customer>> =>
    unwrapApiData<PageResult<Customer>>(
      await api.post<ApiEnvelope<PageResult<Customer>>>('/crm/customers/list', params),
      '加载客户列表失败',
    ),

  /** 获取单个客户详情 */
  getById: async (id: string): Promise<Customer> =>
    unwrapApiData<Customer>(await api.get<ApiEnvelope<Customer>>(`/crm/customers/${id}`), '客户详情加载失败'),

  /** 新建客户 */
  create: async (data: Customer): Promise<Customer> =>
    unwrapApiData<Customer>(await api.post<ApiEnvelope<Customer>>('/crm/customers', data), '新建客户失败'),

  /** 更新客户 */
  update: async (id: string, data: Partial<Customer>): Promise<void> => {
    await unwrapApiData<void>(await api.put<ApiEnvelope<void>>(`/crm/customers/${id}`, data), '更新客户失败');
  },

  /** 删除客户 */
  delete: async (id: string): Promise<void> => {
    await unwrapApiData<void>(await api.delete<ApiEnvelope<void>>(`/crm/customers/${id}`), '删除客户失败');
  },

  /** 获取客户关联的历史生产订单 */
  getOrders: async (customerId: string): Promise<unknown[]> =>
    unwrapApiData<unknown[]>(await api.get<ApiEnvelope<unknown[]>>(`/crm/customers/${customerId}/orders`), '历史订单加载失败'),

  /** 获取统计数据 */
  getStats: async (): Promise<CustomerStats> =>
    unwrapApiData<CustomerStats>(await api.get<ApiEnvelope<CustomerStats>>('/crm/stats'), '统计数据加载失败'),
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
  list: async (params: {
    page?: number;
    pageSize?: number;
    customerId?: string;
    status?: string;
    keyword?: string;
    sourceBizType?: string;
    sourceBizNo?: string;
  }): Promise<PageResult<Receivable>> =>
    unwrapApiData<PageResult<Receivable>>(
      await api.post<ApiEnvelope<PageResult<Receivable>>>('/crm/receivables/list', params),
      '加载应收列表失败',
    ),

  stats: async (): Promise<ReceivableStats> =>
    unwrapApiData<ReceivableStats>(await api.get<ApiEnvelope<ReceivableStats>>('/crm/receivables/stats'), '应收统计加载失败'),

  create: async (data: Receivable): Promise<Receivable> =>
    unwrapApiData<Receivable>(await api.post<ApiEnvelope<Receivable>>('/crm/receivables', data), '新建应收失败'),

  detail: async (id: string): Promise<{ receivable: Receivable; receiptLogs: ReceivableReceiptLog[] }> =>
    unwrapApiData<{ receivable: Receivable; receiptLogs: ReceivableReceiptLog[] }>(
      await api.get<ApiEnvelope<{ receivable: Receivable; receiptLogs: ReceivableReceiptLog[] }>>(`/crm/receivables/${id}`),
      '应收详情加载失败',
    ),

  markReceived: async (id: string, amount: number, remark?: string): Promise<void> => {
    await unwrapApiData<void>(
      await api.post<ApiEnvelope<void>>(`/crm/receivables/${id}/receive`, { amount, remark }),
      '登记收款失败',
    );
  },

  delete: async (id: string): Promise<void> => {
    await unwrapApiData<void>(await api.delete<ApiEnvelope<void>>(`/crm/receivables/${id}`), '删除应收失败');
  },
};
