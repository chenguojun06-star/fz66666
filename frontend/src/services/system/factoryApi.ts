import api from '../../utils/api';

export interface Factory extends Record<string, unknown> {
  id: number;
  factoryCode: string;
  factoryName: string;
  contactPerson?: string;
  contactPhone?: string;
  address?: string;
  status: number;
  businessLicense?: string;
  tenantId: number;
  createTime: string;
  updateTime: string;
}

export interface FactoryListParams {
  page?: number;
  pageSize?: number;
  factoryName?: string;
  factoryCode?: string;
  status?: number;
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
  get: (id: number) =>
    api.get<{ code: number; data: Factory }>(`/system/factory/${id}`),

  /**
   * 创建工厂/供应商
   */
  create: (data: Partial<Factory>) =>
    api.post<{ code: number; message: string; data: Factory }>('/system/factory', data),

  /**
   * 更新工厂/供应商
   */
  update: (id: number, data: Partial<Factory>) =>
    api.put<{ code: number; message: string; data: Factory }>(`/system/factory/${id}`, data),

  /**
   * 删除工厂/供应商
   */
  delete: (id: number) =>
    api.delete<{ code: number; message: string }>(`/system/factory/${id}`),
};

export default factoryApi;
