import api, { unwrapApiData } from '@/utils/api';

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

export interface InvoiceStats {
  totalIssued: number;
  issuedCount: number;
  draftCount: number;
  monthAmount: number;
}

// ============================================================
// API 方法
// ============================================================

const invoiceApi = {
  /** 分页列表 */
  list: async (params: InvoiceListReq): Promise<{ records: Invoice[]; total: number }> =>
    unwrapApiData<{ records: Invoice[]; total: number }>(
      await api.post('/finance/invoice/list', params),
      '加载发票列表失败',
    ),

  /** 统计 */
  stats: async (): Promise<InvoiceStats> =>
    unwrapApiData<InvoiceStats>(await api.get('/finance/invoice/stats'), '加载发票统计失败'),

  /** 新建发票 */
  create: async (data: Omit<Invoice, 'id'>): Promise<Invoice> =>
    unwrapApiData<Invoice>(await api.post('/finance/invoice/create', data), '新建发票失败'),

  /** 更新发票（仅草稿状态可编辑） */
  update: async (data: Invoice): Promise<Invoice> =>
    unwrapApiData<Invoice>(await api.put('/finance/invoice/update', data), '更新发票失败'),

  /** 标记已开票 */
  issue: async (id: string): Promise<void> => {
    await unwrapApiData<void>(await api.post(`/finance/invoice/${id}/issue`), '标记开票失败');
  },

  /** 作废发票 */
  cancel: async (id: string): Promise<void> => {
    await unwrapApiData<void>(await api.post(`/finance/invoice/${id}/cancel`), '作废发票失败');
  },
};

export default invoiceApi;
