export interface MaterialInventory {
  id: string;
  materialCode: string;
  materialName: string;
  materialImage?: string;
  materialType: string;
  specification: string;
  color?: string;
  supplierName: string;
  quantity: number; // 统一用 quantity
  availableQty: number; // 暂时映射 quantity
  inTransitQty: number;
  lockedQty: number;
  safetyStock: number;
  unit: string;
  unitPrice: number;
  totalValue: number;
  warehouseLocation: string;
  lastInboundDate: string;
  lastOutboundDate: string;
  lastInboundBy?: string;     // 最后入库操作人
  lastOutboundBy?: string;    // 最后出库操作人
  remark?: string;            // 备注
  // 面料属性
  fabricWidth?: string;       // 门幅（仅面料）
  fabricWeight?: string;      // 克重（仅面料）
  fabricComposition?: string; // 成分（仅面料）
  size?: string;              // 尺码（兼容筛选/展示）
  updateTime?: string;
}
