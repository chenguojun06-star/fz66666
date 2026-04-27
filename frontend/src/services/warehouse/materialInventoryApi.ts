import api from '../../utils/api';
import type {
  MaterialStockListParams,
  MaterialStockListApiResponse,
  MaterialTransactionListApiResponse,
  MaterialStockAlertListApiResponse,
  MaterialBatchListApiResponse,
  ManualOutboundRequest,
  ManualOutboundResponse,
  ManualInboundRequest,
  ManualInboundResponse,
  RollGenerateRequest,
  RollItem,
  SafetyStockUpdateRequest,
  PendingPickingListApiResponse,
  PendingPickingItemsApiResponse,
} from '../../types/warehouse';
import type { ApiResponse, PaginatedData } from '../../types/api';

export const materialInventoryApi = {
  list: async (params: MaterialStockListParams): Promise<MaterialStockListApiResponse> => {
    return await api.get('/production/material/stock/list', { params });
  },

  listTransactions: async (materialCode: string): Promise<MaterialTransactionListApiResponse> => {
    return await api.get('/production/material/stock/transactions', { params: { materialCode } });
  },

  listAlerts: async (params?: { days?: number; leadDays?: number; limit?: number; onlyNeed?: boolean }): Promise<MaterialStockAlertListApiResponse> => {
    return await api.get('/production/material/stock/alerts', { params });
  },

  listBatches: async (params: { materialCode: string; color?: string; size?: string }): Promise<MaterialBatchListApiResponse> => {
    return await api.get('/production/material/stock/batches', { params });
  },

  manualOutbound: async (data: ManualOutboundRequest): Promise<ApiResponse<ManualOutboundResponse>> => {
    return await api.post('/production/material/stock/manual-outbound', data);
  },

  updateSafetyStock: async (data: SafetyStockUpdateRequest): Promise<ApiResponse<null>> => {
    return await api.post('/production/material/stock/update-safety-stock', data);
  },

  manualInbound: async (data: ManualInboundRequest): Promise<ApiResponse<ManualInboundResponse>> => {
    return await api.post('/production/material/inbound/manual', data);
  },

  /** 采购到货入库：生成入库记录 + 更新库存 + 同步采购单状态 */
  confirmArrival: async (data: { purchaseId: string; arrivedQuantity: number; warehouseLocation?: string; remark?: string }): Promise<ApiResponse<any>> => {
    return await api.post('/production/material/inbound/confirm-arrival', data);
  },

  generateRolls: async (data: RollGenerateRequest): Promise<ApiResponse<RollItem[]>> => {
    return await api.post('/production/material/roll/generate', data);
  },

  listPendingPickings: async (params?: { status?: string; pageSize?: number }): Promise<PendingPickingListApiResponse> => {
    return await api.get('/production/picking/list', { params });
  },

  getPickingItems: async (pickingId: string): Promise<PendingPickingItemsApiResponse> => {
    return await api.get(`/production/picking/${pickingId}/items`);
  },

  confirmOutbound: async (pickingId: string): Promise<ApiResponse<null>> => {
    return await api.post(`/production/picking/${pickingId}/confirm-outbound`);
  },

  auditPicking: async (pickingId: string, data: { action: string; remark?: string }): Promise<ApiResponse<null>> => {
    return await api.post(`/production/picking/${pickingId}/audit`, data);
  },

  batchAuditPicking: async (data: { ids: string[]; action: string; remark?: string }): Promise<ApiResponse<{ successCount: number; failCount: number }>> => {
    return await api.post('/production/picking/batch-audit', data);
  },

  cancelPending: async (pickingId: string): Promise<ApiResponse<null>> => {
    return await api.post(`/production/picking/${pickingId}/cancel-pending`);
  },

  auditPickupRecord: async (recordId: string, data: { action: string; remark?: string }): Promise<ApiResponse<null>> => {
    return await api.post(`/warehouse/material-pickup/${recordId}/audit`, data);
  },

  financeSettlePickupRecord: async (recordId: string, data: { unitPrice?: number; remark?: string }): Promise<ApiResponse<null>> => {
    return await api.post(`/warehouse/material-pickup/${recordId}/finance-settle`, data);
  },

  listPickupRecordsBySource: async (sourceRecordId: string): Promise<ApiResponse<any[]>> => {
    return await api.post('/warehouse/material-pickup/list', { sourceRecordId, pageSize: 50 });
  },

  searchMaterialList: async (params: {
    page?: number;
    pageSize?: number;
    materialCode?: string;
    receiverId?: string;
    receiverName?: string;
    factoryName?: string;
    factoryType?: string;
  }): Promise<ApiResponse<PaginatedData<any>>> => {
    return await api.get('/production/material/list', { params });
  },
};

export default materialInventoryApi;
