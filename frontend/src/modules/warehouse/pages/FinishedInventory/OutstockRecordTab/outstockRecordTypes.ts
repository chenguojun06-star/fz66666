export interface OutstockRecord {
  id: number;
  outstockNo: string;
  productionOrderNo?: string;
  styleNo?: string;
  styleName?: string;
  skuCode?: string;
  color?: string;
  size?: string;
  outstockQuantity: number;
  costPrice?: number;
  salesPrice?: number;
  trackingNo?: string;
  expressCompany?: string;
  outstockType?: string;
  creatorName?: string;
  createTime?: string;
  remark?: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount?: number;
  paidAmount?: number;
  paymentStatus?: string;
  settlementTime?: string;
  approvalStatus?: string;
  approveByName?: string;
  approveTime?: string;
  platformCode?: string;
}

export const outstockTypeMap: Record<string, { label: string; color: string }> = {
  normal: { label: '普通出库', color: 'blue' },
  qrcode: { label: '扫码出库', color: 'green' },
  batch: { label: '批量出库', color: 'purple' },
  shipment: { label: '物流出库', color: 'cyan' },
};
