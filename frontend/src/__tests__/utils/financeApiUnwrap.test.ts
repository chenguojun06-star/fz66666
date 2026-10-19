import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * finance service 解包契约（D-817 信封清理 · 第 5 批）
 *
 * <p>本批修掉一个**静默的金额错误**：EC 销售收入页把 summary 的信封
 * 直接 `as unknown as EcRevenueSummary`，所以所有金额字段都是 undefined ——
 * 页面不报错、不空白，只是把「待核账/已核账/已入账」显示成空。
 * 财务看板上的错误数字比白屏更危险，因为没人会怀疑它。
 *
 * <p>invoice / payable / taxConfig 的列表调用方过去靠 `(data as any)?.records`
 * 两栖兼容，tsc 完全看不见这类错误 —— 本批全部收紧到类型化裸数据。
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

import { ecSalesRevenueApi } from '../../services/finance/ecSalesRevenueApi';
import invoiceApi from '../../services/finance/invoiceApi';
import payableApi from '../../services/finance/payableApi';
import taxConfigApi from '../../services/finance/taxConfigApi';
import { accountingVoucherApi } from '../../services/finance/accountingVoucherApi';

describe('EC 销售收入（财务金额，必须裸数据）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('summary 返回裸汇总 —— 金额字段可直接读（此前信封强转导致全是 undefined）', async () => {
    mockHttp.post.mockResolvedValue({
      code: 200,
      data: { pendingAmount: 1200, confirmedAmount: 800, reconciledAmount: 400 },
    });
    const out = await ecSalesRevenueApi.summary();
    expect(out).toMatchObject({ pendingAmount: 1200, confirmedAmount: 800, reconciledAmount: 400 });
    expect(out).not.toHaveProperty('code');
  });

  it('list 返回分页对象，records/total 直接可读', async () => {
    mockHttp.post.mockResolvedValue({
      code: 200,
      data: { records: [{ id: 1 }], total: 1, current: 1, size: 20 },
    });
    const out = await ecSalesRevenueApi.list({ page: 1 });
    expect(out.records).toHaveLength(1);
    expect(out.total).toBe(1);
  });

  it('失败信封抛错（金额页不能静默显示 0）', async () => {
    mockHttp.post.mockResolvedValue({ code: 500, message: '汇总服务异常' });
    await expect(ecSalesRevenueApi.summary()).rejects.toThrow('汇总服务异常');
  });
});

describe('发票 / 应付 / 税率', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invoice.list 返回 records/total（调用方不再 as any）', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: { records: [{ id: 'i1' }], total: 1 } });
    const out = await invoiceApi.list({ page: 1 });
    expect(out.records).toHaveLength(1);
  });

  it('invoice.issue 成功 void，失败抛错', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: null });
    await expect(invoiceApi.issue('i1')).resolves.toBeUndefined();
    mockHttp.post.mockResolvedValue({ code: 409, message: '只有草稿可开票' });
    await expect(invoiceApi.issue('i1')).rejects.toThrow('只有草稿可开票');
  });

  it('payable.list 返回分页对象；stats 返回裸统计', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: { records: [{ id: 'p1' }], total: 1 } });
    mockHttp.get.mockResolvedValue({ code: 200, data: { pendingAmount: 500 } });
    const list = await payableApi.list({ page: 1 });
    const stats = await payableApi.stats();
    expect(list.records).toHaveLength(1);
    expect(stats.pendingAmount).toBe(500);
  });

  it('payable.markPaid 失败必须抛错（财务动作不能假成功）', async () => {
    mockHttp.post.mockResolvedValue({ code: 400, message: '已结清，请勿重复付款' });
    await expect(payableApi.markPaid('p1')).rejects.toThrow('已结清，请勿重复付款');
  });

  it('taxConfig.list 返回裸数组', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: [{ id: 't1', taxRate: 0.13 }] });
    const out = await taxConfigApi.list();
    expect(Array.isArray(out)).toBe(true);
    expect(out[0].taxRate).toBe(0.13);
  });
});

describe('会计凭证', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listVouchers 返回裸数组，getVoucherDetail 返回 {voucher, entries}', async () => {
    mockHttp.get
      .mockResolvedValueOnce({ code: 200, data: [{ id: 1 }] })
      .mockResolvedValueOnce({ code: 200, data: { voucher: { id: 1 }, entries: [{ id: 2 }] } });

    const list = await accountingVoucherApi.listVouchers();
    const detail = await accountingVoucherApi.getVoucherDetail(1);
    expect(list).toHaveLength(1);
    expect(detail.entries).toHaveLength(1);
  });

  it('backfillVouchers 返回新生成张数（不是信封）', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: 7 });
    await expect(accountingVoucherApi.backfillVouchers()).resolves.toBe(7);
  });
});