import api from '@/utils/api';

// ============================================================
// 类型定义
// ============================================================

export type InvoiceType = 'VAT_SPECIAL' | 'VAT_GENERAL' | 'ELECTRONIC' | 'RECEIPT';
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED';

export interface Invoice {
  id?: string;
  invoiceNo?: string;
  invoiceType: InvoiceType;
  buyerName: string;
  buyerTaxNo?: string;
  sellerName?: string;
  sellerTaxNo?: string;
  totalAmount: number;
  taxAmount?: number;
  invoiceDate?: string;
  status?: InvoiceStatus;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface InvoiceListReq {
  page?: number;
  size?: number;
  status?: InvoiceStatus;
  buyerName?: string;
  invoiceType?: InvoiceType;
  startDate?: string;
  endDate?: string;
}

// ============================================================
// API 方法
// ============================================================

const invoiceApi = {
  /** 分页列表 */
  list: (params: InvoiceListReq) =>
    api.post<any>('/finance/invoice/list', params),

  /** 新建发票 */
  create: (data: Omit<Invoice, 'id'>) =>
    api.post<Invoice>('/finance/invoice/create', data),

  /** 更新发票 */
  update: (data: Invoice) =>
    api.put<Invoice>('/finance/invoice/update', data),

  /** 标记已开票 */
  issue: (id: string) =>
    api.post<void>(`/finance/invoice/${id}/issue`),

  /** 作废发票 */
  cancel: (id: string) =>
    api.post<void>(`/finance/invoice/${id}/cancel`),
};

export default invoiceApi;
