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
