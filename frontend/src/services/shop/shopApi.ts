import api, { unwrapApiData } from '@/utils/api';

/**
 * D-763：C端店铺管理服务。
 * 公开侧（游客）接口在 /shop/public/**，不走这里；这里是管理端 /shop/admin/**。
 */

export interface ShopConfig {
  id: string;
  tenantId: number;
  slug: string;
  shopName: string;
  notice?: string;
  enabled: number;
  /** D-513 配送：是否收运费（1 收 / 0 全场包邮） */
  shippingEnabled?: number | null;
  /** 默认运费（未达包邮门槛时收取） */
  shippingFee?: number | null;
  /** 满额包邮门槛：0 表示无门槛 */
  freeShippingThreshold?: number | null;
  /** 配送说明（买家可见） */
  shippingNote?: string | null;
  /** 详情页图片轮播：1=自动播放 0=不自动（默认 1） */
  carouselAutoplay?: number | null;
  /** 轮播间隔毫秒（2000~10000，默认 4000） */
  carouselIntervalMs?: number | null;
  /** D-769 服务承诺：退货天数（0=不承诺） */
  returnDays?: number | null;
  promiseInStock?: number | null;
  promiseAuthentic?: number | null;
  promiseExtra?: string | null;
}

/**
 * 店铺数据看板（日报）。
 *
 * 只四个数：浏览 → 加购 → 下单 → 下单金额。
 * 浏览/加购来自按天计数器（购物车行结算后会被删、浏览日志按顾客+款式合并，事后算不出），
 * 下单与金额实时查订单表 —— 所以两边口径必须一起看，不能只看一个。
 */
export interface ShopDashboardDailyRow {
  date: string;
  browseCount: number;
  cartAddCount: number;
  orderCount: number;
  orderAmount: number;
}

export interface ShopDashboardSummary {
  label: string;
  days: number;
  browseCount: number;
  cartAddCount: number;
  orderCount: number;
  orderAmount: number;
}

export interface ShopDashboardData {
  records: ShopDashboardDailyRow[];
  summary: ShopDashboardSummary[];
}

export interface ShopOrder {
  id: string;
  orderNo: string;
  customerId?: string;
  customerName: string;
  phone: string;
  address: string;
  totalAmount: number;
  /** 金额（不含运费） */
  goodsAmount?: number | null;
  /** 运费 */
  shippingFee?: number | null;
  itemCount: number;
  status: 'PENDING_SHIP' | 'SHIPPED' | 'CANCELLED';
  receivableId?: string;
  outstockNo?: string;
  /** 快递公司（发货后） */
  expressCompany?: string | null;
  /** 快递单号（发货后） */
  expressNo?: string | null;
  /** 发货时间（发货后） */
  shipTime?: string | null;
  /** 取消原因（取消后） */
  cancelReason?: string | null;
  /** 取消时间（取消后） */
  cancelTime?: string | null;
  /** 售后状态：NONE / APPLIED（待处理）/ APPROVED（已同意）/ REJECTED（已拒绝） */
  afterSaleStatus?: string | null;
  /** 售后类型：REFUND_ONLY（仅退款）/ RETURN_REFUND（退货退款） */
  afterSaleType?: string | null;
  /** 售后原因 */
  afterSaleReason?: string | null;
  /** 商家处理备注 */
  afterSaleRemark?: string | null;
  /** 售后登记时间 */
  afterSaleTime?: string | null;
  remark?: string;
  createTime: string;
}

/** 订单商品明细行 */
export interface ShopOrderItem {
  id: string;
  skuCode?: string;
  styleNo?: string;
  styleName?: string;
  color?: string;
  size?: string;
  unitPrice?: number | null;
  quantity?: number | null;
  amount?: number | null;
}

/** 订单首件商品摘要（列表「商品」列数据源，后端 orders.firstItems） */
export interface ShopOrderFirstItem {
  skuCode?: string | null;
  styleNo?: string | null;
  styleName?: string | null;
  color?: string | null;
  size?: string | null;
  quantity?: number | null;
}

/** 电子小票签收状态（orders.signInfos / orderDetail.signInfo，只读） */
export interface ShopOrderSignInfo {
  status?: string | null;
  signedTime?: string | null;
  signedBy?: string | null;
}

/** 订单详情（订单头 + 明细） */
export interface ShopOrderDetail {
  order: ShopOrder;
  items: ShopOrderItem[];
  signInfo?: ShopOrderSignInfo | null;
}

/** 订单概览统计 */
export interface ShopOrderStats {
  pendingShip: number;
  todayOrders: number;
  todayAmount: number;
  totalOrders: number;
  totalAmount: number;
}

/** 店铺订单分页响应（分页 + 列表辅助摘要） */
export interface ShopOrderPage {
  records: ShopOrder[];
  total: number;
  current: number;
  pages: number;
  /** orderId → 首件商品摘要（款式图/款号列数据源） */
  firstItems?: Record<string, ShopOrderFirstItem>;
  /** orderId → 电子小票签收状态 */
  signInfos?: Record<string, ShopOrderSignInfo>;
}

/** 批量发货结果 */
export interface BatchShipResult {
  shipped: number;
  failed: string[];
}

/** 款式维度的 SKU 聚合（D-768 店铺商品列表用） */

/* ── D-769 批量调价 ── */
export type BatchPriceMode = 'SET' | 'PERCENT_ADJUST';

export interface BatchPriceItem {
  styleId: number | string;
  skuCount: number;
  oldMinPrice?: number | null;
  oldMaxPrice?: number | null;
  newMinPrice?: number | null;
  newMaxPrice?: number | null;
  /** 保守毛利（最低售价 − 最高成本）；成本缺失时为 null */
  oldProfit?: number | null;
  newProfit?: number | null;
  /** 由盈转亏 */
  becomesLoss: boolean;
  /** 成本是否已维护；false 时利润结论不可信 */
  costKnown: boolean;
}

export interface BatchPricePreview {
  items: BatchPriceItem[];
  styleCount: number;
  skuCount: number;
  /** 将由盈转亏的款式数 */
  lossCount: number;
  dryRun: boolean;
}


/* ── D-770：详情页模块布局 ── */
export interface LayoutModuleDef {
  moduleKey: string;
  defaultTitle: string;
  canHide: boolean;
}
export interface StyleLayoutItem {
  moduleKey: string;
  sortOrder: number;
  enabled: number;
  moduleTitle?: string | null;
}

export interface ShopSkuSummary {
  minPrice?: number | null;
  maxPrice?: number | null;
  /** D-769：成本区间。全为 null 表示该款 SKU 未维护成本 */
  minCost?: number | null;
  maxCost?: number | null;
  /** 成本维护覆盖率 0~100；<100 表示部分 SKU 缺成本，利润结论不可信 */
  costCoverage?: number;
  pricedSkuCount?: number;
  totalStock?: number;
  colorCount?: number;
  skuCount?: number;
}

/** 店铺商品运营：SKU 售价 + 库存（D-768） */
export interface BatchSaveSkuItem {
  skuId: number | string;
  /** 不传表示不改售价 */
  salesPrice?: number | null;
  /** 不传表示不改库存；传的是「目标值」，服务端换算增减量 */
  stockQuantity?: number | null;
}

export interface BatchSaveSkuResult {
  priceChanged: number;
  stockChanged: number;
  /** skuId → 更新后的真实库存（可能被钳制，用于回显提示） */
  stockAfter: Record<string, number>;
}

/** D-837：实际仓库库存聚合行（只读，按入库明细合计） */
export interface SkuWarehouseStockItem {
  skuId: number | string;
  skuCode: string;
  color?: string | null;
  size?: string | null;
  /** 实际仓库库存（合格入库合计，不可手改） */
  warehouseStock: number;
  /** D-838 收口：入库明细聚合部分 / 无单差额部分 */
  inboundStock?: number;
  unsupportedStock?: number;
}

/** 店铺商品的 SKU 原始行（来自 /style/sku/search） */
export interface ShopStyleSku {
  id: number;
  skuCode?: string;
  styleNo?: string;
  color?: string;
  size?: string;
  skuColorImage?: string | null;
  salesPrice?: number | null;
  tagPrice?: number | null;
  stockQuantity?: number | null;
  skuMode?: 'AUTO' | 'MANUAL';
}

export const shopAdminApi = {
  /**
   * 店铺数据看板（日报）。
   *
   * 返回 Result 信封，调用方必须 unwrapApiData 取 data。
   */
  dashboardDaily: async (days = 30): Promise<ShopDashboardData> =>
    unwrapApiData<ShopDashboardData>(
      await api.get('/shop/admin/dashboard/daily', { params: { days } }),
      '加载店铺看板失败',
    ),

  /**
   * 类目词表（中文规范类目）。
   *
   * 走上架页可选类目 —— 类目字段在库里是自由文本（老数据有 WOMAN/上衣/SKIRT 混着存），
   * 让商家从同一份词表里选，才不会继续产生中英混杂的数据。
   * 这是公开接口（类目名本来就公开），无需额外权限。
   */
  categoryOptions: async (): Promise<ShopCategoryOption[]> =>
    unwrapApiData<ShopCategoryOption[]>(
      await api.get('/shop/public/platform/categories'),
      '加载类目词表失败',
    ),

  /** 店铺配置（首次访问自动建档，slug=t{tenantId}，默认打烊） */
  getConfig: async (): Promise<ShopConfig> =>
    unwrapApiData<ShopConfig>(await api.get('/shop/admin/config'), '加载店铺配置失败'),

  /** 更新配置（名称/公告/打烊开关/配送设置） */
  saveConfig: async (body: {
    shopName?: string;
    notice?: string;
    enabled?: number | boolean;
    shippingEnabled?: number | boolean;
    shippingFee?: number;
    freeShippingThreshold?: number;
    shippingNote?: string;
  /** D-769：服务承诺。returnDays=0 表示不承诺；开关默认全关 */
  returnDays?: number;
  promiseInStock?: number | boolean;
  promiseAuthentic?: number | boolean;
  promiseExtra?: string | null;
    /** 详情页图片轮播：自动播放开关 + 间隔（秒 → 后端毫秒） */
    carouselAutoplay?: number | boolean;
    carouselIntervalMs?: number;
  }): Promise<void> => {
    await unwrapApiData<void>(await api.post('/shop/admin/config', body), '保存店铺配置失败');
  },

  /** 上架/下架款式 */
  setListing: async (styleId: number | string, listed: boolean): Promise<void> => {
    await unwrapApiData<void>(
      await api.post(`/shop/admin/listing/${styleId}?listed=${listed}`),
      listed ? '上架失败' : '下架失败',
    );
  },

  /** 店铺订单分页（含每单首件商品摘要 firstItems 与电子小票签收状态 signInfos） */
  orders: async (params: { page?: number; pageSize?: number; status?: string; keyword?: string }): Promise<ShopOrderPage> =>
    unwrapApiData<ShopOrderPage>(
      await api.post('/shop/admin/orders', params),
      '加载店铺订单失败',
    ),

  /** 订单发货（待发货 → 已发货；快递公司与单号选填，自提/同城配送可不填） */
  shipOrder: async (orderId: string, body?: { expressCompany?: string; expressNo?: string }): Promise<void> => {
    await unwrapApiData<void>(
      await api.post(`/shop/admin/orders/${orderId}/ship`, body ?? {}),
      '发货失败',
    );
  },

  /** 批量发货（逐条独立，返回成功数与被跳过原因） */
  batchShipOrders: async (orderIds: string[], body?: { expressCompany?: string; expressNo?: string }): Promise<BatchShipResult> =>
    unwrapApiData<BatchShipResult>(
      await api.post('/shop/admin/orders/batch-ship', {
        orderIds,
        expressCompany: body?.expressCompany,
        expressNo: body?.expressNo,
      }),
      '批量发货失败',
    ),

  /** 订单详情（订单头 + 商品明细） */
  orderDetail: async (orderId: string): Promise<ShopOrderDetail> =>
    unwrapApiData<ShopOrderDetail>(
      await api.post(`/shop/admin/orders/${orderId}/detail`, {}),
      '加载订单详情失败',
    ),

  /** 取消订单（仅待发货；会回补库存并撤销挂账应收） */
  cancelOrder: async (orderId: string, reason?: string): Promise<void> => {
    await unwrapApiData<void>(
      await api.post(`/shop/admin/orders/${orderId}/cancel`, { reason }),
      '取消订单失败',
    );
  },

  /** 商家备注（买家不可见） */
  updateOrderRemark: async (orderId: string, remark: string): Promise<void> => {
    await unwrapApiData<void>(
      await api.post(`/shop/admin/orders/${orderId}/remark`, { remark }),
      '保存备注失败',
    );
  },

  /** 订单概览统计 */
  orderStats: async (): Promise<ShopOrderStats> =>
    unwrapApiData<ShopOrderStats>(await api.get('/shop/admin/orders/stats'), '加载订单统计失败'),

  /** 登记售后（仅已发货订单；type: REFUND_ONLY 仅退款 / RETURN_REFUND 退货退款） */
  applyAfterSale: async (orderId: string, type: 'REFUND_ONLY' | 'RETURN_REFUND', reason?: string): Promise<void> => {
    await unwrapApiData<void>(
      await api.post(`/shop/admin/orders/${orderId}/after-sale/apply`, { type, reason }),
      '登记售后失败',
    );
  },

  /** 同意售后（退货退款会回补库存；未收款应收自动撤销；返回处理说明） */
  approveAfterSale: async (orderId: string, remark?: string): Promise<{ restoredItems: number; message: string }> =>
    unwrapApiData<{ restoredItems: number; message: string }>(
      await api.post(`/shop/admin/orders/${orderId}/after-sale/approve`, { remark }),
      '处理售后失败',
    ),

  /** 拒绝售后 */
  rejectAfterSale: async (orderId: string, remark?: string): Promise<void> => {
    await unwrapApiData<void>(
      await api.post(`/shop/admin/orders/${orderId}/after-sale/reject`, { remark }),
      '拒绝售后失败',
    );
  },

  /** 款式维度 SKU 聚合：售价区间 / 可售总量 / 颜色数（列表展示用，避免逐行 N+1） */
  skuSummary: async (styleIds: Array<number | string>): Promise<{ items: Record<string, ShopSkuSummary> }> =>
    unwrapApiData<{ items: Record<string, ShopSkuSummary> }>(
      await api.post('/shop/admin/sku/summary', { styleIds }),
      '加载 SKU 汇总失败',
    ),

  /** 批量保存 SKU 售价 + 库存（库存为「目标值」，服务端换算增减量并留操作日志） */
  /**
   * D-769：跨款式批量调价。
   * 必须先 dryRun=true 试算、确认后再 dryRun=false 执行——
   * 直接执行一旦出错只能靠反查日志回滚。
   */
  batchAdjustPrice: async (body: {
    styleIds: Array<number | string>;
    mode: BatchPriceMode;
    value: number;
    dryRun: boolean;
  }): Promise<BatchPricePreview> =>
    unwrapApiData<BatchPricePreview>(
      await api.post('/shop/admin/sku/batch-adjust-price', body),
      '批量调价失败',
    ),
  /** D-770：可选模块定义（哪些不可隐藏由后端裁决） */
  layoutModules: async (): Promise<LayoutModuleDef[]> =>
    unwrapApiData<LayoutModuleDef[]>(
      await api.get('/shop/admin/layout-modules'),
      '加载详情模块失败',
    ),
  /** D-770：读某款式的详情页布局（无记录返回默认） */
  getStyleLayout: async (styleId: number | string): Promise<StyleLayoutItem[]> =>
    unwrapApiData<StyleLayoutItem[]>(
      await api.get(`/shop/admin/layout/${styleId}`),
      '加载详情布局失败',
    ),
  /** D-770：保存详情页布局（模块开关 + 上到下顺序） */
  saveStyleLayout: async (
    styleId: number | string,
    body: { modules: Array<{ moduleKey: string; enabled: number; sortOrder: number }> },
  ): Promise<{ saved: number }> =>
    unwrapApiData<{ saved: number }>(
      await api.post(`/shop/admin/layout/${styleId}`, body),
      '保存详情布局失败',
    ),
  batchSaveSku: async (styleId: number | string, items: BatchSaveSkuItem[]): Promise<BatchSaveSkuResult> =>
    unwrapApiData<BatchSaveSkuResult>(
      await api.post('/shop/admin/sku/batch-save', { styleId, items }),
      '保存 SKU 失败',
    ),
  /** D-837：实际仓库库存（只读）——按入库明细聚合合格数量，与可售库存（虚拟）区分 */
  skuWarehouseStock: async (styleId: number | string): Promise<SkuWarehouseStockItem[]> =>
    unwrapApiData<SkuWarehouseStockItem[]>(
      await api.get('/shop/admin/sku/warehouse-stock', { params: { styleId } }),
      '加载实际仓库库存失败',
    ),

  /* ── P2：商品评价（商家侧） ── */

  /** 本店铺评价分页（可按款号 / 星级过滤） */
  reviews: async (params: { page?: number; pageSize?: number; styleNo?: string; rating?: number }): Promise<{ records: ShopReviewRow[]; total: number }> =>
    unwrapApiData<{ records: ShopReviewRow[]; total: number }>(
      await api.get('/shop/admin/reviews', { params }),
      '加载评价失败',
    ),

  /** 本店铺评价概览（均分 / 总数 / 各星级分布） */
  reviewSummary: async (): Promise<ShopReviewSummary> =>
    unwrapApiData<ShopReviewSummary>(
      await api.get('/shop/admin/reviews/summary'),
      '加载评价概览失败',
    ),
};

/** P2：商家侧评价行 */
export interface ShopReviewRow {
  id: string;
  orderNo: string;
  styleNo?: string | null;
  rating: number;
  content?: string | null;
  anonymous: boolean;
  createTime: string;
}

/** P2：商家侧评价概览 */
export interface ShopReviewSummary {
  total: number;
  avgRating: number;
  distribution: Record<string, number>;
}

/**
 * 店铺商品编辑依赖的「款式 / SKU」接口（系统既有能力，非店铺专属）。
 * D-768：单独成组，避免与 /shop/admin/** 混淆。
 */
export const shopProductApi = {
  /** 款式列表（keyword 对 款号/款名/品类 做 OR 模糊匹配；勿同时传 styleName+styleNo） */
  listStyles: async (params: { keyword?: string; page?: number; pageSize?: number }): Promise<{ records: ShopStyleInfoRow[]; total: number }> =>
    unwrapApiData<{ records: ShopStyleInfoRow[]; total: number }>(
      await api.get('/style/info/list', { params }),
      '加载款式列表失败',
    ),

  /** 款式详情（取 cover / remark 等） */
  getStyle: async (id: number | string): Promise<ShopStyleInfoRow> =>
    unwrapApiData<ShopStyleInfoRow>(await api.get(`/style/info/${id}`), '加载款式详情失败'),

  /**
   * 保存款式字段（主图 / 商品说明 / 详情页三块内容）。
   * 后端 PUT /style/info 走 MyBatis-Plus 局部更新：只提交改动过的字段即可。
   */
  updateStyle: async (body: {
    id: number | string;
    cover?: string | null;
    remark?: string | null;
    fabricComposition?: string | null;
    washInstructions?: string | null;
    description?: string | null;
    category?: string | null;
  }): Promise<void> => {
    await unwrapApiData<void>(await api.put('/style/info', body), '保存款式失败');
  },

  /** 某款式全部 SKU */
  searchSkus: async (styleId: number | string): Promise<ShopStyleSku[]> =>
    unwrapApiData<ShopStyleSku[]>(
      await api.post('/style/sku/search', { styleId }),
      '加载 SKU 失败',
    ),

  /** 某款号的颜色 → 图片映射 */
  listColorImages: async (styleNo: string): Promise<Record<string, string>> =>
    unwrapApiData<Record<string, string>>(
      await api.get(`/style/sku/color-images/${encodeURIComponent(styleNo)}`),
      '加载颜色图片失败',
    ),

  /** 保存颜色 → 图片映射 */
  saveColorImages: async (styleId: number | string, map: Record<string, string>): Promise<void> => {
    await unwrapApiData<void>(
      await api.put(`/style/sku/color-images/${styleId}`, map),
      '保存颜色图片失败',
    );
  },
};

/** /style/info/list 返回的行（只声明店铺运营用到的字段） */
export interface ShopCategoryOption {
  /** 规范代码（存库用） */
  category: string;
  /** 中文名（展示用） */
  name: string;
  cnt?: number;
}

export interface ShopStyleInfoRow {
  /** D-800：主图组 JSON 字符串（最多 5 张，第 1 张即 cover） */
  coverGroup?: string | null;
  id: number;
  styleNo?: string;
  styleName?: string;
  cover?: string | null;
  remark?: string | null;
  salesPrice?: number | null;
  tagPrice?: number | null;
  shopListed?: number;
  shopListingTime?: string | null;
  /* 顾客端详情页「商品参数 / 洗涤说明 / 款式详情」三块的内容源。
     此前这三块在顾客端有渲染、在**上架编辑页却没有入口**，
     商家只能跑去「款式资料」那个给生产车间用的大表单里填。 */
  fabricComposition?: string | null;
  washInstructions?: string | null;
  description?: string | null;
  /** 商品分类（自由文本字段，老数据有 WOMAN/上衣 混着存；上架页提供词表下拉统一口径） */
  category?: string | null;
}

/**
 * P0：平台级商城只读总览（仅平台超管可见）。
 *
 * <p>资金各租户直收、平台不抽成，故这里**只做展示**：全站店铺、在架商品、
 * 注册用户、订单计数与最近订单，供平台方掌握全站情况。
 */
export interface PlatformShopCounters {
  shopCount: number;
  openShopCount: number;
  listedStyleCount: number;
  consumerCount: number;
  orderCount: number;
  orderAmount: number;
}

export interface PlatformShopRow {
  tenantId: number;
  slug: string;
  shopName: string;
  notice?: string | null;
  enabled: boolean;
  productCount: number;
}

export interface PlatformShopOrderRow {
  orderNo: string;
  tenantId: number;
  customerName: string;
  totalAmount: number;
  itemCount: number;
  status: string;
  createTime: string;
  shopName?: string | null;
  slug?: string | null;
}

export interface PlatformShopOverview {
  counters: PlatformShopCounters;
  shops: PlatformShopRow[];
  recentOrders: PlatformShopOrderRow[];
}

/** P2：平台全站在架商品行（跨租户只读） */
export interface PlatformShopProductRow {
  styleId: number;
  tenantId: number;
  styleNo?: string | null;
  styleName?: string | null;
  category?: string | null;
  /** 中文类目（后端用类目词表归一，老数据里的 WOMAN/上衣 会归到同一个中文名） */
  categoryName?: string | null;
  /** 1=在架 0=已下架（平台治理列表含已下架，否则下架后就没法恢复） */
  shopListed?: number;
  cover?: string | null;
  shopName?: string | null;
  slug?: string | null;
  minPrice?: number | null;
  totalStock?: number;
  colorCount?: number;
  rating?: number | null;
  reviewCount?: number;
}

export const platformShopApi = {
  /**
   * 平台总览（仅平台超管；非超管后端返回 code=403）。
   *
   * 注意返回的是 Result 信封（api 客户端不因业务 code≠200 抛错），
   * 调用方必须用 unwrapApiData 取 data，否则失败也会被当成成功。
   */
  overview: async (): Promise<PlatformShopOverview> =>
    unwrapApiData<PlatformShopOverview>(
      await api.get('/shop/admin/platform/overview'),
      '加载平台总览失败',
    ),

  /**
   * 平台全站商品（跨租户，仅平台超管）。
   *
   * listedOnly：不传=全部 / true=只看在架 / false=只看已下架。
   */
  products: async (params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    listedOnly?: boolean;
  }): Promise<{ records: PlatformShopProductRow[]; total: number }> =>
    unwrapApiData<{ records: PlatformShopProductRow[]; total: number }>(
      await api.get('/shop/admin/platform/products', { params }),
      '加载全站商品失败',
    ),

  /**
   * 平台一键下架（跨租户，仅平台超管）。
   *
   * 必须填原因：原因会随通知发给商家。不告诉商家为什么，商家只会反复重新上架。
   */
  takedown: async (styleId: number, reason: string): Promise<void> => {
    await unwrapApiData<void>(
      await api.post('/shop/admin/platform/listing/takedown', { styleId, reason }),
      '下架失败',
    );
  },

  /** 平台恢复上架（下架必须可逆，否则等于平台能一键把别人的生意做没） */
  relist: async (styleId: number): Promise<void> => {
    await unwrapApiData<void>(
      await api.post('/shop/admin/platform/listing/relist', { styleId }),
      '恢复上架失败',
    );
  },
};

export default shopAdminApi;
