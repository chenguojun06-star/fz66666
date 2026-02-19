import api from '../../utils/api';
import { MaterialReconQueryParams } from '../../types/finance';

/**
 * 物料对账相关API服务
 */
export const materialReconciliationApi = {
  /**
   * 获取物料对账列表
   * @param params 查询参数
   * @returns 物料对账列表数据
   */
  getMaterialReconciliationList: async (params: MaterialReconQueryParams) => {
    return await api.get<{ code: number; data: { records: unknown[]; total: number } }>('/finance/material-reconciliation/list', { params });
  },

  /**
   * 创建物料对账
   * @param data 物料对账数据
   * @returns 创建结果
   */
  createMaterialReconciliation: async (data: any) => {
    const response = await api.post('/finance/material-reconciliation', data);
    return response;
  },

  /**
   * 更新物料对账
   * @param data 物料对账数据（包含id）
   * @returns 更新结果
   */
  updateMaterialReconciliation: async (data: any) => {
    const response = await api.put('/finance/material-reconciliation', data);
    return response;
  },

  /**
   * 更新物料对账状态
   * @param id 物料对账ID
   * @param status 目标状态
   * @returns 更新结果
   */
  updateMaterialReconciliationStatus: async (id: string, status: string) => {
    const response = await api.post(`/finance/material-reconciliation/${id}/status-action`, undefined, {
      params: { action: 'update', status }
    });
    return response;
  },

  returnMaterialReconciliation: async (id: string, reason: string) => {
    const response = await api.post(`/finance/material-reconciliation/${id}/status-action`, undefined, {
      params: { action: 'return', reason }
    });
    return response;
  },
};

export default materialReconciliationApi;
