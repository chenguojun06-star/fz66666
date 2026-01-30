import { UploadFile } from 'antd/es/upload/interface';

export type CuttingBundleRow = {
  id?: string;
  productionOrderId?: string;
  productionOrderNo?: string;
  styleId?: string;
  styleNo?: string;
  color?: string;
  size?: string;
  quantity?: number;
  bundleNo?: number;
  qrCode?: string;
  status?: string;
};

export type BatchSelectBundleRow = {
  key: string;
  qr: string;
  bundleNo?: number;
  color?: string;
  size?: string;
  quantity?: number;
  availableQty?: number;
  statusText: string;
  disabled?: boolean;
  rawStatus?: string;
};

export type BundleRepairStats = {
  repairPool: number;
  repairedOut: number;
  remaining: number;
};

export type OrderLine = {
  color: string;
  size: string;
  quantity: number;
};
