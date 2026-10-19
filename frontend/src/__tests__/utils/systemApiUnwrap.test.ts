import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * system 模块解包契约（D-821）
 *
 * 这一批把 factory / organization / supplierUser / roleTemplate /
 * fieldConfig / userPreference / announcement 七个 service 从信封改成裸数据。
 * 失败一律抛错 —— 此前 `if (res.code === 200)` 漏 else 的分支会把
 * "审核失败/删除失败/保存失败" 静默吞掉，用户看到的是操作成功。
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

import factoryApi from '../../services/system/factoryApi';
import { announcementApi } from '../../services/system/announcementApi';
import supplierUserApi from '../../services/system/supplierUserApi';
import { roleTemplateApi } from '../../services/system/roleTemplateApi';
import { fieldConfigApi } from '../../services/system/fieldConfigApi';
import { userPreferenceApi } from '../../services/system/userPreferenceApi';
import { organizationApi } from '../../services/system/organizationApi';

describe('system service 解包（D-821）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('factory.list 返回裸分页对象，调用方直接读 records/total', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { records: [{ id: 'f1', factoryName: '外发一厂' }], total: 1 } });
    const page = await factoryApi.list({ page: 1, pageSize: 20 });
    expect(page.records).toHaveLength(1);
    expect(page.total).toBe(1);
  });

  it('factory.approveAdmission 返回 boolean；失败必须抛错（不能假审核成功）', async () => {
    mockHttp.put.mockResolvedValue({ code: 200, data: true });
    await expect(factoryApi.approveAdmission('f1', 'approve')).resolves.toBe(true);

    mockHttp.put.mockResolvedValue({ code: 403, message: '无准入审核权限' });
    await expect(factoryApi.approveAdmission('f1', 'approve')).rejects.toThrow('无准入审核权限');
  });

  it('factory.delete 成功返回 void，失败抛错', async () => {
    mockHttp.delete.mockResolvedValue({ code: 200, message: 'ok' });
    await expect(factoryApi.delete('f1')).resolves.toBeUndefined();

    mockHttp.delete.mockResolvedValue({ code: 409, message: '该工厂存在在产订单' });
    await expect(factoryApi.delete('f1')).rejects.toThrow('该工厂存在在产订单');
  });

  it('announcement.getActive 返回裸数组（横幅不再读 res.data）', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: [{ id: 1, title: '系统维护' }] });
    const list = await announcementApi.getActive();
    expect(Array.isArray(list)).toBe(true);
    expect(list[0].title).toBe('系统维护');
  });

  it('supplierUser.list 返回裸数组；toggleStatus 失败抛错', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: [{ id: 'u1', username: 'sup01' }] });
    mockHttp.post.mockResolvedValue({ code: 400, message: '账号已停用' });

    const users = await supplierUserApi.list('s1');
    expect(users).toHaveLength(1);
    await expect(supplierUserApi.toggleStatus('u1')).rejects.toThrow('账号已停用');
  });

  it('roleTemplate.checkNewTenant / quickSetup 返回裸对象', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { isNewTenant: true, roleCount: 0, recommendedTemplates: [] } });
    mockHttp.post.mockResolvedValue({ code: 200, data: { createdCount: 2, createdRoleIds: [1, 2] } });

    const check = await roleTemplateApi.checkNewTenant();
    const setup = await roleTemplateApi.quickSetup([1, 2]);
    expect(check.isNewTenant).toBe(true);
    expect(setup.createdCount).toBe(2);
  });

  it('fieldConfig.list / saveBatch / delete 全部裸数据', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: [{ fieldKey: 'styleNo', enabled: 1 }] });
    mockHttp.put.mockResolvedValue({ code: 200, data: [{ fieldKey: 'styleNo', enabled: 1 }] });
    mockHttp.delete.mockResolvedValue({ code: 200, data: null });

    const rows = await fieldConfigApi.list('style');
    const saved = await fieldConfigApi.saveBatch({ bizType: 'style', fields: [] });
    await expect(fieldConfigApi.delete('style', 'styleNo')).resolves.toBeNull();
    expect(rows).toHaveLength(1);
    expect(saved).toHaveLength(1);
  });

  it('userPreference.list 返回裸数组（列显隐云同步不再读 res.data）', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: [{ pageKey: 'production-list', preferenceType: 'columns', preferenceValue: '{}' }] });
    const prefs = await userPreferenceApi.list('production-list');
    expect(Array.isArray(prefs)).toBe(true);
    expect(prefs[0].preferenceType).toBe('columns');
  });

  it('organization.members 返回裸映射；batchAssignMembers 返回数量', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { org1: [{ id: 'u1' }] } });
    mockHttp.post.mockResolvedValue({ code: 200, data: 3 });

    const members = await organizationApi.members();
    const count = await organizationApi.batchAssignMembers(['u1'], 'org1');
    expect(members.org1).toHaveLength(1);
    expect(count).toBe(3);
  });

  it('organization.tree 返回转换后的节点数组（不再兼容 res.data 两层）', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: [{ id: 'org1', nodeName: '总部', children: [] }] });
    const tree = await organizationApi.tree();
    expect(tree[0].unitName).toBe('总部');
  });

  it('organization.setManager 失败抛错 —— 此前无返回判断，失败也提示成功', async () => {
    mockHttp.post.mockResolvedValue({ code: 403, message: '仅所有者可设置负责人' });
    await expect(organizationApi.setManager('org1', 'u1')).rejects.toThrow('仅所有者可设置负责人');
  });
});
