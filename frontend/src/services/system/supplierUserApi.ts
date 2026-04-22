import api from '@/utils/api';

export interface SupplierUserItem {
  id: string;
  supplierId: string;
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
  list: (supplierId: string) =>
    api.get<{ code: number; data: SupplierUserItem[] }>(`/supplier-user/list`, { params: { supplierId } }),

  create: (data: { supplierId: string; username: string; password: string; contactPerson?: string; contactPhone?: string; contactEmail?: string }) =>
    api.post<{ code: number; data: SupplierUserItem }>(`/supplier-user/create`, data),

  resetPassword: (userId: string, newPassword: string) =>
    api.post<{ code: number; data: { id: string; username: string; newPassword: string } }>(`/supplier-user/reset-password`, { userId, newPassword }),

  toggleStatus: (userId: string) =>
    api.post<{ code: number }>(`/supplier-user/toggle-status`, { userId }),

  delete: (userId: string) =>
    api.delete<{ code: number }>(`/supplier-user/${userId}`),
};

export default supplierUserApi;
