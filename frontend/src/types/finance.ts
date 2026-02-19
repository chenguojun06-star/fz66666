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
  // Phase 6: 成本利润字段
  totalMaterialCost?: number;     // 总物料成本
  totalProcessCost?: number;      // 总工序成本
  totalCost?: number;             // 总成本
  profit?: number;                // 利润
  profitMargin?: number;          // 利润率（百分比）
  costBreakdown?: string;         // 成本明细JSON
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
  sourceType?: string; // 采购来源筛选: order=批采, sample=样衣
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

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
  orderId?: string;
  orderNo?: string;
  styleNo?: string;
  color?: string;
  size?: string;
  operatorId?: string;
  operatorName?: string;
  processName?: string;
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
