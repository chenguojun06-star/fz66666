import api, { unwrapApiData } from '../../utils/api';
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

export interface FactoryTypeSyncResult {
  factoryCount: number;
  updatedOrders: number;
  details: Array<{
    factoryId: string;
    factoryName: string;
    factoryType: string;
    updatedOrders: number;
  }>;
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
  list: async (params?: FactoryListParams) =>
    unwrapApiData<FactoryListResponse>(await api.get('/system/factory/list', { params }), '工厂信息请求失败'),

  /**
   * 获取单个工厂/供应商详情
   */
  get: async (id: string) =>
    unwrapApiData<Factory>(await api.get(`/system/factory/${id}`), '工厂信息请求失败'),

  /**
   * 创建工厂/供应商
   */
  create: async (data: Partial<Factory>) =>
    unwrapApiData<Factory>(await api.post('/system/factory', data), '工厂信息请求失败'),

  /**
   * 更新工厂/供应商
   */
  update: async (id: string, data: Partial<Factory>) =>
    unwrapApiData<Factory>(await api.put('/system/factory', { ...data, id }), '工厂信息请求失败'),

  /**
   * 删除工厂/供应商
   */
  delete: async (id: string, remark?: string) =>
    unwrapApiData<void>(await api.delete(`/system/factory/${id}`, { params: remark ? { remark } : undefined }), '工厂信息请求失败'),

  approveAdmission: async (id: string, action: string, reason?: string) =>
    unwrapApiData<boolean>(await api.put(`/system/factory/${id}/admission`, null, { params: { action, reason } }), '工厂信息请求失败'),

  updateContract: async (id: string, data: Partial<Factory>) =>
    unwrapApiData<boolean>(await api.put(`/system/factory/${id}/contract`, data), '工厂信息请求失败'),

  /**
   * D-243：一键修复 —— 按各供应商当前的内外标签，全量刷新其名下订单的 factory_type 快照。
   * 用于清理「改过内外标签但订单快照没跟着更新」的历史脏数据，幂等可重复执行。
   */
  syncOrderFactoryType: async () =>
    unwrapApiData<FactoryTypeSyncResult>(await api.post('/system/factory/sync-order-factory-type'), '工厂信息请求失败'),

  /**
   * 获取供应商下拉列表
   */
  simpleList: async <T = { id: string; factoryName: string }>() =>
    unwrapApiData<T[]>(await api.get('/system/factory/simple-list'), '工厂信息请求失败'),
};

export default factoryApi;
