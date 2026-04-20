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

  returnMaterialReconciliation: async (id: string, reason: string) => {
    return await api.post<ApiResponse<null>>(`/finance/material-reconciliation/${id}/status-action`, undefined, {
      params: { action: 'return', reason }
    });
  },
};

export default materialReconciliationApi;
