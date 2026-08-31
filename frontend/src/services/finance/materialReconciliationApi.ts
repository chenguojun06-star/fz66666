import api from '../../utils/api';
import type { MaterialReconciliation, MaterialReconQueryParams } from '../../types/finance';
import type { ApiResponse, PaginatedData } from '../../types/api';

export const materialReconciliationApi = {
  getMaterialReconciliationList: async (params: MaterialReconQueryParams) => {
    return await api.get<ApiResponse<PaginatedData<MaterialReconciliation>>>('/finance/material-reconciliation/list', { params });
  },

  createMaterialReconciliation: async (data: Omit<MaterialReconciliation, 'id' | 'createTime' | 'updateTime'>) => {
    return await api.post<ApiResponse<MaterialReconciliation>>('/finance/material-reconciliation', data);
  },

  updateMaterialReconciliation: async (data: Partial<MaterialReconciliation> & { id: string }) => {
    return await api.put<ApiResponse<MaterialReconciliation>>('/finance/material-reconciliation', data);
  },

  updateMaterialReconciliationStatus: async (id: string, status: string) => {
    return await api.post<ApiResponse<null>>(`/finance/material-reconciliation/${id}/status-action`, undefined, {
      params: { action: 'update', status }
    });
  },

  /**
   * 补生成物料对账：按当前规则重新扫描已到货的采购单，为缺失的对账单补生成。
   * D-252：历史采购单因工厂类型判定口径问题（NULL 被误判外发）导致对账被跳过，
   * 修复口径后需由本接口补回存量数据，否则修复只对新采购生效。
   */
  backfillMaterialReconciliation: async () => {
    return await api.post<ApiResponse<number>>('/finance/material-reconciliation/backfill');
  },

  returnMaterialReconciliation: async (id: string, reason: string) => {
    return await api.post<ApiResponse<null>>(`/finance/material-reconciliation/${id}/status-action`, undefined, {
      params: { action: 'return', reason }
    });
  },
};

export default materialReconciliationApi;
