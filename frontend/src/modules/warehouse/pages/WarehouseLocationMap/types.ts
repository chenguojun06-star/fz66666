// 仓库仓位管理 - 类型定义与常量

export interface WarehouseAreaItem {
  id: string;
  areaCode: string;
  areaName: string;
  warehouseType: string;
  status: string;
  address?: string;
  contactPerson?: string;
  contactPhone?: string;
  managerName?: string;
  description?: string;
  sortOrder?: number;
}

export interface LocationItem {
  id: string;
  locationCode: string;
  locationName: string;
  zoneCode: string;
  zoneName: string;
  aisleCode: string;
  rackCode: string;
  levelCode: string;
  positionCode: string;
  locationType: string;
  warehouseType: string;
  areaId: string;
  capacity: number;
  usedCapacity: number;
  status: string;
  description?: string;
}

export interface LocationSkuItem {
  skuCode: string;
  styleNo: string;
  color: string;
  size: string;
  stockQuantity: number;
  salesPrice?: number;
  costPrice?: number;
}

// 出库物品项（含出库临时状态）
export interface OutboundItem extends LocationSkuItem {
  outboundQty: number;
  selected: boolean;
  adjustedPrice?: number;
}

export type LocationStatus = 'empty' | 'normal' | 'full' | 'locked';

export const WAREHOUSE_TYPE_MAP: Record<string, string> = {
  FINISHED: '成品仓',
  MATERIAL: '物料仓',
  SAMPLE: '样衣仓',
};

export const WAREHOUSE_TYPE_OPTIONS = [
  { value: 'FINISHED', label: '成品仓' },
  { value: 'MATERIAL', label: '物料仓' },
  { value: 'SAMPLE', label: '样衣仓' },
];

// 出库类型选项
export const OUTSTOCK_TYPE_OPTIONS = [
  { value: 'sales', label: '销售出库' },
  { value: 'gift', label: '赠送出库' },
  { value: 'transfer', label: '调拨出库' },
  { value: 'self_use', label: '自用出库' },
  { value: 'free_outbound', label: '自由出库' },
];

// 物料类型选项
export const MATERIAL_TYPE_OPTIONS = [
  { value: 'fabricA', label: '面料A' }, { value: 'fabricB', label: '面料B' },
  { value: 'fabricC', label: '面料C' }, { value: 'fabricD', label: '面料D' },
  { value: 'fabricE', label: '面料E' }, { value: 'liningA', label: '里料A' },
  { value: 'liningB', label: '里料B' }, { value: 'liningC', label: '里料C' },
  { value: 'liningD', label: '里料D' }, { value: 'liningE', label: '里料E' },
  { value: 'accessoryA', label: '辅料A' }, { value: 'accessoryB', label: '辅料B' },
  { value: 'accessoryC', label: '辅料C' }, { value: 'accessoryD', label: '辅料D' },
  { value: 'accessoryE', label: '辅料E' },
];
