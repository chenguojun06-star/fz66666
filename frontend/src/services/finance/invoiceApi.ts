import api from '@/utils/api';

// ============================================================
// 类型定义（与后端 Invoice Entity 对齐）
// 购方信息字段前缀为 title*（VAT发票术语），销方为 seller*
// ============================================================

export type InvoiceType = 'VAT_SPECIAL' | 'VAT_GENERAL' | 'ELECTRONIC' | 'RECEIPT';
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED';

export interface Invoice {
  id?: string;
  invoiceNo?: string;
  invoiceType: InvoiceType;
  /** 购方名称 */
  titleName: string;
  /** 购方税号 */
  titleTaxNo?: string;
  titleAddress?: string;
  titlePhone?: string;
  titleBankName?: string;
  titleBankAccount?: string;
  sellerName?: string;
  sellerTaxNo?: string;
  /** 不含税金额 */
  amount?: number;
  taxRate?: number;
  taxAmount?: number;
  /** 价税合计 */
  totalAmount: number;
  relatedBizType?: string;
  relatedBizId?: string;
  relatedBizNo?: string;
  status?: InvoiceStatus;
  issueDate?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface InvoiceListReq {
  page?: number;
  pageSize?: number;
  status?: InvoiceStatus;
  invoiceType?: InvoiceType;
  keyword?: string;
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

  /** 更新发票（仅草稿状态可编辑） */
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
