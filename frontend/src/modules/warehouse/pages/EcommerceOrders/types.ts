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
  /** D-532：组合套装订单——平台商品编码=comboCode，出库按子SKU逐个扣减 */
  comboId?: number; comboCode?: string;
}

export interface Sku {
  id: number; styleNo: string; skuCode: string;
  color: string; size: string;
  costPrice: number | null; salesPrice: number | null;
  stockQuantity: number;
}
