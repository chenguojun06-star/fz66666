import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * shopApi 解包契约（D-818 第 6 批）
 *
 * <p>本批最严重的问题出现在**批量调价**：`setPreview(信封)` 之后，
 * `preview.items` → undefined、`preview.styleCount` → undefined，
 * 试算表格空白、确认按钮显示「执行 undefined 款 / undefined 个 SKU」。
 * 调价是直接改售价的动作，试算看不见影响却还能点执行 —— 这类
 * 「界面看起来正常、数字全是空的」问题比报错危险得多。
 */
const mockHttp = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/utils/api', async () => {
  const actual = await vi.importActual<typeof import('../../utils/api/core/helpers')>(
    '../../utils/api/core/helpers',
  );
  return { default: mockHttp, unwrapApiData: actual.unwrapApiData };
});

import shopAdminApi, { shopProductApi, platformShopApi } from '../../services/shop/shopApi';

describe('店铺看板 / 配置 / 订单', () => {
  beforeEach(() => vi.clearAllMocks());

  it('dashboardDaily 返回裸看板，records/summary 可直接读', async () => {
    mockHttp.get.mockResolvedValue({
      code: 200,
      data: { records: [{ date: '2026-10-19', orderCount: 3 }], summary: [{ label: '近30天', days: 30 }] },
    });
    const out = await shopAdminApi.dashboardDaily(30);
    expect(out.records).toHaveLength(1);
    expect(out.summary[0].days).toBe(30);
  });

  it('getConfig 返回裸配置（含服务承诺字段）', async () => {
    mockHttp.get.mockResolvedValue({
      code: 200,
      data: { id: 's1', slug: 't1', shopName: '测试店', returnDays: 7, promiseInStock: 1 },
    });
    const cfg = await shopAdminApi.getConfig();
    expect(cfg.shopName).toBe('测试店');
    expect(cfg.returnDays).toBe(7);
    expect(cfg).not.toHaveProperty('code');
  });

  it('orders 返回分页对象；orderStats 返回裸统计', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: { records: [{ id: 'o1' }], total: 1, current: 1, pages: 1 } });
    mockHttp.get.mockResolvedValue({ code: 200, data: { pendingShip: 2, todayOrders: 1 } });
    const page = await shopAdminApi.orders({ page: 1 });
    const stats = await shopAdminApi.orderStats();
    expect(page.records).toHaveLength(1);
    expect(stats.pendingShip).toBe(2);
  });

  it('saveConfig / shipOrder / setListing 失败必须抛错（不能假成功）', async () => {
    mockHttp.post
      .mockResolvedValueOnce({ code: 400, message: '店铺名称不能为空' })
      .mockResolvedValueOnce({ code: 409, message: '订单已发货' })
      .mockResolvedValueOnce({ code: 403, message: '无上下架权限' });

    await expect(shopAdminApi.saveConfig({ shopName: '' })).rejects.toThrow('店铺名称不能为空');
    await expect(shopAdminApi.shipOrder('o1')).rejects.toThrow('订单已发货');
    await expect(shopAdminApi.setListing(1, true)).rejects.toThrow('无上下架权限');
  });

  it('orderDetail 返回 {order, items} 裸对象', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: { order: { id: 'o1' }, items: [{ id: 'i1' }] } });
    const d = await shopAdminApi.orderDetail('o1');
    expect(d.order.id).toBe('o1');
    expect(d.items).toHaveLength(1);
  });
});

describe('批量调价（此前试算表格全空）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('batchAdjustPrice 返回裸 BatchPricePreview —— items/styleCount/skuCount 可直接读', async () => {
    mockHttp.post.mockResolvedValue({
      code: 200,
      data: {
        items: [{ styleId: 1, skuCount: 3, becomesLoss: true, costKnown: true }],
        styleCount: 1,
        skuCount: 3,
        lossCount: 1,
        dryRun: true,
      },
    });
    const preview = await shopAdminApi.batchAdjustPrice({
      styleIds: [1], mode: 'PERCENT_ADJUST', value: 10, dryRun: true,
    });
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0].becomesLoss).toBe(true);
    expect(preview.styleCount).toBe(1);
    expect(preview).not.toHaveProperty('code');
  });
});

describe('详情布局 / SKU', () => {
  beforeEach(() => vi.clearAllMocks());

  it('layoutModules / getStyleLayout 返回裸数组', async () => {
    mockHttp.get
      .mockResolvedValueOnce({ code: 200, data: [{ moduleKey: 'gallery', defaultTitle: '图片轮播', canHide: false }] })
      .mockResolvedValueOnce({ code: 200, data: [{ moduleKey: 'gallery', enabled: 1, sortOrder: 0 }] });

    const defs = await shopAdminApi.layoutModules();
    const layout = await shopAdminApi.getStyleLayout(147);
    expect(Array.isArray(defs)).toBe(true);
    expect(Array.isArray(layout)).toBe(true);
    expect(layout[0].enabled).toBe(1);
  });

  it('skuSummary 返回 { items } 裸对象', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: { items: { '1': { minPrice: 99 } } } });
    const out = await shopAdminApi.skuSummary([1]);
    expect(out.items['1'].minPrice).toBe(99);
  });

  it('batchSaveSku 返回真实库存回显', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: { priceChanged: 1, stockChanged: 2, stockAfter: { '9': 5 } } });
    const out = await shopAdminApi.batchSaveSku(1, [{ skuId: 9, stockQuantity: 5 }]);
    expect(out.stockAfter['9']).toBe(5);
  });

  it('shopProductApi.listStyles 返回 { records, total }；updateStyle 失败抛错', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { records: [{ id: 1, styleNo: 'FZ001' }], total: 1 } });
    mockHttp.put.mockResolvedValue({ code: 500, message: '保存失败' });

    const page = await shopProductApi.listStyles({ page: 1 });
    expect(page.total).toBe(1);
    await expect(shopProductApi.updateStyle({ id: 1, cover: null })).rejects.toThrow('保存失败');
  });
});

describe('评价 / 平台治理', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reviews / reviewSummary 返回裸数据', async () => {
    mockHttp.get
      .mockResolvedValueOnce({ code: 200, data: { records: [{ id: 'r1', rating: 5 }], total: 1 } })
      .mockResolvedValueOnce({ code: 200, data: { total: 1, avgRating: 5, distribution: { '5': 1 } } });

    const page = await shopAdminApi.reviews({ page: 1 });
    const summary = await shopAdminApi.reviewSummary();
    expect(page.records).toHaveLength(1);
    expect(summary.avgRating).toBe(5);
  });

  it('平台总览/商品返回裸对象；下架/恢复失败必须抛错', async () => {
    mockHttp.get
      .mockResolvedValueOnce({ code: 200, data: { counters: { shopCount: 2 }, shops: [], recentOrders: [] } })
      .mockResolvedValueOnce({ code: 200, data: { records: [{ styleId: 1 }], total: 1 } });
    mockHttp.post.mockResolvedValue({ code: 403, message: '仅平台超管可操作' });

    const overview = await platformShopApi.overview();
    const products = await platformShopApi.products({ page: 1 });
    expect(overview.counters.shopCount).toBe(2);
    expect(products.records).toHaveLength(1);
    await expect(platformShopApi.takedown(1, '违规')).rejects.toThrow('仅平台超管可操作');
  });
});