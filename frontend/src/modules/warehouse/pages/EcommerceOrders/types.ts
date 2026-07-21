export interface EcOrder {
  id: number; orderNo: string; platform: string; sourcePlatformCode: string;
  platformOrderNo: string; shopName: string; buyerNick: string;
  productName: string; skuCode: string; quantity: number;
  unitPrice: number; totalAmount: number; payAmount: number;
  freight: number; discount: number; payType: string;
  payTime: string; shipTime: string; completeTime: string;
  receiverName: string; receiverPhone: string; receiverAddress: string;
  trackingNo: string; expressCompany: string;
  buyerRemark: string; sellerRemark: string;
  status: number; warehouseStatus: number;
  productionOrderId: string; productionOrderNo: string; createTime: string;
}

export interface Sku {
  id: number; styleNo: string; skuCode: string;
  color: string; size: string;
  costPrice: number | null; salesPrice: number | null;
  stockQuantity: number;
}
