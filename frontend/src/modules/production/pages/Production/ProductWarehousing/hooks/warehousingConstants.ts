// 质检入库统计数据类型
export interface WarehousingStats {
  totalCount: number;
  totalOrders: number;
  totalQuantity: number;
  todayCount: number;
  todayOrders: number;
  todayQuantity: number;
  pendingQcBundles: number;
  pendingQcQuantity: number;
  pendingPackagingBundles: number;
  pendingPackagingQuantity: number;
  pendingWarehouseBundles: number;
  pendingWarehouseQuantity: number;
  unqualifiedCount: number;
  unqualifiedQuantity: number;
}

export const defaultStats: WarehousingStats = {
  totalCount: 0,
  totalOrders: 0,
  totalQuantity: 0,
  todayCount: 0,
  todayOrders: 0,
  todayQuantity: 0,
  pendingQcBundles: 0,
  pendingQcQuantity: 0,
  pendingPackagingBundles: 0,
  pendingPackagingQuantity: 0,
  pendingWarehouseBundles: 0,
  pendingWarehouseQuantity: 0,
  unqualifiedCount: 0,
  unqualifiedQuantity: 0,
};

// 状态筛选类型
export type StatusFilter = 'all' | 'pendingQc' | 'pendingPackaging' | 'pendingWarehouse' | 'unqualified' | 'completed';

// 待处理菲号行数据
export interface PendingBundleRow {
  bundleId: string;
  bundleNo: number;
  qrCode: string;
  color: string;
  size: string;
  quantity: number;
  orderId: string;
  orderNo: string;
  styleNo: string;
  styleName: string;
  styleCover: string;
  status: string;
}
