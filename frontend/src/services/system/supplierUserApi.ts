import api, { unwrapApiData } from '@/utils/api';

export interface SupplierUserItem {
  id: string;
  supplierId: string;
  supplierName?: string;
  tenantId: number;
  username: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  status: string;
  lastLoginTime?: string;
  createTime?: string;
  initialPassword?: string;
  newPassword?: string;
}

const supplierUserApi = {
  list: async (supplierId: string) =>
    unwrapApiData<SupplierUserItem[]>(await api.get(`/supplier-user/list`, { params: { supplierId } }), '供应商账号请求失败'),

  listAll: async (params: { keyword?: string; status?: string; supplierId?: string; page?: number; pageSize?: number }) =>
    unwrapApiData<{ list: SupplierUserItem[]; total: number }>(await api.get(`/supplier-user/all-list`, { params }), '供应商账号请求失败'),

  create: async (data: { supplierId: string; username: string; password: string; contactPerson?: string; contactPhone?: string; contactEmail?: string }) =>
    unwrapApiData<SupplierUserItem>(await api.post(`/supplier-user/create`, data), '供应商账号请求失败'),

  resetPassword: async (userId: string, newPassword: string) =>
    unwrapApiData<{ id: string; username: string; newPassword: string }>(await api.post(`/supplier-user/reset-password`, { userId, newPassword }), '供应商账号请求失败'),

  toggleStatus: async (userId: string) =>
    unwrapApiData<void>(await api.post(`/supplier-user/toggle-status`, { userId }), '供应商账号请求失败'),

  delete: async (userId: string) =>
    unwrapApiData<void>(await api.delete(`/supplier-user/${userId}`), '供应商账号请求失败'),
};

export default supplierUserApi;
