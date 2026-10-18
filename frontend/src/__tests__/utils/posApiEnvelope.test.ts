import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * D-817：posApi 必须在 service 层解包 {code,data} 信封。
 *
 * <p><b>这个测试是被线上白屏逼出来的。</b>
 *
 * <p>事故经过：`api.get` 的响应拦截器 `return response.data`，
 * 也就是说它返回的是 `{code, data, message}` **信封**，不是业务数据。
 * `posApi` 当时直接 `return api.get(...)`，把信封原样交给调用方；
 * 三个新面板（挂单 / 退货 / 交接班）都把信封当数组塞给 antd Table，
 * 线上直接 `TypeError: dataSource.some is not a function` 整页白屏。
 *
 * <p>为什么单测没拦住：测试 `vi.mock` 整个 posApi 模块，
 * mock 返回的是**已解包数组**，于是测试永远绿，线上永远炸。
 * 「mock 什么形状」本身就是测试的一部分 —— mock 成已解包，
 * 等于替实现说谎。
 *
 * <p>下面这个测试 mock 的是**底层 api 层**（返回信封），
 * 断言 posApi 吐出来的是裸数据 —— 这才是真实链路。
 */
const mockHttp = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/utils/api', () => ({
  default: mockHttp,
  api: mockHttp,
  unwrapApiData: <T,>(result: unknown, fallback: string): T => {
    if (
      typeof result === 'object' &&
      result !== null &&
      'code' in result &&
      Number((result as { code: unknown }).code) === 200
    ) {
      return (result as unknown as { data: T }).data;
    }
    throw new Error(fallback);
  },
}));

import { posApi } from '@/services/pos/posApi';

describe('posApi 信封解包（D-817 线上白屏回归）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('列表接口：信封 → 数组（直接给 Table 用就是白屏）', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: [{ holdNo: 'HLD001' }] });
    await expect(posApi.holds(false)).resolves.toEqual([{ holdNo: 'HLD001' }]);
  });

  it('班次列表同理', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: [{ shiftNo: 'SHF001' }] });
    await expect(posApi.shifts(30)).resolves.toEqual([{ shiftNo: 'SHF001' }]);
  });

  it('取回挂单：lines 必须真的取得到（取不到 = 顾客的东西直接消失）', async () => {
    mockHttp.post.mockResolvedValue({
      code: 200,
      data: { holdNo: 'HLD001', lines: [{ skuId: 1, quantity: 2 }], customerName: '王女士' },
    });
    const out = await posApi.resumeHold('HLD001');
    expect(out.lines).toHaveLength(1);
    expect(out.customerName).toBe('王女士');
  });

  it('开单结果能读到 saleNo（读不到就不知道单号，出问题无从追）', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: { saleNo: 'PS20261018001' } });
    await expect(posApi.checkout({ items: [], payMethod: 'CASH' })).resolves.toMatchObject({
      saleNo: 'PS20261018001',
    });
  });

  it('今日汇总能读到 summary', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { summary: { saleCount: 3 }, byPayMethod: [], recent: [] } });
    await expect(posApi.today()).resolves.toMatchObject({ summary: { saleCount: 3 } });
  });

  it('失败信封必须抛错，不能把信封当数据返回（否则就是静默空转）', async () => {
    mockHttp.get.mockResolvedValue({ code: 500, message: '钱箱未开班' });
    await expect(posApi.holds(false)).rejects.toThrow();
  });
});
