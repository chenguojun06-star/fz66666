/**
 * 多端共享类型定义包
 * 用于统一前端、小程序、H5端的类型定义
 * 保证数据一致性
 *
 * 注意：枚举值统一使用小写，与后端和PC端保持一致
 * 最后同步时间：2026-06-04
 */

// ================ 基础类型 ================

export interface BaseEntity {
  id?: string | number;
  createTime?: string;
  updateTime?: string;
  createdBy?: string;
  updatedBy?: string;
  tenantId?: string | number;
}

export interface ApiResult<T = unknown> {
  code: number;
  data: T;
  message?: string;
  requestId?: string;
}

export interface PageResult<T = unknown> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ================ 订单相关类型 ================

export interface ProductionOrder extends BaseEntity {
  orderNo: string;
  /** 款式ID */
  styleId: string;
  /** SKC编码 */
  skc?: string;
  styleNo: string;
  styleName: string;
  /** 关联电商单号 */
  ecOrderNo?: string;
  /** 关联电商平台：TB/JD/PDD/DY/XHS/WC/SFY 等 */
  ecPlatform?: string;
  /** 次品数量汇总 */
  unqualifiedQuantity?: number;
  color?: string;
  size?: string;
  factoryId: string;
  factoryName: string;
  /** 工厂类型：INTERNAL=内部, EXTERNAL=外发 */
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  /** 组织节点ID */
  orgUnitId?: string;
  parentOrgUnitId?: string;
  parentOrgUnitName?: string;
  orgPath?: string;
  factoryContactPerson?: string;
  factoryContactPhone?: string;
  /** 跟单员 */
  merchandiser?: string;
  /** 客户公司名称 */
  company?: string;
  /** CRM客户名称快照 */
  customerName?: string;
  /** 品类 */
  productCategory?: string;
  /** 纸样师 */
  patternMaker?: string;
  /** 订单数量 */
  orderQuantity: number;
  /** 已完成数量 */
  completedQuantity: number;
  cuttingQuantity?: number;
  cuttingBundleCount?: number;
  /** 当前工序名称 */
  currentProcessName?: string;
  warehousingQualifiedQuantity?: number;
  outstockQuantity?: number;
  inStockQuantity?: number;
  /** 物料到达率 */
  materialArrivalRate: number;
  /** 生产进度百分比 */
  productionProgress: number;
  status: 'pending' | 'production' | 'completed' | 'delayed' | 'scrapped' | 'cancelled' | 'closed' | 'archived' | 'paused' | 'returned';
  /** 紧急程度: urgent=急单, normal=普通 */
  urgencyLevel?: 'urgent' | 'normal';
  /** 首单/翻单 */
  plateType?: 'FIRST' | 'REORDER';
  isQuickResponse?: boolean;
  standardDeliveryDays?: number;
  actualDeliveryDays?: number;
  /** 交付SLA状态 */
  deliverySlaStatus?: 'on_track' | 'at_risk' | 'breached' | 'completed';
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  qrCode?: string;
  /** 款式封面图 */
  styleCover?: string;
  orderDetails?: string;
  /** 计价模式 */
  pricingMode?: 'PROCESS' | 'SIZE' | 'QUOTE' | 'MANUAL';
  /** 下单业务类型：FOB=离岸价交货, ODM=原创设计制造, OEM=代工贴牌, CMT=纯加工 */
  orderBizType?: 'FOB' | 'ODM' | 'OEM' | 'CMT';
  /** 订单来源类型：BULK=大货, SAMPLE=样衣 */
  sourceBizType?: 'BULK' | 'SAMPLE';
  /** 生产备注 */
  operationRemark?: string;
  factoryUnitPrice?: number;
  quotationUnitPrice?: number;
  scatterPricingMode?: 'FOLLOW_ORDER' | 'MANUAL';
  scatterCuttingUnitPrice?: number;
  progressNodeUnitPrices?: unknown[];
  /** 进度工作流JSON */
  progressWorkflowJson?: string;
  progressWorkflowLocked?: boolean;
  progressWorkflowLockedAt?: string;
  progressWorkflowLockedBy?: string;
  progressWorkflowLockedByName?: string;
  // 各工序时间/操作员/完成率
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
  carSewingStartTime?: string;
  carSewingEndTime?: string;
  carSewingOperatorName?: string;
  carSewingCompletionRate?: number;
  ironingStartTime?: string;
  ironingEndTime?: string;
  ironingOperatorName?: string;
  ironingCompletionRate?: number;
  packagingStartTime?: string;
  packagingEndTime?: string;
  packagingOperatorName?: string;
  packagingCompletionRate?: number;
  secondaryProcessStartTime?: string;
  secondaryProcessEndTime?: string;
  secondaryProcessOperatorName?: string;
  secondaryProcessCompletionRate?: number;
  secondaryProcessRate?: number;
  tailProcessRate?: number;
  hasSecondaryProcess?: boolean;
  qualityStartTime?: string;
  qualityEndTime?: string;
  qualityOperatorName?: string;
  qualityCompletionRate?: number;
  warehousingStartTime?: string;
  warehousingEndTime?: string;
  warehousingOperatorName?: string;
  warehousingCompletionRate?: number;
  // 采购手动确认
  procurementManuallyCompleted?: boolean;
  procurementConfirmedBy?: string;
  procurementConfirmedByName?: string;
  procurementConfirmedAt?: string;
  procurementConfirmRemark?: string;
}

export interface OrderProgressNode {
  id: string | number;
  orderId: string | number;
  processName: string;
  processCode: string;
  progress: number;
  quantity: number;
  completedQuantity: number;
  startedAt?: string;
  completedAt?: string;
  status: 'pending' | 'in_progress' | 'completed';
}

// ================ 款式相关类型 ================

export interface StyleInfo extends BaseEntity {
  styleNo: string;
  skc?: string;
  skuMode?: 'AUTO' | 'MANUAL';
  styleName: string;
  category: string;
  price: number;
  cycle: number;
  description?: string;
  year?: number;
  month?: number;
  season?: string;
  color?: string;
  size?: string;
  sampleQuantity?: number;
  deliveryDate?: string;
  cover?: string;
  status?: 'ENABLED' | 'DISABLED' | 'SCRAPPED' | string;
  deleteFlag?: number;
  progressNode?: string;
  completedTime?: string;
  latestOrderNo?: string;
  latestOrderStatus?: string;
  latestProductionProgress?: number;
  latestPatternStatus?: string;
  patternStatus?: string;
  patternStartTime?: string;
  patternCompletedTime?: string;
  sampleStatus?: string;
  sampleProgress?: number;
  sampleStartTime?: string;
  sampleCompletedTime?: string;
  developmentSourceType?: 'SELF_DEVELOPED' | 'SELECTION_CENTER' | string;
  developmentSourceDetail?: string;
  maintenanceTime?: string;
  maintenanceMan?: string;
  maintenanceRemark?: string;
  orderCount?: number;
  totalOrderQuantity?: number;
  latestOrderTime?: string;
  latestOrderCreator?: string;
  firstOrderTime?: string;
  scrapQuantity?: number;
  totalWarehousedQuantity?: number;
  stockQuantity?: number;
  pushedToOrder?: number | boolean;
  pushedToOrderTime?: string;
  sizeColorConfig?: string;
  fabricComposition?: string;
  fabricCompositionParts?: string;
  washInstructions?: string;
  uCode?: string;
  washTempCode?: string;
  bleachCode?: string;
  tumbleDryCode?: string;
  ironCode?: string;
  dryCleanCode?: string;
  careIconCodes?: string;
  descriptionLocked?: number;
  descriptionReturnComment?: string;
  descriptionReturnBy?: string;
  descriptionReturnTime?: string;
  patternRevLocked?: number;
  patternRevReturnComment?: string;
  patternRevReturnBy?: string;
  patternRevReturnTime?: string;
}

export interface StyleSize extends BaseEntity {
  styleId: string | number;
  sizeName: string;
  partName: string;
  groupName?: string;
  measureMethod?: string;
  baseSize?: string;
  standardValue: number;
  tolerance: string | number;
  sort: number;
  imageUrls?: string;
  gradingRule?: string;
}

export interface StyleBom extends BaseEntity {
  styleId: string | number;
  materialType?:
    | 'fabric' | 'fabricA' | 'fabricB' | 'fabricC' | 'fabricD' | 'fabricE'
    | 'lining' | 'liningA' | 'liningB' | 'liningC' | 'liningD' | 'liningE'
    | 'accessory' | 'accessoryA' | 'accessoryB' | 'accessoryC' | 'accessoryD' | 'accessoryE';
  materialCode: string;
  materialName: string;
  groupName?: string;
  fabricComposition?: string;
  color: string;
  specification?: string;
  size: string;
  unit: string;
  devUsageAmount?: number;
  usageAmount: number;
  sizeUsageMap?: string;
  patternSizeUsageMap?: string;
  sizeSpecMap?: string;
  patternUnit?: string;
  conversionRate?: number;
  lossRate: number;
  unitPrice?: number;
  totalPrice?: number;
  supplier: string;
  supplierId?: string;
  supplierContactPerson?: string;
  supplierContactPhone?: string;
  remark?: string;
  materialId?: string;
  fabricWidth?: string;
  fabricWeight?: string;
  stockStatus?: 'sufficient' | 'insufficient' | 'none' | 'unchecked';
  availableStock?: number;
  requiredPurchase?: number;
  imageUrls?: string;
}

// ================ 生产相关类型 ================

export interface CuttingBundle extends BaseEntity {
  /** 生产订单ID */
  productionOrderId: string;
  /** 生产订单号 */
  productionOrderNo: string;
  /** 款式ID */
  styleId: string;
  /** 款式号 */
  styleNo: string;
  color?: string;
  size?: string;
  /** 扎号（数字类型） */
  bundleNo: number;
  quantity: number;
  /** 二维码 */
  qrCode: string;
  status?: string;
}

export interface CuttingTask extends BaseEntity {
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
  orderCreatorName?: string;
  orderTime?: string;
  remarks?: string;
  expectedShipDate?: string;
  factoryName?: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  styleCover?: string;
  hasScanRecords?: boolean;
}

export interface ScanRecord extends BaseEntity {
  /** 扫码编码 */
  scanCode?: string;
  /** 请求ID */
  requestId?: string;
  orderId: string;
  orderNo: string;
  /** 款式ID */
  styleId: string;
  styleNo: string;
  color?: string;
  size?: string;
  quantity?: number;
  /** 工序单价 */
  unitPrice?: number;
  /** 总金额 */
  totalAmount?: number;
  /** 工序编码 */
  processCode?: string;
  progressStage?: string;
  processName?: string;
  /** 操作员ID */
  operatorId: string;
  /** 操作员姓名 */
  operatorName: string;
  /** 扫码时间 */
  scanTime: string;
  scanType: 'cutting' | 'production' | 'quality' | 'warehouse' | 'pattern' | 'orchestration';
  /** 扫码结果 */
  scanResult: 'success' | 'failure';
  remark?: string;
  /** 结算状态 */
  settlementStatus?: string;
  scanIp?: string;
  /** 裁剪扎ID */
  cuttingBundleId?: string;
  /** 裁剪扎号 */
  cuttingBundleNo?: number;
  /** 裁剪扎二维码 */
  cuttingBundleQrCode?: string;
  // Phase 3-6 新增字段
  currentProgressStage?: string;
  progressNodeUnitPrices?: string;
  cumulativeScanCount?: number;
  totalScanCount?: number;
  progressPercentage?: number;
  totalPieceCost?: number;
  averagePieceCost?: number;
  assignmentId?: number;
  assignedOperatorName?: string;
  /** 工资结算ID（非空表示已结算，不可撤回） */
  payrollSettlementId?: string;
  receiveTime?: string;
  confirmTime?: string;
  /** 扫码模式 */
  scanMode?: string;
  skuCompletedCount?: number;
  skuTotalCount?: number;
  processUnitPrice?: number;
  scanCost?: number;
  /** 指派目标类型 */
  delegateTargetType?: string;
  delegateTargetId?: string;
  delegateTargetName?: string;
  /** 实际操作员ID */
  actualOperatorId?: string;
  actualOperatorName?: string;
  /** 扫码时归属外发工厂ID */
  factoryId?: string;
}

// ================ 仓库相关类型 ================

export interface MaterialStock extends BaseEntity {
  materialCode: string;
  materialName: string;
  materialImage?: string;
  materialType?: string;
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
  unitPrice?: number;
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
}

export interface ProductWarehousing extends BaseEntity {
  warehousingNo: string;
  orderId: string;
  orderNo: string;
  factoryName?: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  orgUnitId?: string;
  parentOrgUnitId?: string;
  parentOrgUnitName?: string;
  orgPath?: string;
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
  deleteFlag?: number;
  warehousingOperatorName?: string;
  warehousingStartTime?: string;
  warehousingEndTime?: string;
  color?: string;
  size?: string;
  cuttingQuantity?: number;
  qualityOperatorName?: string;
  receiverName?: string;
  receiverId?: string;
  scanMode?: string;
  inspectionType?: 'IQC' | 'IPQC' | 'FQC' | 'OQC';
  aqlLevel?: string;
  sampleSize?: number;
  acceptNumber?: number;
  rejectNumber?: number;
  cpk?: number;
  ppk?: number;
  controlChartType?: string;
  defectCode?: string;
  defectSeverity?: 'critical' | 'major' | 'minor';
  inspectorCertNo?: string;
}

export interface ProductOutstock extends BaseEntity {
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
  deleteFlag?: number;
  receiveStatus?: string;
  receiveTime?: string;
  receivedBy?: string;
  receivedByName?: string;
}

export interface FactoryShipment extends BaseEntity {
  shipmentNo: string;
  orderId: string;
  orderNo: string;
  styleNo: string;
  styleName?: string;
  factoryId?: string;
  factoryName?: string;
  shipQuantity: number;
  shipTime?: string;
  shippedBy?: string;
  shippedByName?: string;
  trackingNo?: string;
  expressCompany?: string;
  shipMethod?: string;
  receiveStatus: string;
  receivedQuantity?: number;
  receiveTime?: string;
  receivedBy?: string;
  receivedByName?: string;
  remark?: string;
  creatorId?: string;
  creatorName?: string;
  deleteFlag?: number;
}

// ================ 财务相关类型 ================

export interface WagePayment extends BaseEntity {
  orderId?: string | number;
  orderNo?: string;
  /** 操作员ID */
  operatorId?: string | number;
  /** 操作员姓名 */
  operatorName?: string;
  factoryId?: string | number;
  factoryName?: string;
  processName?: string;
  quantity: number;
  unitPrice?: number;
  totalAmount?: number;
  /** 已付金额 */
  paidAmount?: number;
  /** 剩余金额 */
  remainingAmount?: number;
  /** 扣款金额 */
  deductionAmount?: number;
  /** 预支金额 */
  advanceAmount?: number;
  /** 总数量 */
  totalQuantity?: number;
  /** 记录数 */
  recordCount?: number;
  /** 订单数 */
  orderCount?: number;
  paymentStatus: 'unpaid' | 'partially_paid' | 'fully_paid';
  /** 审批时间 */
  approvalTime?: string;
  /** 支付时间 */
  paymentTime?: string;
  remark?: string;
}

export interface MaterialReconciliation extends BaseEntity {
  reconciliationNo: string;
  supplierId: string;
  supplierName: string;
  supplierContactPerson?: string;
  supplierContactPhone?: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  materialImageUrl?: string;
  unit?: string;
  purchaseId: string;
  purchaseNo: string;
  purchaserName?: string;
  sourceType?: 'order' | 'sample';
  orderId?: string;
  orderNo?: string;
  patternProductionId?: string;
  styleId?: string;
  styleNo?: string;
  styleName?: string;
  quantity: number;
  productionCompletedQuantity?: number;
  unitPrice: number;
  totalAmount: number;
  deductionAmount: number;
  finalAmount: number;
  reconciliationDate: string;
  expectedArrivalDate?: string;
  actualArrivalDate?: string;
  inboundDate?: string;
  warehouseLocation?: string;
  status: 'pending' | 'verified' | 'approved' | 'paid' | 'rejected';
  remark?: string;
  verifiedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  reReviewAt?: string;
  reReviewReason?: string;
}

export interface ShipmentReconciliation extends BaseEntity {
  reconciliationNo: string;
  customerId?: string;
  customerName: string;
  styleId?: string;
  styleNo: string;
  styleName?: string;
  orderId?: string;
  orderNo: string;
  quantity: number;
  productionCompletedQuantity?: number;
  unitPrice: number;
  totalAmount: number;
  deductionAmount: number;
  finalAmount: number;
  reconciliationDate: string;
  status: 'pending' | 'verified' | 'approved' | 'paid' | 'rejected';
  remark?: string;
  verifiedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  reReviewAt?: string;
  reReviewReason?: string;
  totalMaterialCost?: number;
  totalProcessCost?: number;
  totalCost?: number;
  profit?: number;
  profitMargin?: number;
  costBreakdown?: string;
}

// ================ CRM相关类型 ================

export interface Customer extends BaseEntity {
  customerName: string;
  customerCode?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  creditLimit?: number;
  creditRating?: string;
  status: 'active' | 'inactive';
  remarks?: string;
}

export interface Receivable extends BaseEntity {
  customerId?: string | number;
  customerName?: string;
  orderId?: string | number;
  orderNo?: string;
  amount: number;
  paidAmount?: number;
  dueDate?: string;
  status: 'unpaid' | 'partial_paid' | 'paid' | 'overdue';
  remarks?: string;
}

// ================ 系统相关类型 ================

export interface UserInfo extends BaseEntity {
  username: string;
  password?: string;
  /** 姓名 */
  name: string;
  /** 角色ID */
  roleId: string;
  /** 角色名称 */
  roleName: string;
  /** 权限范围 */
  permissionRange: string;
  status: 'active' | 'inactive';
  operationRemark?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  lastLoginTime?: string;
  lastLoginIp?: string;
  factoryId?: string;
  /** 是否为外发工厂主账号 */
  isFactoryOwner?: boolean;
  /** 所属组织节点ID */
  orgUnitId?: string;
  orgUnitName?: string;
  gender?: string;
  hireDate?: string;
  /** 在职状态: normal=正式, probation=试用期, temporary=临时工 */
  employmentStatus?: string;
}

export interface DictItem {
  id: string | number;
  dictType: string;
  dictCode: string;
  dictLabel: string;
  sortOrder?: number;
  status: 'enabled' | 'disabled';
  remark?: string;
}

export interface FactoryInfo extends BaseEntity {
  factoryName: string;
  factoryCode?: string;
  address?: string;
  /** 联系人 */
  contactPerson?: string;
  contactPhone?: string;
  /** 日产能 */
  dailyCapacity?: number;
  status: 'active' | 'inactive';
  /** 工厂类型：INTERNAL=内部, EXTERNAL=外发 */
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  /** 供应商类型：MATERIAL=物料, OUTSOURCE=外发 */
  supplierType?: 'MATERIAL' | 'OUTSOURCE';
  /** 组织节点ID */
  orgUnitId?: string;
  parentOrgUnitId?: string;
  parentOrgUnitName?: string;
  managerId?: string;
  orgPath?: string;
  operationRemark?: string;
  supplierCategory?: string;
  supplierRegion?: string;
  /** 供应商等级 */
  supplierTier?: 'S' | 'A' | 'B' | 'C';
  supplierTierUpdatedAt?: string;
  /** 准入状态 */
  admissionStatus?: 'pending' | 'approved' | 'probation' | 'rejected' | 'suspended';
  admissionDate?: string;
  qualificationCert?: string;
  contractNo?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  contractAmount?: number;
  contractTerms?: string;
  bankName?: string;
  bankAccount?: string;
  bankBranch?: string;
  onTimeDeliveryRate?: number;
  qualityScore?: number;
  completionRate?: number;
  overallScore?: number;
  totalOrders?: number;
  completedOrders?: number;
  overdueOrders?: number;
  businessLicense?: string;
  remarks?: string;
}

// ================ AI智能相关类型 ================

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AiScanTip {
  orderId: string | number;
  tipType: 'quality' | 'progress' | 'warning' | 'info';
  message: string;
  severity: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface AiInsight {
  id: string;
  type: 'sales' | 'production' | 'inventory' | 'quality';
  title: string;
  content: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

// ================ 事件总线类型 ================

export interface AppEvent<T = unknown> {
  type: string;
  data?: T;
  timestamp: number;
  source?: 'pc' | 'miniprogram' | 'h5' | 'backend';
}

export interface OrderChangeEvent extends AppEvent<ProductionOrder> {
  type: 'order:change' | 'order:create' | 'order:update' | 'order:delete';
  changeFields?: (keyof ProductionOrder)[];
}

export interface ScanEvent extends AppEvent<ScanRecord> {
  type: 'scan:create' | 'scan:undo';
}

export interface ProgressChangeEvent extends AppEvent<{
  orderId: string | number;
  progress: number;
  stage: string;
}> {
  type: 'progress:change';
}

// ================ 通用工具类型 ================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Record<string, unknown>
    ? DeepPartial<T[P]>
    : T[P];
};

export type SelectOption = {
  value: string | number;
  label: string;
  disabled?: boolean;
  extra?: Record<string, unknown>;
};

export type SortOrder = 'asc' | 'desc';

export type PageQuery = {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: SortOrder;
  keyword?: string;
  filters?: Record<string, unknown>;
};
