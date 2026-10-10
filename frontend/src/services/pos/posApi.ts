import api from '@/utils/api';

/**
 * 收银台（POS 开单）服务。
 *
 * 金额一律由服务端计算：前端只传「单价、数量、折扣、抹零」这些原始输入，
 * 不传小计与应收合计 —— 否则前端算错就等于把错账记进库里。
 */

export interface PosSku {
  skuId: number;
  skuCode?: string | null;
  barcode?: string | null;
  styleId?: number | null;
  styleNo?: string | null;
  styleName?: string | null;
  cover?: string | null;
  color?: string | null;
  size?: string | null;
  /** 吊牌价 */
  tagPrice?: number | null;
  /** 店铺售价（收银台默认带出的单价） */
  salesPrice?: number | null;
  stock: number;
}

export interface PosCustomer {
  phone?: string;
  customerId?: string;
  customerName?: string;
  /** skuId → 上次成交单价（批发档口报价基准） */
  lastPrices?: Record<string, number>;
}

export type PosPayMethod = 'CASH' | 'WECHAT' | 'ALIPAY' | 'CARD' | 'CREDIT';

export interface PosCheckoutItem {
  skuId: number;
  quantity: number;
  /** 不传则由服务端取 SKU 售价 */
  unitPrice?: number;
}

export interface PosCheckoutBody {
  items: PosCheckoutItem[];
  payMethod: PosPayMethod;
  discount?: number;
  roundOff?: number;
  customerName?: string;
  customerPhone?: string;
  remark?: string;
}

export interface PosCheckoutResult {
  saleNo: string;
  goodsAmount: number;
  discountAmount: number;
  roundOffAmount: number;
  totalAmount: number;
  payMethod: PosPayMethod;
  payStatus: 'PAID' | 'UNPAID';
  itemCount: number;
  receivableId?: string | null;
  outstockNo?: string | null;
}

export interface PosTodaySummary {
  saleCount?: number;
  itemCount?: number;
  amount?: number;
  creditAmount?: number;
}

export interface PosPayMethodRow {
  payMethod: string;
  payStatus: string;
  saleCount: number;
  amount: number;
}

export interface PosRecentSale {
  id: number;
  saleNo: string;
  customerName?: string | null;
  itemCount: number;
  totalAmount: number;
  payMethod: string;
  payStatus: string;
  createTime: string;
}

export interface PosToday {
  summary: PosTodaySummary;
  byPayMethod: PosPayMethodRow[];
  recent: PosRecentSale[];
}

export const posApi = {
  /** 扫码/关键字找货（精确命中排最前） */
  searchSkus: (keyword: string, limit = 30) =>
    api.get<PosSku[]>('/pos/skus', { params: { keyword, limit } }),

  /** 按手机号带出客户与上次成交价 */
  customer: (phone: string) => api.get<PosCustomer>('/pos/customer', { params: { phone } }),

  /** 开单 */
  checkout: (body: PosCheckoutBody) => api.post<PosCheckoutResult>('/pos/checkout', body),

  /** 今日汇总（交班对账） */
  today: () => api.get<PosToday>('/pos/today'),
};

export default posApi;
