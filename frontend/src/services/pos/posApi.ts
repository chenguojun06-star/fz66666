import api, { unwrapApiData } from '@/utils/api';

/** 后端信封类型（仅 service 内部解包用） */
interface ApiEnvelope<T> { code: number; data: T; message?: string; }

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
  /** 品类（分类页签过滤用；空值归「未分类」） */
  category?: string | null;
  color?: string | null;
  size?: string | null;
  /** 吊牌价 */
  tagPrice?: number | null;
  /** 店铺售价（收银台默认带出的单价） */
  salesPrice?: number | null;
  stock: number;
}

/** 批发阶梯价配置（满 N 件整单打 X 折；未配置时 enabled=false） */
export interface PosWholesaleTier {
  configured?: boolean;
  minQty: number;
  /** 折扣率 0.90 = 九折 */
  discountRate: number;
  enabled: boolean;
  remark?: string | null;
}

export interface PosCustomer {
  phone?: string;
  customerId?: string;
  customerName?: string;
  /** skuId → 上次成交单价（批发档口报价基准） */
  lastPrices?: Record<string, number>;
}

export type PosPayMethod = 'CASH' | 'WECHAT' | 'ALIPAY' | 'CARD' | 'CREDIT' | 'MEMBER_BALANCE';

export interface PosCheckoutItem {
  skuId: number;
  quantity: number;
  /** 不传则由服务端取 SKU 售价 */
  unitPrice?: number;
}

/** 组合支付的一行：方式 + 实收金额（现金行存应纳金额，找零在前端展示不入库） */
export interface PosPaymentLine {
  payMethod: PosPayMethod;
  amount: number;
}

export interface PosCheckoutBody {
  items: PosCheckoutItem[];
  payMethod: PosPayMethod;
  /**
   * 组合支付明细（多种方式混收，如现金500+微信300）。
   * 各行合计必须等于应收金额；缺省 = 单一方式收款（老协议）。
   */
  payments?: PosPaymentLine[];
  discount?: number;
  roundOff?: number;
  customerName?: string;
  customerPhone?: string;
  remark?: string;
  /** 会员ID（决定会员折扣；含 MEMBER_BALANCE 行时必填） */
  memberId?: string;
  /** 挂账授权人账号（含 CREDIT 行时必填，后端会校验密码与授权资格） */
  creditApprover?: string;
  /** 挂账授权密码（只在这一次请求里传输，不做任何缓存） */
  creditApproverPassword?: string;
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

/** D-817 会员 */
export interface PosMember {
  id: string;
  memberNo: string;
  phone: string;
  name: string | null;
  levelCode: string;
  /** 折扣率：1 不打折，0.9 九折 */
  discountRate: number;
  balance: number;
  totalRecharge: number;
  totalSpend: number;
  points: number;
  status: string;
  remark: string | null;
  createTime: string;
}

export interface PosMemberTx {
  type: 'RECHARGE' | 'CONSUME' | 'REFUND' | 'ADJUST' | string;
  amount: number;
  balanceAfter: number;
  saleNo: string | null;
  bizNo: string | null;
  operatorName: string | null;
  remark: string | null;
  createTime: string;
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
  /** 快照里第一件商品的编码（款式图/款号列用；权威款号由 /style/sku/brief 解析） */
  previewSkuCode?: string | null;
  /** 快照里第一件商品的品名（仅快照片段，解析不到款号时兜底显示） */
  previewStyleName?: string | null;
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

export interface PosRecentSaleItem {
  skuId?: number | null;
  skuCode?: string | null;
  styleNo?: string | null;
  styleName?: string | null;
  color?: string | null;
  size?: string | null;
  unitPrice?: number | null;
  quantity?: number | null;
  amount?: number | null;
}

export interface PosRecentSale {
  id: number;
  saleNo: string;
  /** 该单全部商品明细（展开行用；一单多件时只看首件无法核对） */
  items?: PosRecentSaleItem[];
  /** 该单第一件商品的编码（后端带出，用于款式图/款号列；权威款号由 /style/sku/brief 解析） */
  skuCode?: string | null;
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
  /**
   * 销售单ID：支付成功后凭它取电子小票（getByBiz 只按ID主查）。
   * 此前没存这个字段，扫码支付成功后只有 saleNo、小票取不出来，
   * 收银员只能等顾客事后扫小票二维码 —— 2026-10-21 统一小票版式时补上。
   */
  saleId?: number | null;
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

/** 挂起成功后的回执（注意：api.post 同样返回 {code,data} 信封，调用方必须解包） */
export interface PosHoldCreated {
  holdNo: string;
  itemCount: number;
}

/**
 * 收银台 API。
 *
 * <p><b>所有方法都在这一层解包 {code,data} 信封</b>，和 ticketApi 一致。
 * 之前这里直接 return `api.get(...)`，把信封原样丢给调用方，
 * 结果三个新面板都把 `{code,data}` 当数组塞给 antd Table，
 * 线上 `dataSource.some is not a function` 整页白屏 ——
 * 而单测 mock 的是已解包数组，所以测试全绿、线上全炸。
 *
 * <p>记住：`api.get` 返回的是 `response.data`，**不解包**。
 */
export const posApi = {
  /** 扫码/关键字找货（精确命中排最前） */
  searchSkus: async (keyword: string, limit = 30) =>
    unwrapApiData<PosSku[]>(
      await api.get('/pos/skus', { params: { keyword, limit } }),
      '搜索商品失败',
    ),

  /** 按手机号带出客户与上次成交价 */
  customer: async (phone: string) => unwrapApiData<PosCustomer>(
      await api.get('/pos/customer', { params: { phone } }),
      '查询客户失败',
    ),

  /** 批发阶梯价配置（未配置时 enabled=false） */
  wholesaleTier: async () =>
    unwrapApiData<PosWholesaleTier>(await api.get('/pos/wholesale-tier'), '批发价配置加载失败'),

  /** 保存批发阶梯价配置（覆盖式，单档） */
  saveWholesaleTier: async (body: { minQty: number; discountRate: number; enabled: boolean }) =>
    unwrapApiData<PosWholesaleTier>(await api.post('/pos/wholesale-tier', body), '批发价配置保存失败'),

  /** 开单 */
  checkout: async (body: PosCheckoutBody) => unwrapApiData<PosCheckoutResult>(await api.post('/pos/checkout', body), '开单失败'),

  /** 今日汇总（交班对账） */
  today: async () => unwrapApiData<PosToday>(await api.get('/pos/today'), '加载今日汇总失败'),

  /** 在线收款渠道可用性（未配置的渠道按钮置灰，避免点了才发现报错） */
  channels: async () => unwrapApiData<PosChannelReadiness>(await api.get('/pos/channels'), '渠道状态加载失败'),

  /**
   * 查询待支付单状态（轮询）。
   *
   * 服务端会**主动向渠道查询**并就地确认，所以即使支付回调丢了，
   * 这里也能把单子推进到已支付 —— 不能只依赖回调。
   */
  payState: async (saleNo: string) =>
    unwrapApiData<PosPayState>(
      await api.get(`/pos/sales/${encodeURIComponent(saleNo)}/pay-state`),
      '查询支付状态失败',
    ),

  /** 取消待支付单（顾客不买了 / 换支付方式）：先关渠道单，再作废本地单据 */
  // ── D-816 退货 / 换货 ──
  returnable: async (saleNo: string) =>
    unwrapApiData<PosReturnableLine[]>(
      await api.get(`/pos/sales/${encodeURIComponent(saleNo)}/returnable`),
      '查询可退数量失败',
    ),

  createReturn: async (saleNo: string, body: PosReturnBody) =>
    unwrapApiData<PosReturnResult>(
      await api.post(`/pos/sales/${encodeURIComponent(saleNo)}/return`, body),
      '提交退货失败',
    ),

  confirmRefund: async (returnNo: string, note?: string) =>
    unwrapApiData<{ returnNo: string; refundStatus: string; refundedAmount: number }>(
      await api.post(`/pos/returns/${encodeURIComponent(returnNo)}/confirm-refund`, { note }),
      '确认退款失败',
    ),


  /**
   * ── D-817 会员（全部返回裸数据）──
   *
   * <p>这里漏解包曾造成线上 bug：`setMember(信封)` → 信封恒为 truthy，
   * 会员面板读 member.name / member.balance 全是 undefined；
   * 充值成功提示显示「当前余额 undefined」，且用 `member.id = undefined`
   * 去请求充值 —— 收银台会员路径最不能碰的两处都已钉契约测试。
   */
  memberByPhone: async (phone: string): Promise<PosMember | null> =>
    unwrapApiData<PosMember | null>(
      await api.get<ApiEnvelope<PosMember | null>>('/pos/members/by-phone', { params: { phone } }),
      '会员查询失败',
    ),

  enrollMember: async (body: { phone: string; name?: string; discountRate?: number; remark?: string }): Promise<PosMember> =>
    unwrapApiData<PosMember>(await api.post<ApiEnvelope<PosMember>>('/pos/members', body), '建档失败'),

  rechargeMember: async (body: { memberId: string; amount: number; remark?: string }): Promise<PosMember> =>
    unwrapApiData<PosMember>(await api.post<ApiEnvelope<PosMember>>('/pos/members/recharge', body), '充值失败'),

  memberTransactions: async (memberId: string, limit = 50): Promise<PosMemberTx[]> =>
    unwrapApiData<PosMemberTx[]>(
      await api.get<ApiEnvelope<PosMemberTx[]>>(
        `/pos/members/${encodeURIComponent(memberId)}/transactions`,
        { params: { limit } },
      ),
      '会员流水加载失败',
    ),

  // ── D-817 交接班 / 钱箱 ──
  currentShift: async () => unwrapApiData<PosShift | null>(await api.get('/pos/shifts/current'), '加载班次失败'),

  openShift: async (body: { openingCash: number; terminal?: string; remark?: string }) =>
    unwrapApiData<PosShift>(await api.post('/pos/shifts/open', body), '开班失败'),

  closeShift: async (body: { actualCash: number; diffReason?: string; remark?: string }) =>
    unwrapApiData<PosShift>(await api.post('/pos/shifts/close', body), '交班失败'),

  shifts: async (limit = 50) => unwrapApiData<PosShift[]>(await api.get('/pos/shifts', { params: { limit } }), '加载班次历史失败'),

  // ── D-817 挂单（暂存购物区，不参与财务口径）──
  holds: async (includeClosed = false) => unwrapApiData<PosHoldRow[]>(await api.get('/pos/holds', { params: { includeClosed } }), '加载挂单失败'),

  hold: async (body: PosHoldBody) => unwrapApiData<PosHoldCreated>(await api.post('/pos/holds', body), '挂单失败'),

  resumeHold: async (holdNo: string) =>
    unwrapApiData<PosHoldResume>(
      await api.post(`/pos/holds/${encodeURIComponent(holdNo)}/resume`),
      '取回挂单失败',
    ),

  discardHold: async (holdNo: string, reason?: string) =>
    unwrapApiData<{ holdNo: string; status: string }>(
      await api.post(`/pos/holds/${encodeURIComponent(holdNo)}/discard`, { reason }),
      '丢弃挂单失败',
    ),

  cancelPay: async (saleNo: string, reason?: string) =>
    unwrapApiData<null>(
      await api.post(`/pos/sales/${encodeURIComponent(saleNo)}/cancel-pay`, { reason }),
      '取消待支付单失败',
    ),
};

export default posApi;
