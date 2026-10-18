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
  /** 销售单ID（用于打开电子小票；在线支付轮询路径可能缺失） */
  saleId?: number | null;
  /** 在线支付时的二维码内容（PAYING 时才有） */
  qrCode?: string | null;
  expireSeconds?: number;
  goodsAmount: number;
  discountAmount: number;
  roundOffAmount: number;
  totalAmount: number;
  payMethod: PosPayMethod;
  /**
   * 收款状态：PAYING 待支付（二维码已生成）/ PAID 已收款 /
   * UNPAID 挂账未收 / CANCELLED 已取消
   */
  payStatus: 'PAYING' | 'PAID' | 'UNPAID' | 'CANCELLED';
  itemCount: number;
  receivableId?: string | null;
  outstockNo?: string | null;
}

/** D-817：交接班 / 钱箱 */
export interface PosShift {
  shiftNo: string;
  cashierName: string;
  terminal: string | null;
  status: string;
  openingCash: number;
  saleCount: number;
  cashSaleAmount: number;
  onlineSaleAmount: number;
  cardSaleAmount: number;
  creditAmount: number;
  refundCashAmount: number;
  /** 应有钱箱 = 备用金 + 现金收款 − 现金退款 */
  expectedCash: number;
  actualCash: number | null;
  /** 差异 = 实点 − 应有（长款正 / 短款负） */
  diffAmount: number | null;
  diffReason: string | null;
  openedAt: string;
  closedAt: string | null;
  cashOnlyHint: string;
}

/** D-816：可退量行 */
export interface PosReturnableLine {
  saleItemId: number;
  skuId: number;
  skuCode: string;
  styleNo: string;
  styleName: string;
  color: string;
  size: string;
  unitPrice: number;
  soldQty: number;
  returnedQty: number;
  returnableQty: number;
}

export type PosReturnType = 'REFUND' | 'RETURN' | 'EXCHANGE';

export interface PosReturnBody {
  lines: Array<{ saleItemId: number; quantity: number }>;
  returnType: PosReturnType;
  reason?: string;
}

export interface PosReturnResult {
  returnNo: string;
  totalAmount: number;
  itemCount: number;
  refundStatus: string;
  refundStatusHint: string;
  inboundNos: string[];
}

/** D-817：挂单行 */
export interface PosHoldRow {
  holdNo: string;
  customerName: string | null;
  customerPhone: string | null;
  itemCount: number;
  goodsAmount: number;
  discountAmount: number;
  payMethod: string | null;
  remark: string | null;
  status: string;
  creatorName: string | null;
  createTime: string;
}

export interface PosHoldBody {
  lines: unknown[];
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  payMethod?: string | null;
  remark?: string | null;
}

export interface PosHoldResume {
  holdNo: string;
  lines: unknown[];
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  payMethod: string | null;
  remark: string | null;
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

/** 在线收款渠道是否可用（收银台据此决定微信/支付宝按钮能不能点） */
export interface PosChannelReadiness {
  ALIPAY?: boolean;
  WECHAT_PAY?: boolean;
}

/** 待支付单信息（二维码已生成，等顾客扫码） */
export interface PosPayInfo {
  saleNo: string;
  /** 二维码内容（微信 code_url / 支付宝 qr_code），前端渲染成二维码 */
  qrCode?: string | null;
  totalAmount: number;
  payMethod: PosPayMethod;
  /** 二维码有效期（秒） */
  expireSeconds?: number;
}

/** 待支付单的当前支付状态 */
export interface PosPayState {
  saleNo: string;
  payStatus: 'PAYING' | 'PAID' | 'UNPAID' | 'CANCELLED';
  paid: boolean;
  payMethod?: string;
  totalAmount?: number;
  outstockNo?: string | null;
  status?: string;
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

  /** 在线收款渠道可用性（未配置的渠道按钮置灰，避免点了才发现报错） */
  channels: () => api.get<PosChannelReadiness>('/pos/channels'),

  /**
   * 查询待支付单状态（轮询）。
   *
   * 服务端会**主动向渠道查询**并就地确认，所以即使支付回调丢了，
   * 这里也能把单子推进到已支付 —— 不能只依赖回调。
   */
  payState: (saleNo: string) =>
    api.get<PosPayState>(`/pos/sales/${encodeURIComponent(saleNo)}/pay-state`),

  /** 取消待支付单（顾客不买了 / 换支付方式）：先关渠道单，再作废本地单据 */
  // ── D-816 退货 / 换货 ──
  returnable: (saleNo: string) =>
    api.get<PosReturnableLine[]>(`/pos/sales/${encodeURIComponent(saleNo)}/returnable`),

  createReturn: (saleNo: string, body: PosReturnBody) =>
    api.post<PosReturnResult>(`/pos/sales/${encodeURIComponent(saleNo)}/return`, body),

  confirmRefund: (returnNo: string, note?: string) =>
    api.post<{ returnNo: string; refundStatus: string; refundedAmount: number }>(
      `/pos/returns/${encodeURIComponent(returnNo)}/confirm-refund`,
      { note },
    ),

  // ── D-817 交接班 / 钱箱 ──
  currentShift: () => api.get<PosShift | null>('/pos/shifts/current'),

  openShift: (body: { openingCash: number; terminal?: string; remark?: string }) =>
    api.post<PosShift>('/pos/shifts/open', body),

  closeShift: (body: { actualCash: number; diffReason?: string; remark?: string }) =>
    api.post<PosShift>('/pos/shifts/close', body),

  shifts: (limit = 50) => api.get<PosShift[]>('/pos/shifts', { params: { limit } }),

  // ── D-817 挂单（暂存购物区，不参与财务口径）──
  holds: (includeClosed = false) => api.get<PosHoldRow[]>('/pos/holds', { params: { includeClosed } }),

  hold: (body: PosHoldBody) => api.post<{ holdNo: string; itemCount: number }>('/pos/holds', body),

  resumeHold: (holdNo: string) =>
    api.post<PosHoldResume>(`/pos/holds/${encodeURIComponent(holdNo)}/resume`),

  discardHold: (holdNo: string, reason?: string) =>
    api.post<{ holdNo: string; status: string }>(`/pos/holds/${encodeURIComponent(holdNo)}/discard`, { reason }),

  cancelPay: (saleNo: string, reason?: string) =>
    api.post<null>(`/pos/sales/${encodeURIComponent(saleNo)}/cancel-pay`, { reason }),
};

export default posApi;
