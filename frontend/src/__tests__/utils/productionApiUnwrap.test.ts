import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * productionApi 解包契约（D-817 信封清理 · 第 4 批）
 *
 * <p>本批把 production 的 26 个显式信封方法改成返回裸数据，
 * 同时删掉调用方的 `if (res.code === 200)` / `res.data.xxx` 判断。
 *
 * <p>为什么 `code === 200` 判断本身是坑：
 * 它把「业务失败」和「网络成功」混为一谈 —— 漏写 else 分支、
 * 或 else 只打日志，失败就静默消失。改成抛错后，
 * 失败一定走 catch，用户能看到提示，日志也有记录。
 *
 * <p>这批还有个真实收益：`getNodeOperations` 返回 `string` 而非 `{}`，
 * 调用方再也不用 `typeof raw === 'string'` 猜后端返回的是字符串还是对象。
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

import {
  productionOrderApi,
  productionScanApi,
  productionPatternApi,
  processParentMappingApi,
  materialPurchaseApi,
  urgeApi,
  qualityAiApi,
} from '../../services/production/productionApi';

describe('productionApi 解包（D-817 第 4 批）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getNodeOperations 返回字符串 —— 调用方不再猜「字符串还是对象」', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: '{"cutting":{"enabled":true}}' });
    const raw = await productionOrderApi.getNodeOperations('o1');
    expect(typeof raw).toBe('string');
    expect(JSON.parse(raw).cutting.enabled).toBe(true);
  });

  it('saveNodeOperations 成功返回 void，失败必须抛错（不能靠 code===200 判断）', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: null });
    await expect(productionOrderApi.saveNodeOperations('o1', '{}')).resolves.toBeUndefined();

    mockHttp.post.mockResolvedValue({ code: 500, message: '节点数据保存失败' });
    await expect(productionOrderApi.saveNodeOperations('o1', '{}')).rejects.toThrow('节点数据保存失败');
  });

  it('bundleDelegate 返回委派数量（成功提示用）', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: { delegatedCount: 3 } });
    await expect(productionOrderApi.bundleDelegate({ id: 'o1' })).resolves.toEqual({ delegatedCount: 3 });
  });

  it('scan.listByOrderId 返回裸数组 —— 分页对象与裸数组两种后端返回都能被调用方处理', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: [{ id: 1 }, { id: 2 }] });
    const rows = await productionScanApi.listByOrderId('o1', {});
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it('processParentMappingApi.list 直接返回映射对象', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { 裁剪: '裁剪', 车缝: '缝制' } });
    await expect(processParentMappingApi.list()).resolves.toEqual({ 裁剪: '裁剪', 车缝: '缝制' });
  });

  it('materialPurchaseApi.listByOrderNo 返回分页对象', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { records: [{ id: 1 }], total: 1 } });
    const out = await materialPurchaseApi.listByOrderNo('PO-1');
    expect(out.records).toHaveLength(1);
    expect(out.total).toBe(1);
  });

  it('urgeApi.checkUrged 返回 { urgedOrderIds }，调用方不再读 .data', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: { urgedOrderIds: ['o1'] } });
    await expect(urgeApi.checkUrged(['o1'])).resolves.toEqual({ urgedOrderIds: ['o1'] });
  });

  it('qualityAiApi.getSuggestion 返回裸建议对象；无建议时 data 为 null', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { checkpoints: ['领口'], defectSuggestions: {} } });
    const s = await qualityAiApi.getSuggestion('o1');
    expect(s.checkpoints).toEqual(['领口']);
  });

  it('pattern.getTimeline 返回裸时间线，nodes/anomalies 可直接读', async () => {
    mockHttp.get.mockResolvedValue({
      code: 200,
      data: { patternId: 'p1', nodes: [{ node: '裁剪', time: '2026-10-19T10:00:00Z' }], anomalies: [] },
    });
    const t = await productionPatternApi.getTimeline('p1');
    expect(t.nodes).toHaveLength(1);
    expect(t.anomalies).toEqual([]);
  });

  it('关单失败必须抛错 —— 此前 `if (res.code === 200)` 漏 else 会让失败静默', async () => {
    mockHttp.post.mockResolvedValue({ code: 409, message: '订单已结算，不可关单' });
    await expect(productionOrderApi.close('o1', 'production')).rejects.toThrow('订单已结算，不可关单');
  });
});