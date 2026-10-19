import api, { unwrapApiData } from '@/utils/api';

/**
 * 客户门户账号（D-732）
 *
 * 客户凭账号登录 H5 客户门户（crm-client）查看自己的订单进度 / 发货记录 / 应收账款。
 * 此前该能力完全缺失（表结构完整但无任何开户入口），本文件与后端
 * `CustomerUserController`(/api/customer-user) 一一对应。
 */
export interface CustomerUserItem {
  id: string;
  customerId: string;
  customerName?: string;
  tenantId: number;
  username: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  status: string;
  lastLoginTime?: string;
  createTime?: string;
  /** 仅创建接口返回一次，供管理员复制发给客户 */
  initialPassword?: string;
  /** 仅重置密码接口返回一次 */
  newPassword?: string;
}

const customerUserApi = {
  list: async (customerId: string): Promise<CustomerUserItem[]> =>
    unwrapApiData<CustomerUserItem[]>(
      await api.get(`/customer-user/list`, { params: { customerId } }),
      '客户账号请求失败',
    ),

  listAll: async (params: { keyword?: string; status?: string; customerId?: string; page?: number; pageSize?: number }): Promise<{ list: CustomerUserItem[]; total: number }> =>
    unwrapApiData<{ list: CustomerUserItem[]; total: number }>(
      await api.get(`/customer-user/all-list`, { params }),
      '客户账号请求失败',
    ),

  create: async (data: {
    customerId: string;
    username: string;
    password: string;
    contactPerson?: string;
    contactPhone?: string;
    contactEmail?: string;
  }): Promise<CustomerUserItem> =>
    unwrapApiData<CustomerUserItem>(await api.post(`/customer-user/create`, data), '客户账号请求失败'),

  resetPassword: async (userId: string, newPassword: string): Promise<{ id: string; username: string; newPassword: string }> =>
    unwrapApiData<{ id: string; username: string; newPassword: string }>(
      await api.post(`/customer-user/reset-password`, { userId, newPassword }),
      '客户账号请求失败',
    ),

  toggleStatus: async (userId: string): Promise<void> =>
    unwrapApiData<void>(await api.post(`/customer-user/toggle-status`, { userId }), '客户账号请求失败'),

  delete: async (userId: string): Promise<void> =>
    unwrapApiData<void>(await api.delete(`/customer-user/${userId}`), '客户账号请求失败'),
};

export default customerUserApi;
