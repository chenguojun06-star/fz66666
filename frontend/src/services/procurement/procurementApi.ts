import api from '@/utils/api';

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
  supplierName?: string;
  materialName?: string;
  materialCategory?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  status?: string;
  orderDate?: string;
  expectedDate?: string;
  arrivedQuantity?: number;
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

  /** 统计数据 */
  getStats: (params: Record<string, unknown> = {}) =>
    api.post<ApiResult<ProcurementStats>>('/procurement/stats', params),
};
