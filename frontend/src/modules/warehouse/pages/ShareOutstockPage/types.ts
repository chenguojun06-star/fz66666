export interface OutstockItem {
  outstockNo: string;
  orderNo: string;
  styleNo: string;
  styleName?: string;
  color: string;
  size: string;
  outstockQuantity: number;
  salesPrice?: number;
  totalAmount?: number;
  trackingNo?: string;
  expressCompany?: string;
  outstockTime?: string;
  paymentStatus?: string;
}

export interface OutstockShareData {
  token: string;
  customerName: string;
  customerPhone?: string;
  shippingAddress?: string;
  companyName?: string;
  expiresAt?: number;
  items: OutstockItem[];
  totalQuantity?: number;
  totalAmount?: number;
}
