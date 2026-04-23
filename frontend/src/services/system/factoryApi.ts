import api from '../../utils/api';

export interface Factory extends Record<string, unknown> {
  id: string;
  factoryCode: string;
  factoryName: string;
  contactPerson?: string;
  contactPhone?: string;
  address?: string;
  status: 'active' | 'inactive';
  businessLicense?: string;
  tenantId: number;
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  supplierType?: 'MATERIAL' | 'OUTSOURCE';
  orgUnitId?: string;
  parentOrgUnitId?: string;
  parentOrgUnitName?: string;
  orgPath?: string;
  dailyCapacity?: number;
  supplierCategory?: string;
  supplierRegion?: string;
  supplierTier?: 'S' | 'A' | 'B' | 'C';
  supplierTierUpdatedAt?: string;
  admissionStatus?: 'pending' | 'approved' | 'probation' | 'rejected' | 'suspended';
  admissionDate?: string;
  qualificationCert?: string;
  contractNo?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  contractAmount?: number;
  contractTerms?: string;
  bankName?: string;
  bankAccount?: string;
  bankBranch?: string;
  onTimeDeliveryRate?: number;
  qualityScore?: number;
  completionRate?: number;
  overallScore?: number;
  totalOrders?: number;
  completedOrders?: number;
  overdueOrders?: number;
  createTime: string;
  updateTime: string;
}

export interface FactoryListParams {
  page?: number;
  pageSize?: number;
  factoryName?: string;
  factoryCode?: string;
  status?: string;
  factoryType?: string;
  supplierType?: string;
  parentOrgUnitId?: string;
}

export interface FactoryListResponse {
  records: Factory[];
  total: number;
  current: number;
  size: number;
}

export const factoryApi = {
  /**
   * 查询工厂/供应商列表
   */
  list: (params?: FactoryListParams) =>
    api.get<{ code: number; data: FactoryListResponse }>('/system/factory/list', { params }),

  /**
   * 获取单个工厂/供应商详情
   */
  get: (id: string) =>
    api.get<{ code: number; data: Factory }>(`/system/factory/${id}`),

  /**
   * 创建工厂/供应商
   */
  create: (data: Partial<Factory>) =>
    api.post<{ code: number; message: string; data: Factory }>('/system/factory', data),

  /**
   * 更新工厂/供应商
   */
  update: (id: string, data: Partial<Factory>) =>
    api.put<{ code: number; message: string; data: Factory }>('/system/factory', { ...data, id }),

  /**
   * 删除工厂/供应商
   */
  delete: (id: string) =>
    api.delete<{ code: number; message: string }>(`/system/factory/${id}`),

  approveAdmission: (id: string, action: string, reason?: string) =>
    api.put<{ code: number; data: boolean }>(`/system/factory/${id}/admission`, null, { params: { action, reason } }),

  updateContract: (id: string, data: Partial<Factory>) =>
    api.put<{ code: number; data: boolean }>(`/system/factory/${id}/contract`, data),
};

export default factoryApi;
