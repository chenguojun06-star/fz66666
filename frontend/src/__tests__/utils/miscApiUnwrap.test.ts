import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * 杂项 service 解包契约（D-822）
 *
 * crm 客户账号/租户设置、tenantApp、templateLibrary、payment、
 * systemStatus、style 各 service 统一改裸数据。失败抛错。
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

import customerUserApi from '../../services/crm/customerUserApi';
import tenantSettingApi from '../../services/crm/tenantSettingApi';
import { receivableApi } from '../../services/crm/customerApi';
import tenantAppService from '../../services/tenantAppService';
import { templateLibraryApi } from '../../services/template/templateLibraryApi';
import paymentApi from '../../services/payment/paymentApi';
import systemStatusService, { systemIssueApi, frontendErrorApi } from '../../services/systemStatusService';
import { styleProcessApi, getStyleInfoByRef } from '../../services/style/styleApi';

describe('杂项 service 解包（D-822）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('customerUser.list 返回裸数组；重置密码失败抛错', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: [{ id: 'u1', username: 'cust01' }] });
    mockHttp.post.mockResolvedValue({ code: 400, message: '客户账号已停用' });

    const users = await customerUserApi.list('c1');
    expect(users).toHaveLength(1);
    await expect(customerUserApi.resetPassword('u1', 'x')).rejects.toThrow('客户账号已停用');
  });

  it('tenantSetting.get 返回裸设置对象', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { paymentTermDays: 45 } });
    const settings = await tenantSettingApi.get();
    expect(settings.paymentTermDays).toBe(45);
  });

  it('receivableApi.list 返回裸分页对象（此前把 PageResult 当信封直接 return）', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: { records: [{ id: 'r1' }], total: 1, current: 1, size: 20 } });
    const page = await receivableApi.list({ page: 1 });
    expect(page.records).toHaveLength(1);
    expect(page.total).toBe(1);
  });

  it('tenantApp.listApps 返回裸分页（records 可直接读）', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: { records: [{ id: 'a1', appName: '旺店通对接' }], total: 1 } });
    const page = await tenantAppService.listApps({ page: 1 });
    expect(page.records[0].appName).toBe('旺店通对接');
  });

  it('tenantApp.deleteApp 失败抛错（不能假删除）', async () => {
    mockHttp.delete.mockResolvedValue({ code: 409, message: '应用存在调用记录，不可删除' });
    await expect(tenantAppService.deleteApp('a1')).rejects.toThrow('应用存在调用记录，不可删除');
  });

  it('templateLibrary.progressNodeUnitPrices 返回裸数组（调用方不再读 res.data）', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: [{ name: '裁剪', unitPrice: 1.2 }] });
    const rows = await templateLibraryApi.progressNodeUnitPrices('S001');
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it('paymentApi.status 返回裸配置；verify 返回 {ok,message}', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { channels: [], anyReady: false, tenantId: 1 } });
    mockHttp.post.mockResolvedValue({ code: 200, data: { ok: true, message: '鉴权通过' } });

    const status = await paymentApi.status();
    const verify = await paymentApi.verify('WECHAT_PAY');
    expect(status.channels).toEqual([]);
    expect(verify.ok).toBe(true);
  });

  it('systemStatus.overview / collect / recent 返回裸对象与数组', async () => {
    mockHttp.get
      .mockResolvedValueOnce({ code: 200, data: { applicationName: 'fashion-mes', uptimeMs: 1 } })
      .mockResolvedValueOnce({ code: 200, data: { errorCount: 0, warnCount: 1, infoCount: 0, totalCount: 1, checkedAt: '', issues: [] } })
      .mockResolvedValueOnce({ code: 200, data: [{ type: 'error', message: 'x' }] });

    const overview = await systemStatusService.overview();
    const summary = await systemIssueApi.collect();
    const errors = await frontendErrorApi.recent(10);
    expect(overview.applicationName).toBe('fashion-mes');
    expect(summary.warnCount).toBe(1);
    expect(errors).toHaveLength(1);
  });

  it('styleProcessApi.listByStyleId 返回裸数组', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: [{ id: 'p1', processName: '车缝' }] });
    const list = await styleProcessApi.listByStyleId('s1');
    expect(list).toHaveLength(1);
  });

  it('getStyleInfoByRef 兼容信封与裸数据，查不到返回 null 不抛错', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { records: [{ id: 's1', styleNo: 'S001' }] } });
    const style = await getStyleInfoByRef('S001');
    expect(style?.styleNo).toBe('S001');

    mockHttp.get.mockResolvedValue({ code: 404, message: '款式不存在' });
    const missing = await getStyleInfoByRef('NOPE');
    expect(missing).toBeNull();
  });
});
