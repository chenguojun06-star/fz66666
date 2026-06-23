import api from '../../utils/api';
import type { Factory } from '@/types/system';

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

  /**
   * 获取供应商下拉列表
   */
  simpleList: <T = { id: string; factoryName: string }>() =>
    api.get<{ code: number; data: T[] }>('/system/factory/simple-list'),
};

export default factoryApi;
