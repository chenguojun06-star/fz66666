import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * customerApi / receivableApi 解包契约（D-817 信封清理 · 第 2 批）
 *
 * <p>CrmDashboard 曾靠两栖写法迁就信封：`const data = (res?.data ?? res)`。
 * 这种写法的问题：service 返回什么它都"能跑"，类型形同虚设 ——
 * 把 `records` 拼错也编译通过，运行时候表空着。
 * 本批 service 改回**裸数据**，调用方的 `(res?.data ?? res)` 猜测一并删除。
 *
 * <p>测试 mock 底层 http、复用真实 `unwrapApiData`：
 * mock 什么形状本身就是测试的一部分 —— 若把解包器也 mock 成吐裸数据，
 * 等于替实现"说好话"，什么都验证不了。
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
  customerApi,
  receivableApi,
  type CustomerStats,
} from '../../services/crm/customerApi';

describe('customerApi 解包（D-817 第 2 批）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list 直接返回分页对象 —— 调用方读 records/total，不再 (res?.data ?? res) 猜', async () => {
    const page = { records: [{ id: '1', companyName: '客户A' }], total: 1, current: 1, size: 20 };
    mockHttp.post.mockResolvedValue({ code: 200, data: page });

    const out = await customerApi.list({ page: 1, pageSize: 20 });
    expect(out).not.toHaveProperty('code');
    expect(out.records).toEqual(page.records);
    expect(out.total).toBe(1);
  });

  it('getStats 返回裸统计（levelOne 等后端扩展字段原样保留）', async () => {
    mockHttp.get.mockResolvedValue({
      code: 200,
      data: { total: 10, activeCount: 8, newThisMonth: 2, levelOne: 3 },
    });

    const out = await customerApi.getStats();
    expect((out as CustomerStats & { levelOne?: number }).levelOne).toBe(3);
  });

  it('getById 返回单个客户对象', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { id: 'x', companyName: '客户X' } });
    const out = await customerApi.getById('x');
    expect(out.companyName).toBe('客户X');
  });

  it('失败信封抛错（列表页 catch 走 message.error，而不是渲染空表说"没数据"）', async () => {
    mockHttp.post.mockResolvedValue({ code: 500, message: '数据库忙' });
    await expect(customerApi.list({})).rejects.toThrow('数据库忙');
  });
});

describe('receivableApi 解包（D-817 第 2 批）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stats 返回裸统计对象', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { totalAmount: 1000 } });
    const out = await receivableApi.stats();
    expect(out).toEqual({ totalAmount: 1000 });
  });

  it('detail 返回 {receivable, receiptLogs} —— 调用方直接解构', async () => {
    mockHttp.get.mockResolvedValue({
      code: 200,
      data: { receivable: { id: 'r1' }, receiptLogs: [{ id: 'l1' }] },
    });
    const { receivable, receiptLogs } = await receivableApi.detail('r1');
    expect(receivable.id).toBe('r1');
    expect(receiptLogs).toHaveLength(1);
  });

  it('markReceived / delete 成功即 void，失败信封必须抛错', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: null });
    await expect(receivableApi.markReceived('r1', 100)).resolves.toBeUndefined();

    mockHttp.delete.mockResolvedValue({ code: 409, message: '已被收款，不可删除' });
    await expect(receivableApi.delete('r1')).rejects.toThrow('已被收款，不可删除');
  });
});