import api from '@/utils/api';
import { SalesReturn, SalesReturnItem, CreateSalesReturnRequest } from '../types/salesReturn';

/** 创建退货单 */
export function createSalesReturn(data: CreateSalesReturnRequest): Promise<number> {
  return api.post('/crm/sales-return/create', data);
}

/** 查询退货单列表 */
export function getSalesReturnList(params: {
  page?: number;
  pageSize?: number;
  returnNo?: string;
  originalOrderNo?: string;
  customerName?: string;
  returnStatus?: string;
  ecommerceOrderId?: number;
}): Promise<{ records: SalesReturn[]; total: number }> {
  return api.get('/crm/sales-return/list', { params });
}

/** 查询退货单详情 */
export function getSalesReturnDetail(id: number): Promise<{
  returnOrder: SalesReturn;
  items: SalesReturnItem[];
}> {
  return api.get(`/crm/sales-return/${id}`);
}

/** 审核退货单 */
export function approveSalesReturn(
  id: number,
  data: { approveRemark?: string; refundAmount?: number }
): Promise<void> {
  return api.post(`/crm/sales-return/${id}/approve`, data);
}

/** 拒绝退货单 */
export function rejectSalesReturn(id: number, reason: string): Promise<void> {
  return api.post(`/crm/sales-return/${id}/reject`, null, { params: { reason } });
}

/** 标记退款完成 */
export function markRefunded(id: number): Promise<void> {
  return api.post(`/crm/sales-return/${id}/refund`);
}