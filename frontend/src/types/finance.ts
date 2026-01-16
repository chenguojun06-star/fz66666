// 财务结算模块类型定义

export interface FactoryReconciliation {
  id?: string;
  reconciliationNo: string;
  factoryId: string;
  factoryName: string;
  styleId: string;
  styleNo: string;
  styleName: string;
  orderId: string;
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
}

export interface MaterialReconciliation {
  id?: string;
  reconciliationNo: string;
  supplierId: string;
  supplierName: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  purchaseId: string;
  purchaseNo: string;
  orderId?: string;
  orderNo?: string;
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
}

export interface DeductionItem {
  id?: string;
  reconciliationId: string;
  deductionType: string;
  deductionAmount: number;
  description: string;
}

export interface FinanceQueryParams {
  reconciliationNo?: string;
  factoryName?: string;
  styleNo?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

export interface MaterialReconQueryParams {
  reconciliationNo?: string;
  supplierName?: string;
  materialCode?: string;
  status?: string;
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

export interface FinanceListResponse {
  list: (FactoryReconciliation | MaterialReconciliation | ShipmentReconciliation)[];
  total: number;
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
  factories: FactoryReconciliation[];
  shipments: ShipmentReconciliation[];
  timeline: OrderProfitTimelinePoint[];
}
