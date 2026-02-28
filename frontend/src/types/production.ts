// 我的订单模块类型定义

export interface ProductionOrder extends Record<string, unknown> {
  id?: string;
  orderNo: string;
  styleId: string;
  styleNo: string;
  styleName: string;
  color?: string;
  size?: string;
  factoryId: string;
  factoryName: string;
  factoryContactPerson?: string; // 工厂联系人
  factoryContactPhone?: string; // 工厂联系电话
  merchandiser?: string; // 跟单员（选填，可选择系统用户）
  company?: string; // 公司/客户（选填）
  productCategory?: string; // 品类（选填）
  patternMaker?: string; // 纸样师（选填，可选择系统用户）
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
  /** 紧急程度: urgent=急单, normal=普通，默认普通 */
  urgencyLevel?: 'urgent' | 'normal';
  /** 订单类型: FIRST=首单, REORDER=翻单 */
  plateType?: 'FIRST' | 'REORDER';
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
  progressWorkflowLocked?: boolean;
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
  procurementManuallyCompleted?: boolean;
  procurementConfirmedBy?: string;
  procurementConfirmedByName?: string;
  procurementConfirmedAt?: string;
  procurementConfirmRemark?: string;
}

export interface ScanRecord extends Record<string, unknown> {
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

  // Phase 3-6 新增字段（扫码系统增强）
  /** 当前工序阶段 */
  currentProgressStage?: string;
  /** 工序节点单价列表（JSON格式） */
  progressNodeUnitPrices?: string;
  /** 累计扫码次数 */
  cumulativeScanCount?: number;
  /** 总扫码次数 */
  totalScanCount?: number;
  /** 进度百分比 */
  progressPercentage?: number;
  /** 总成本 */
  totalPieceCost?: number;
  /** 平均成本 */
  averagePieceCost?: number;
  /** 工序指派ID */
  assignmentId?: number;
  /** 指派操作员名称 */
  assignedOperatorName?: string;
  /** 工资结算ID（非空表示已结算，不可撤回） */
  payrollSettlementId?: string;
}

export interface CuttingBundle extends Record<string, unknown> {
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
  orderCreatorName?: string;
  orderTime?: string;
  remarks?: string;
  expectedShipDate?: string;
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
  returnConfirmed?: boolean;
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

export interface ProductWarehousing extends Record<string, unknown> {
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
  // 显示字段（后端查询时填充）
  color?: string;
  size?: string;
  cuttingQuantity?: number;
  qualityOperatorName?: string;
  receiverName?: string;
  receiverId?: string;
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
  /** 紧急程度筛选: urgent=急单, normal=普通 */
  urgencyLevel?: string;
  /** 订单类型筛选: FIRST=首单, REORDER=翻单 */
  plateType?: string;
  /** 跟单员筛选（模糊匹配） */
  merchandiser?: string;
  keyword?: string;
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
  sourceType?: 'order' | 'sample' | 'batch' | '';  // 采购来源: order=生产订单, sample=样衣开发, batch=批量采购
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
