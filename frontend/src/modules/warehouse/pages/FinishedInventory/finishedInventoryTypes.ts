export interface SKUDetail {
  color: string;
  size: string;
  sku: string;
  availableQty: number;
  lockedQty: number;
  defectQty: number;
  warehouseLocation: string;
  costPrice?: number;
  salesPrice?: number;
  originalSalesPrice?: number;
  priceAdjustmentReason?: string;
  outboundQty?: number;
  selected?: boolean;
  inProductionQty?: number;
  pendingSalesQty?: number;
}

export interface FinishedInventory {
  id: string;
  orderId?: string;
  orderNo: string;
  factoryName?: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  orderBizType?: string;
  parentOrgUnitId?: string;
  parentOrgUnitName?: string;
  orgPath?: string;
  styleId?: string;
  styleNo: string;
  styleName: string;
  styleImage?: string;
  color: string;
  size: string;
  sku: string;
  availableQty: number;
  lockedQty: number;
  defectQty: number;
  warehouseLocation: string;
  lastInboundDate: string;
  qualityInspectionNo?: string;
  lastInboundBy?: string;
  lastInboundQty?: number;
  lastOutboundDate?: string;
  lastOutstockNo?: string;
  lastOutboundBy?: string;
  totalInboundQty?: number;
  costPrice?: number;
  salesPrice?: number;
  colors?: string[];
  sizes?: string[];
  inProductionQty?: number;
  pendingSalesQty?: number;
}
