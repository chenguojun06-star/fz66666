// 财务结算模块类型定义

export interface MaterialReconciliation extends Record<string, unknown> {
  id?: string;
  reconciliationNo: string;
  supplierId: string;
  supplierName: string;
  supplierContactPerson?: string; // 供应商联系人
  supplierContactPhone?: string; // 供应商联系电话
  materialId: string;
  materialCode: string;
  materialName: string;
  materialImageUrl?: string; // 物料图片URL
  unit?: string; // 单位
  purchaseId: string;
  purchaseNo: string;
  purchaserName?: string; // 采购员姓名
  sourceType?: 'order' | 'sample'; // 采购类型: order=批量订单, sample=样衣开发
  orderId?: string;
  orderNo?: string;
  patternProductionId?: string; // 样衣生产ID
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
  expectedArrivalDate?: string; // 预计到货日期
  actualArrivalDate?: string; // 实际到货日期
  inboundDate?: string; // 入库日期
  warehouseLocation?: string; // 仓库库区
  status: 'pending' | 'verified' | 'approved' | 'paid' | 'rejected';
  remark?: string;
  verifiedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  reReviewAt?: string;
  reReviewReason?: string;
  createTime?: string;
  updateTime?: string;
}

export interface ShipmentReconciliation {
  id?: string;
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
  createTime?: string;
  updateTime?: string;
  // Phase 6: 成本利润字段（P0 修复：字段名与后端 ShipmentReconciliation entity 对齐）
  scanCost?: number;              // 工序成本（后端字段名 scanCost）
  materialCost?: number;          // 物料成本（后端字段名 materialCost）
  totalCost?: number;             // 总成本 = scanCost + materialCost
  profitAmount?: number;          // 利润（后端字段名 profitAmount）
  profitMargin?: number;          // 利润率（百分比）
  /** 是否本厂(0:加工厂, 1:本厂) — P1 修复：与后端 isOwnFactory 对齐 */
  isOwnFactory?: number;
  // 以下字段保留向后兼容（旧代码可能仍引用 totalMaterialCost/totalProcessCost/profit）
  /** @deprecated 请使用 materialCost */
  totalMaterialCost?: number;
  /** @deprecated 请使用 scanCost */
  totalProcessCost?: number;
  /** @deprecated 请使用 profitAmount */
  profit?: number;
  costBreakdown?: string;         // 成本明细JSON（后端动态计算，非 entity 字段）
}

export interface DeductionItem {
  id?: string;
  reconciliationId: string;
  deductionType: string;
  deductionAmount: number;
  description: string;
}

export interface MaterialReconQueryParams {
  reconciliationNo?: string;
  supplierName?: string;
  materialCode?: string;
  status?: string;
  sourceType?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

export type MaterialReconType = MaterialReconciliation;

export interface ShipmentReconQueryParams {
  reconciliationNo?: string;
  customerName?: string;
  orderNo?: string;
  styleNo?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

export interface OrderProfitOrderInfo {
  orderId: string;
  orderNo: string;
  styleNo?: string;
  styleName?: string;
  factoryName?: string;
  quantity: number;
  completedQuantity?: number;
  warehousingQuantity?: number;
}

export interface OrderProfitSummary {
  revenue: number;
  warehousingRevenue?: number;
  shipmentRevenue?: number;
  shipmentRevenueTotal?: number;
  profitReady?: boolean;
  calcBasis?: string;
  calcQty?: number;
  materialPlannedQty?: number;
  materialArrivedQty?: number;
  materialEffectiveArrivedQty?: number;
  materialArrivalRate?: number;
  materialPlannedCost: number;
  materialArrivedCost: number;
  processingCost: number;
  processingCostPaid?: number;
  incurredCost?: number;
  profit: number;
  unitRevenue: number;
  unitCost: number;
  actualUnitCost?: number;
  unitProfit: number;
  marginPercent: number;
  quotationUnitCost?: number;
  quotationTotalCost?: number;
  quotationUnitPrice?: number;
  quotationTotalPrice?: number;
}

export interface OrderProfitTimelinePoint {
  date: string;
  materialArrivedCost: number;
  processingCost: number;
  revenue: number;
  cumMaterialArrivedCost: number;
  cumProcessingCost: number;
  cumRevenue: number;
  cumProfit: number;
}

export interface OrderProfitMaterialItem {
  id?: string;
  purchaseNo?: string;
  materialCode?: string;
  materialName?: string;
  materialType?: string;
  specifications?: string;
  unit?: string;
  purchaseQuantity?: number;
  arrivedQuantity?: number;
  usedQuantity?: number;
  supplierName?: string;
  unitPrice?: number;
  totalAmount?: number;
  receivedTime?: string;
  status?: string;
  createTime?: string;
  updateTime?: string;
}

export interface OrderProfitResponse {
  order: OrderProfitOrderInfo;
  summary: OrderProfitSummary;
  materials: OrderProfitMaterialItem[];
  shipments: ShipmentReconciliation[];
  timeline: OrderProfitTimelinePoint[];
}

export interface PayrollOperatorProcessSummaryRow {
  approvalId?: string;
  approvalStatus?: 'pending' | 'approved';
  orderId?: string;
  orderNo?: string;
  orderStatus?: string;
  styleNo?: string;
  color?: string;
  size?: string;
  operatorId?: string;
  operatorName?: string;
  processName?: string;
  processCode?: string;
  cuttingBundleNo?: number;
  scanType?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  startTime?: string;
  endTime?: string;
  // Phase 6: 指派相关字段
  delegateTargetType?: string;  // 指派类型: internal/external/none
  delegateTargetName?: string;  // 被指派人/工厂名称
  actualOperatorName?: string;  // 实际操作员（谁扫的码）
}

export interface PayrollSettlement extends Record<string, unknown> {
  id?: string;
  /** P0 修复：与后端 PayrollSettlement entity 字段对齐 */
  settlementNo?: string;
  orderId?: string;
  orderNo?: string;
  styleId?: string;
  styleNo?: string;
  styleName?: string;
  startTime?: string;
  endTime?: string;
  totalQuantity?: number;
  totalAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  deductionAmount?: number;
  advanceAmount?: number;
  paymentStatus?: 'unpaid' | 'partially_paid' | 'fully_paid';
  /** 审批状态: pending/approved/cancelled（P0 修复：原前端缺失） */
  status?: 'pending' | 'approved' | 'cancelled';
  remark?: string;
  // 操作人字段（与后端 entity 对齐）
  auditorId?: string;
  auditorName?: string;
  auditTime?: string;
  confirmerId?: string;
  confirmerName?: string;
  confirmTime?: string;
  createBy?: string;
  updateBy?: string;
  tenantId?: number;
  createTime?: string;
  updateTime?: string;
  // 以下字段保留向后兼容（聚合 DTO 使用，非 entity 字段）
  /** @deprecated 聚合 DTO 字段，entity 无此字段 */
  operatorId?: string;
  /** @deprecated 聚合 DTO 字段，entity 无此字段 */
  operatorName?: string;
  /** @deprecated 聚合 DTO 字段，entity 无此字段 */
  recordCount?: number;
  /** @deprecated 聚合 DTO 字段，entity 无此字段 */
  orderCount?: number;
  /** @deprecated 请使用 auditTime */
  approvalTime?: string;
  /** @deprecated 请使用 confirmTime */
  paymentTime?: string;
}
