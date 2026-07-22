export interface UniversalStock {
  id: number;
  tenantId: number;
  styleId: number;
  skuId: number;
  skuCode: string | null;
  warehouse: string | null;
  totalWarehoused: number;
  totalOutstock: number;
  pendingOrders: number;
  availableStock: number;
  safeStock: number;
  bufferStock: number;
  onWayProduction: number;
  lastSyncTime: string;
}

export interface StockAlert {
  id: number;
  styleId: number;
  skuId: number;
  skuCode: string | null;
  warehouse: string | null;
  alertType: string;
  currentStock: number;
  safeStock: number;
  message: string;
  isResolved: boolean;
  createTime: string;
}

export interface PurchaseSuggestion {
  id: number;
  styleId: number;
  skuId: number;
  skuCode: string | null;
  styleNo: string | null;
  suggestQuantity: number;
  urgencyLevel: string;
  reason: string;
  sales30d: number;
  availableStock: number;
  onWayStock: number;
  onWayProduction: number;
  status: number;
  suggestionType?: string;
  productionOrderId?: number | null;
  aiConfidence?: number | null;
  aiReason?: string | null;
  createTime: string;
}

export interface WarehouseAllocation {
  id: number;
  orderId: number;
  orderNo: string;
  skuCode: string;
  warehouse: string;
  allocatedQuantity: number;
  allocationType: string;
  score?: number | null;
  reason?: string | null;
  estimatedDays?: number | null;
  createTime: string;
}

export interface OrderSplit {
  id: number;
  originalOrderId: number;
  originalOrderNo: string;
  splitOrderNo: string;
  skuCode: string;
  warehouse: string;
  splitQuantity: number;
  splitReason: string;
  splitType?: string;
  status: number;
  createTime: string;
}

export interface MergeOrderItem {
  orderId: number;
  orderNo: string;
  skuCode: string;
  quantity: number;
  totalAmount: number;
}

export interface MergeGroup {
  receiverName: string;
  receiverPhone: string;
  platform: string;
  orderCount: number;
  totalQuantity: number;
  orders: MergeOrderItem[];
}

export interface MergeResult {
  successCount: number;
  failedOrderIds: number[];
  trackingNo: string;
  totalCount: number;
}

export interface GiftRule {
  id?: number;
  tenantId?: number;
  ruleName: string;
  giftSkuCode: string;
  giftQuantity: number;
  triggerType: 'AMOUNT' | 'QUANTITY' | 'PLATFORM';
  triggerValue?: number;
  triggerPlatform?: string;
  startTime?: string;
  endTime?: string;
  enabled: number;
  deleteFlag?: number;
  createTime?: string;
  updateTime?: string;
}

export interface GiftMatch {
  ruleId: number;
  ruleName: string;
  giftSkuCode: string;
  giftQuantity: number;
  triggerType: string;
  reason: string;
}

export interface LogisticsAnomaly {
  id: number;
  tenantId?: number;
  orderId: number;
  orderNo: string;
  trackingNo?: string | null;
  expressCompany?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  anomalyType: string;
  severity: string;
  daysSinceUpdate?: number;
  lastTrackDesc?: string | null;
  lastTrackTime?: string | null;
  aiAdvice?: string | null;
  aiConfidence?: number | null;
  handledStatus: number;
  handledBy?: string | null;
  handledTime?: string | null;
  handledRemark?: string | null;
  createTime?: string;
}

export interface PlatformBill {
  id: number;
  tenantId?: number;
  platform: string;
  shopName?: string | null;
  billPeriod: string;
  billNo?: string | null;
  platformOrderNo: string;
  localRevenueId?: number | null;
  localRevenueNo?: string | null;
  platformAmount: number;
  localAmount: number;
  diffAmount: number;
  diffType: string;
  aiAnalysis?: string | null;
  aiConfidence?: number | null;
  handledStatus: number;
  handledBy?: string | null;
  handledTime?: string | null;
  handledRemark?: string | null;
  fetchedTime?: string | null;
  createTime?: string;
}

export interface ReconcileResult {
  billPeriod: string;
  totalBills: number;
  matched: number;
  mismatched: number;
  missingLocal: number;
  newBills: number;
}
