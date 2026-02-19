import { UploadFile } from 'antd/es/upload/interface';

/**
 * Extended warehousing record with all fields that may appear in
 * API responses and merged detail records. The base ProductWarehousing
 * type has strict required fields and narrow union types, but API
 * responses and merged detail records are more flexible.
 */
export interface WarehousingDetailRecord {
  id?: string;
  warehousingNo?: string;
  orderId?: string;
  orderNo?: string;
  styleId?: string;
  styleNo?: string;
  styleName?: string;
  warehousingQuantity?: number;
  qualifiedQuantity?: number;
  unqualifiedQuantity?: number;
  warehousingType?: string;
  warehouse?: string;
  qualityStatus?: string;
  cuttingBundleId?: string;
  cuttingBundleNo?: number;
  cuttingBundleQrCode?: string;
  unqualifiedImageUrls?: string;
  defectCategory?: string;
  defectRemark?: string;
  repairRemark?: string;
  createTime?: string;
  updateTime?: string;
  deleteFlag?: number;
  warehousingOperatorName?: string;
  warehousingStartTime?: string;
  warehousingEndTime?: string;
  // Extra fields from merged order/style data or extended API responses
  styleCover?: string;
  color?: string;
  colour?: string;
  size?: string;
  qrCode?: string;
}

/** Row type for the order line warehousing summary table */
export interface OrderLineWarehousingRow {
  key: string;
  orderNo: string;
  styleNo: string;
  color: string;
  size: string;
  quantity: number;
  warehousedQuantity: number;
  unqualifiedQuantity?: number; // 不合格数量（次品、返修等）
  unwarehousedQuantity: number;
}

export type CuttingBundleRow = {
  id?: string;
  productionOrderId?: string;
  productionOrderNo?: string;
  styleId?: string;
  styleNo?: string;
  color?: string;
  size?: string;
  quantity?: number;
  bundleNo?: number;
  qrCode?: string;
  status?: string;
};

export type BatchSelectBundleRow = {
  key: string;
  qr: string;
  bundleNo?: number;
  color?: string;
  size?: string;
  quantity?: number;
  availableQty?: number;
  statusText: string;
  disabled?: boolean;
  rawStatus?: string;
};

export type BundleRepairStats = {
  repairPool: number;
  repairedOut: number;
  remaining: number;
};

export type OrderLine = {
  color: string;
  size: string;
  quantity: number;
};
