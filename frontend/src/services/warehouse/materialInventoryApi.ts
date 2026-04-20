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

  cancelPending: async (pickingId: string): Promise<ApiResponse<null>> => {
    return await api.post(`/production/picking/${pickingId}/cancel-pending`);
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
