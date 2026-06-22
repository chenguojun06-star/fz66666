import api from '@/utils/api';
import type { ShipmentReconciliation, ShipmentReconQueryParams, DeductionItem } from '@/types/finance';
import type { ApiResponse, PaginatedData } from '@/types/api';

const BASE = '/finance/shipment-reconciliation';

export const shipmentReconciliationApi = {
  /** 分页查询出货对账列表 */
  list: async (params: ShipmentReconQueryParams) => {
    return await api.get<ApiResponse<PaginatedData<ShipmentReconciliation>>>(`${BASE}/list`, { params });
  },

  /** 获取对账详情 */
  getById: async (id: string) => {
    return await api.get<ApiResponse<ShipmentReconciliation>>(`${BASE}/${encodeURIComponent(id)}`);
  },

  /** 新增对账记录 */
  create: async (data: Partial<ShipmentReconciliation>) => {
    return await api.post<ApiResponse<ShipmentReconciliation>>(BASE, data);
  },

  /** 更新对账记录 */
  update: async (data: Partial<ShipmentReconciliation>) => {
    return await api.put<ApiResponse<ShipmentReconciliation>>(BASE, data);
  },

  /** 删除对账记录 */
  deleteById: async (id: string) => {
    return await api.delete<ApiResponse<null>>(`${BASE}/${encodeURIComponent(id)}`);
  },

  /** 更新对账状态（调用统一状态端点） */
  updateStatus: async (id: string, status: string) => {
    return await api.post<ApiResponse<null>>(
      `${BASE}/${encodeURIComponent(id)}/status-action`,
      null,
      { params: { action: 'update', status } },
    );
  },

  /** 退回上一步（调用统一状态端点） */
  returnToPrevious: async (id: string) => {
    return await api.post<ApiResponse<null>>(
      `${BASE}/${encodeURIComponent(id)}/status-action`,
      null,
      { params: { action: 'return' } },
    );
  },

  /** 回填对账数据 */
  backfill: async () => {
    return await api.post<ApiResponse<null>>(`${BASE}/backfill`);
  },

  /** 获取扣款明细 */
  getDeductionItems: async (reconciliationId: string) => {
    return await api.get<ApiResponse<DeductionItem[]>>(
      `${BASE}/deduction-items/${encodeURIComponent(reconciliationId)}`,
    );
  },

  /** 保存扣款明细 */
  saveDeductionItems: async (reconciliationId: string, items: DeductionItem[]) => {
    return await api.post<ApiResponse<null>>(
      `${BASE}/deduction-items/${encodeURIComponent(reconciliationId)}`,
      items,
    );
  },

  /** 更新订单备注 */
  updateRemark: async (orderId: string, remark: string) => {
    return await api.post<ApiResponse<null>>(
      `${BASE}/${encodeURIComponent(orderId)}/remark`,
      { remark },
    );
  },
};

export default shipmentReconciliationApi;
