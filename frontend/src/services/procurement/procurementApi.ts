import api from '@/utils/api';
import type { MaterialReconciliation } from '@/types/finance';

export interface Supplier {
  id?: string;
  factoryCode?: string;
  factoryName: string;
  contactPerson?: string;
  contactPhone?: string;
  address?: string;
  status?: string;
  supplierType?: string;
  createTime?: string;
}

export interface PurchaseOrder {
  id?: string;
  purchaseNo?: string;
  supplierId?: string;
  supplierName?: string;
  materialCode?: string;
  materialName?: string;
  materialType?: string;
  materialCategory?: string;
  specifications?: string;
  unit?: string;
  purchaseQuantity?: number;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  status?: string;
  orderDate?: string;
  expectedDate?: string;
  expectedArrivalDate?: string;
  actualArrivalDate?: string;
  arrivedQuantity?: number;
  remark?: string;
  tenantId?: string;
  createTime?: string;
  supplierContactPerson?: string;
  supplierContactPhone?: string;
  receiverName?: string;
  receivedTime?: string;
  creatorName?: string;
  sourceType?: string;
  inboundRecordId?: string;
  orderNo?: string;
  styleNo?: string;
  color?: string;
  size?: string;
  expectedShipDate?: string;
  fabricComposition?: string;
  invoiceUrls?: string;
}

export interface MaterialInboundRecord {
  id?: string;
  inboundNo?: string;
  purchaseId?: string;
  materialCode?: string;
  materialName?: string;
  materialType?: string;
  color?: string;
  size?: string;
  inboundQuantity?: number;
  warehouseLocation?: string;
  supplierName?: string;
  supplierId?: string;
  supplierContactPerson?: string;
  supplierContactPhone?: string;
  operatorId?: string;
  operatorName?: string;
  inboundTime?: string;
  remark?: string;
  createTime?: string;
}

export interface ProcurementStats {
  supplierCount: number;
  totalPurchaseOrders: number | string;
  pendingOrders: number | string;
  purchaseStats?: Record<string, unknown>;
}

export interface SupplierListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface PurchaseOrderListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  supplierId?: string;
  orderNo?: string;
  styleNo?: string;
}

interface ApiResult<T> { code: number; data: T; message?: string; }
type PageResult<T> = ApiResult<{ records: T[]; total: number; current: number; size: number }>;

export const procurementApi = {
  /** 供应商列表 */
  listSuppliers: (params: SupplierListParams = {}) =>
    api.post<PageResult<Supplier>>('/procurement/suppliers/list', params),

  /** 采购单列表 */
  listPurchaseOrders: (params: PurchaseOrderListParams = {}) =>
    api.post<PageResult<PurchaseOrder>>('/procurement/purchase-orders/list', params),

  /** 采购单详情 */
  getPurchaseOrderDetail: (id: string) =>
    api.get<ApiResult<PurchaseOrder>>(`/procurement/purchase-orders/${id}`),

  /** 供应商采购历史 */
  listSupplierPurchaseOrders: (supplierId: string, params: PurchaseOrderListParams = {}) =>
    api.post<PageResult<PurchaseOrder>>(`/procurement/suppliers/${supplierId}/purchase-orders/list`, params),

  /** 到货登记 */
  updateArrivedQuantity: (payload: { id: string; arrivedQuantity: number; remark?: string }) =>
    api.post<ApiResult<boolean>>('/procurement/purchase-orders/update-arrived-quantity', payload),

  /** 到货并入库 */
  confirmArrivalAndInbound: (payload: {
    purchaseId: string;
    arrivedQuantity: number;
    warehouseLocation?: string;
    operatorId?: string;
    operatorName?: string;
    remark?: string;
  }) => api.post<ApiResult<Record<string, unknown>>>('/procurement/purchase-orders/confirm-arrival', payload),

  /** 快速编辑 */
  quickEditPurchaseOrder: (payload: { id: string; remark?: string; expectedShipDate?: string | null }) =>
    api.put<ApiResult<boolean>>('/procurement/purchase-orders/quick-edit', payload),

  /** 撤回领取 */
  cancelReceive: (payload: { purchaseId: string; reason: string }) =>
    api.post<ApiResult<Record<string, unknown>>>('/procurement/purchase-orders/cancel-receive', payload),

  /** 更新发票/单据图片URL列表 */
  updateInvoiceUrls: (payload: { purchaseId: string; invoiceUrls: string }) =>
    api.post<ApiResult<null>>('/procurement/purchase-orders/update-invoice-urls', payload),

  /** 入库记录列表 */
  listMaterialInboundRecords: (params: { pageNum?: number; pageSize?: number; materialCode?: string; purchaseId?: string }) =>
    api.get<ApiResult<{ records: MaterialInboundRecord[]; total: number; current: number; size: number }>>('/production/material/inbound/list', { params }),

  /** 入库记录详情 */
  getMaterialInboundRecordDetail: (id: string) =>
    api.get<ApiResult<MaterialInboundRecord>>(`/production/material/inbound/${id}`),

  /** 采购单关联的物料对账记录 */
  listMaterialReconciliations: (purchaseId: string, params: { page?: number; pageSize?: number; status?: string } = {}) =>
    api.post<ApiResult<{ records: MaterialReconciliation[]; total: number; current: number; size: number }>>(
      `/procurement/purchase-orders/${purchaseId}/material-reconciliations/list`,
      params,
    ),

  /** 物料对账详情 */
  getMaterialReconciliationDetail: (id: string) =>
    api.get<ApiResult<MaterialReconciliation>>(`/procurement/material-reconciliations/${id}`),

  /** 统计数据 */
  getStats: (params: Record<string, unknown> = {}) =>
    api.post<ApiResult<ProcurementStats>>('/procurement/stats', params),

  /** 新建采购单 */
  createPurchaseOrder: (data: PurchaseOrder) =>
    api.post<ApiResult<boolean>>('/procurement/purchase-orders', data),
};
