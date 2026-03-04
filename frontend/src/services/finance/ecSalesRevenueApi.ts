import api from '../../utils/api';

export interface EcRevenueListParams {
  page?: number;
  pageSize?: number;
  status?: string;       // pending | confirmed | reconciled
  platform?: string;     // TB | JD | PDD | DY | XHS | WC | SFY | TM
  keyword?: string;      // 流水号 / 平台单号 / 商品名
}

export interface EcRevenueSummary {
  pendingCount: number;
  pendingAmount: number;
  confirmedCount: number;
  confirmedAmount: number;
  reconciledCount: number;
  reconciledAmount: number;
  netIncome: number;
}

export interface EcRevenueRecord {
  id: number;
  revenueNo: string;
  ecOrderId: number;
  ecOrderNo: string;
  platformOrderNo: string;
  platform: string;
  shopName: string;
  productName: string;
  skuCode: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  payAmount: number;
  freight: number;
  discount: number;
  productionOrderNo: string;
  shipTime: string;
  status: 'pending' | 'confirmed' | 'reconciled';
  remark: string;
  completeTime: string;
  createTime: string;
}

const BASE = '/finance/ec-revenue';

export const ecSalesRevenueApi = {
  /** 分页查询 EC 销售收入列表 */
  list: (params: EcRevenueListParams) =>
    api.post<{ records: EcRevenueRecord[]; total: number; current: number; size: number }>(
      `${BASE}/list`,
      params
    ),

  /** 汇总统计（待核账 / 已核账 / 已入账 金额+单数）*/
  summary: (params?: { platform?: string }) =>
    api.post<EcRevenueSummary>(`${BASE}/summary`, params ?? {}),

  /** 状态流转：confirm（核账）| reconcile（入账）*/
  stageAction: (id: number, action: 'confirm' | 'reconcile', remark?: string) =>
    api.post(`${BASE}/${id}/stage-action`, { remark }, { params: { action } }),
};
