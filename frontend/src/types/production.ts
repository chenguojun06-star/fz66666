// 我的订单模块类型定义

export interface ProductionOrder {
  id?: string;
  orderNo: string;
  styleId: string;
  styleNo: string;
  styleName: string;
  color?: string;
  size?: string;
  factoryId: string;
  factoryName: string;
  orderQuantity: number;
  completedQuantity: number;
  cuttingQuantity?: number;
  cuttingBundleCount?: number;
  currentProcessName?: string;
  warehousingQualifiedQuantity?: number;
  outstockQuantity?: number;
  inStockQuantity?: number;
  materialArrivalRate: number;
  productionProgress: number;
  status: 'pending' | 'production' | 'completed' | 'delayed';
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  createTime?: string;
  updateTime?: string;
  qrCode?: string;
  styleCover?: string;
  orderDetails?: string;

  progressWorkflowJson?: string;
  progressWorkflowLocked?: number;
  progressWorkflowLockedAt?: string;
  progressWorkflowLockedBy?: string;
  progressWorkflowLockedByName?: string;

  orderStartTime?: string;
  orderEndTime?: string;
  orderOperatorName?: string;
  orderCompletionRate?: number;

  procurementStartTime?: string;
  procurementEndTime?: string;
  procurementOperatorName?: string;
  procurementCompletionRate?: number;

  cuttingStartTime?: string;
  cuttingEndTime?: string;
  cuttingOperatorName?: string;
  cuttingCompletionRate?: number;

  sewingStartTime?: string;
  sewingEndTime?: string;
  sewingOperatorName?: string;
  sewingCompletionRate?: number;

  qualityStartTime?: string;
  qualityEndTime?: string;
  qualityOperatorName?: string;
  qualityCompletionRate?: number;

  warehousingStartTime?: string;
  warehousingEndTime?: string;
  warehousingOperatorName?: string;
  warehousingCompletionRate?: number;

  operationRemark?: string;

  factoryUnitPrice?: number;
  quotationUnitPrice?: number;

  // 工序单价和明细
  progressNodeUnitPrices?: any[]; // 工序节点单价数组

  // 采购手动确认相关字段
  procurementManuallyCompleted?: number;
  procurementConfirmedBy?: string;
  procurementConfirmedByName?: string;
  procurementConfirmedAt?: string;
  procurementConfirmRemark?: string;
}

export interface ScanRecord {
  id?: string;
  scanCode?: string;
  requestId?: string;
  orderId: string;
  orderNo: string;
  styleId: string;
  styleNo: string;
  color?: string;
  size?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  processCode?: string;
  progressStage?: string;
  processName?: string;
  operatorId: string;
  operatorName: string;
  scanTime: string;
  scanType: 'material' | 'procurement' | 'production' | 'sewing' | 'ironing' | 'packaging' | 'quality' | 'warehouse' | 'cutting' | 'shipment';
  scanResult: 'success' | 'failure';
  remark?: string;
  settlementStatus?: string;
  scanIp?: string;
  cuttingBundleId?: string;
  cuttingBundleNo?: number;
  cuttingBundleQrCode?: string;
  createTime?: string;
  updateTime?: string;
}

export interface CuttingBundle {
  id?: string;
  productionOrderId: string;
  productionOrderNo: string;
  styleId: string;
  styleNo: string;
  color?: string;
  size?: string;
  bundleNo: number;
  quantity: number;
  qrCode: string;
  status?: string;
  createTime?: string;
  updateTime?: string;
}

export interface CuttingTask {
  id?: string;
  productionOrderId: string;
  productionOrderNo: string;
  orderQrCode?: string;
  qrCode?: string;
  styleId: string;
  styleNo: string;
  styleName?: string;
  color?: string;
  size?: string;
  orderQuantity?: number;
  cuttingQuantity?: number;
  cuttingBundleCount?: number;
  status?: string;
  receiverId?: string;
  receiverName?: string;
  receivedTime?: string;
  bundledTime?: string;
  createTime?: string;
  updateTime?: string;
}

export interface MaterialPurchase extends Record<string, unknown> {
  id?: string;
  purchaseNo: string;
  materialId?: string;
  materialCode: string;
  materialName: string;
  materialType?:
  | 'fabric'
  | 'fabricA'
  | 'fabricB'
  | 'fabricC'
  | 'fabricD'
  | 'fabricE'
  | 'lining'
  | 'liningA'
  | 'liningB'
  | 'liningC'
  | 'liningD'
  | 'liningE'
  | 'accessory'
  | 'accessoryA'
  | 'accessoryB'
  | 'accessoryC'
  | 'accessoryD'
  | 'accessoryE';
  specifications?: string;
  unit?: string;
  purchaseQuantity: number;
  arrivedQuantity: number;
  supplierId: string;
  supplierName: string;
  unitPrice?: number;
  totalAmount?: number;
  receiverId?: string;
  receiverName?: string;
  receivedTime?: string;
  remark?: string;
  orderId?: string;
  orderNo?: string;
  orderQuantity?: number;
  styleId?: string;
  styleNo?: string;
  styleName?: string;
  styleCover?: string;
  returnConfirmed?: number;
  returnQuantity?: number;
  returnConfirmerId?: string;
  returnConfirmerName?: string;
  returnConfirmTime?: string;
  status: 'pending' | 'received' | 'partial' | 'completed' | 'cancelled';
  createTime?: string;
  updateTime?: string;
  // 到货日期字段
  expectedArrivalDate?: string;
  expectedShipDate?: string;
  actualArrivalDate?: string;
  // 采购来源字段
  sourceType?: 'order' | 'sample';  // order=生产订单, sample=样衣开发
  patternProductionId?: string;     // 样衣生产ID
}

export interface ProductWarehousing {
  id?: string;
  warehousingNo: string;
  orderId: string;
  orderNo: string;
  styleId: string;
  styleNo: string;
  styleName: string;
  warehousingQuantity: number;
  qualifiedQuantity: number;
  unqualifiedQuantity: number;
  warehousingType: 'scan' | 'manual';
  warehouse?: string;
  qualityStatus: 'qualified' | 'unqualified';
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
  // 入库人员和时间信息
  warehousingOperatorName?: string;
  warehousingStartTime?: string;
  warehousingEndTime?: string;
}

export interface ProductOutstock {
  id?: string;
  outstockNo: string;
  orderId: string;
  orderNo: string;
  styleId: string;
  styleNo: string;
  styleName: string;
  outstockQuantity: number;
  outstockType: string;
  warehouse?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
  deleteFlag?: number;
}

export interface ProductionQueryParams {
  orderNo?: string;
  styleNo?: string;
  factoryName?: string;
  status?: string;
  page: number;
  pageSize: number;
}

export interface ScanQueryParams {
  orderNo?: string;
  styleNo?: string;
  operatorName?: string;
  scanType?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

export interface MaterialQueryParams {
  purchaseNo?: string;
  materialCode?: string;
  materialName?: string;
  orderNo?: string;
  supplier?: string;
  materialType?: string;
  status?: string;
  sourceType?: 'order' | 'sample' | '';  // 采购来源: order=生产订单, sample=样衣开发
  page: number;
  pageSize: number;
}

export interface WarehousingQueryParams {
  warehousingNo?: string;
  orderNo?: string;
  styleNo?: string;
  warehouse?: string;
  page: number;
  pageSize: number;
}

export interface ScanResult {
  success: boolean;
  message: string;
  data?: {
    orderInfo: ProductionOrder;
    scanRecord: ScanRecord;
    cuttingBundle?: CuttingBundle;
  };
}

// 面辅料数据库类型
export interface MaterialDatabase extends Record<string, unknown> {
  id?: string;
  materialCode: string;
  materialName: string;
  styleNo?: string;
  materialType:
  | 'fabric'
  | 'fabricA'
  | 'fabricB'
  | 'fabricC'
  | 'fabricD'
  | 'fabricE'
  | 'lining'
  | 'liningA'
  | 'liningB'
  | 'liningC'
  | 'liningD'
  | 'liningE'
  | 'accessory'
  | 'accessoryA'
  | 'accessoryB'
  | 'accessoryC'
  | 'accessoryD'
  | 'accessoryE';
  specifications?: string;
  unit?: string;
  supplierName?: string;
  unitPrice?: number;
  description?: string;
  image?: string;
  remark?: string;
  status?: 'pending' | 'completed';
  completedTime?: string;
  createTime?: string;
  updateTime?: string;
}

// 面辅料数据库查询参数
export interface MaterialDatabaseQueryParams {
  materialCode?: string;
  materialName?: string;
  materialType?: string;
  supplierName?: string;
  styleNo?: string;
  page: number;
  pageSize: number;
}

// 样衣开发费用统计
export interface PatternDevelopmentStats {
  rangeType: 'day' | 'week' | 'month';   // 时间范围
  patternCount: number;                   // 样衣数量
  materialCost: number;                   // 面辅料费用
  processCost: number;                    // 工序单价费用
  secondaryProcessCost: number;           // 二次工艺费用
  totalCost: number;                      // 总开发费用
}
