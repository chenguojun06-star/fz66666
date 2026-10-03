import api from '@/utils/api';

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
  list: (customerId: string) =>
    api.get<{ code: number; data: CustomerUserItem[] }>(`/customer-user/list`, { params: { customerId } }),

  listAll: (params: { keyword?: string; status?: string; customerId?: string; page?: number; pageSize?: number }) =>
    api.get<{ code: number; data: { list: CustomerUserItem[]; total: number } }>(`/customer-user/all-list`, { params }),

  create: (data: {
    customerId: string;
    username: string;
    password: string;
    contactPerson?: string;
    contactPhone?: string;
    contactEmail?: string;
  }) => api.post<{ code: number; data: CustomerUserItem }>(`/customer-user/create`, data),

  resetPassword: (userId: string, newPassword: string) =>
    api.post<{ code: number; data: { id: string; username: string; newPassword: string } }>(
      `/customer-user/reset-password`,
      { userId, newPassword },
    ),

  toggleStatus: (userId: string) =>
    api.post<{ code: number }>(`/customer-user/toggle-status`, { userId }),

  delete: (userId: string) =>
    api.delete<{ code: number }>(`/customer-user/${userId}`),
};

export default customerUserApi;
