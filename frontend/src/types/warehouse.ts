import type { ApiResponse, PaginatedData, PageParams } from './api';

export interface MaterialStockRecord {
  id: string;
  materialCode: string;
  materialName: string;
  materialImage?: string;
  materialType: string;
  specifications?: string;
  specification?: string;
  color?: string;
  size?: string;
  supplierName?: string;
  quantity: number;
  lockedQuantity?: number;
  safetyStock?: number;
  unit?: string;
  conversionRate?: number;
  unitPrice: number;
  totalValue?: number;
  location?: string;
  warehouseLocation?: string;
  lastInboundDate?: string;
  lastOutboundDate?: string;
  lastInboundBy?: string;
  lastOutboundBy?: string;
  remark?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  fabricComposition?: string;
  updateTime?: string;
}

export interface MaterialStockListParams extends PageParams {
  materialCode?: string;
  materialType?: string;
  startDate?: string;
  endDate?: string;
}

export interface MaterialStockListResponse {
  records: MaterialStockRecord[];
  total: number;
  todayInCount?: number;
  todayOutCount?: number;
}

export interface MaterialTransaction {
  type: string;
  typeLabel: string;
  operationTime: string | null;
  quantity: number;
  operatorName: string;
  warehouseLocation: string;
  remark: string;
}

export interface MaterialStockAlert {
  materialCode: string;
  materialName: string;
  color?: string;
  size?: string;
  currentQty: number;
  safetyStock: number;
  supplierName?: string;
  [key: string]: unknown;
}

export interface MaterialBatchDetail {
  batchNo: string;
  warehouseLocation: string;
  color?: string;
  availableQty: number;
  lockedQty: number;
  inboundDate: string;
  expiryDate?: string;
  outboundQty?: number;
}

export interface MaterialBatchDetailRaw {
  batchNo?: string;
  warehouseLocation?: string;
  color?: string;
  availableQty?: number;
  lockedQty?: number;
  inboundDate?: string;
  expiryDate?: string;
}

export interface ManualOutboundRequest {
  stockId: string;
  quantity: number;
  reason?: string;
  orderNo?: string;
  styleNo?: string;
  factoryId?: string;
  factoryName?: string;
  factoryType?: string;
  receiverId?: string;
  receiverName?: string;
  pickupType?: string;
  usageType?: string;
}

export interface ManualOutboundResponse {
  outboundNo: string;
}

export interface ManualInboundRequest {
  materialCode: string;
  materialName?: string;
  materialType?: string;
  color?: string;
  size?: string;
  quantity: number;
  warehouseLocation?: string;
  supplierName?: string;
  supplierId?: string;
  supplierContactPerson?: string;
  supplierContactPhone?: string;
  operatorId?: string;
  operatorName?: string;
  remark?: string;
}

export interface ManualInboundResponse {
  inboundNo: string;
  inboundId: string;
}

export interface RollGenerateRequest {
  inboundId?: string;
  rollCount: number;
  quantityPerRoll: number;
  unit?: string;
}

export interface RollItem {
  rollCode: string;
  materialName: string;
  quantity: number;
  unit: string;
  warehouseLocation: string;
}

export interface PendingPicking {
  id: string;
  pickingNo: string;
  orderNo: string;
  styleNo: string;
  factoryId?: string;
  factoryName?: string;
  factoryType?: string;
  pickerName: string;
  pickupType?: string;
  usageType?: string;
  createTime: string;
  status: string;
  auditStatus?: string;
  auditorName?: string;
  auditTime?: string;
  auditRemark?: string;
  financeStatus?: string;
  financeRemark?: string;
  remark?: string;
  items?: PendingPickingItem[];
}

export interface PendingPickingItem {
  id: string;
  materialCode: string;
  materialName: string;
  color?: string;
  size?: string;
  quantity: number;
  unit?: string;
  specification?: string;
  unitPrice?: number;
  supplierName?: string;
  warehouseLocation?: string;
  materialType?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  fabricComposition?: string;
}

export interface SafetyStockUpdateRequest {
  stockId: string;
  safetyStock: number;
}

export type MaterialStockListApiResponse = ApiResponse<MaterialStockListResponse>;
export type MaterialTransactionListApiResponse = ApiResponse<MaterialTransaction[]>;
export type MaterialStockAlertListApiResponse = ApiResponse<MaterialStockAlert[]>;
export type MaterialBatchListApiResponse = ApiResponse<MaterialBatchDetailRaw[]>;
export type PendingPickingListApiResponse = ApiResponse<PaginatedData<PendingPicking>>;
export type PendingPickingItemsApiResponse = ApiResponse<PendingPickingItem[]>;
