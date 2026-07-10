/** 销售退货单 */
export interface SalesReturn {
  id: number;
  tenantId: number;
  returnNo: string;
  originalOrderId: number;
  originalOrderNo: string;
  ecommerceOrderId?: number;
  customerId?: string;
  customerName?: string;
  returnType: 'FULL' | 'PARTIAL';
  returnReason?: string;
  returnStatus: 'PENDING' | 'APPROVED' | 'REFUNDED' | 'REJECTED';
  totalAmount: number;
  refundAmount?: number;
  operatorId?: string;
  operatorName?: string;
  approveTime?: string;
  approveUserId?: string;
  approveUserName?: string;
  refundTime?: string;
  remark?: string;
  createTime: string;
  updateTime: string;
  deleteFlag: number;
}

/** 退货商品明细 */
export interface SalesReturnItem {
  id: number;
  tenantId: number;
  returnId: number;
  styleId?: string;
  styleNo?: string;
  styleName?: string;
  color?: string;
  size?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  returnReason?: string;
  createTime: string;
}

/** 创建退货单请求 */
export interface CreateSalesReturnRequest {
  originalOrderId: number;
  ecommerceOrderId?: number;
  returnReason?: string;
  remark?: string;
  items: SalesReturnItemRequest[];
}

/** 退货商品明细请求 */
export interface SalesReturnItemRequest {
  styleId?: string;
  styleNo?: string;
  styleName?: string;
  color?: string;
  size?: string;
  quantity?: number;
  unitPrice?: number;
  returnReason?: string;
}