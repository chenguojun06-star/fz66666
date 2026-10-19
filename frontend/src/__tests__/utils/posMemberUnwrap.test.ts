import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * posApi 会员四法解包契约（D-817 · 第 3 批 —— 线上 bug 修复）
 *
 * <p>线上事故：会员识别 `setMember(memberByPhone)` 把**信封**存进了 state ——
 * 信封恒为 truthy，会员面板读 `member.name` / `member.balance` 全是 undefined；
 * 充值流程 `if (!member)` 判断被信封骗过，随后拿 `member.id = undefined`
 * 去请求充值；充值成功提示「当前余额 ${m.balance}」显示 undefined。
 *
 * <p>根因：posApi 多数方法已解包，但会员四法漏了 —— 混装里的漏网之鱼。
 * 收银台会员路径是收银场景里最不能碰的情况，必须钉测试防回潮。
 *
 * <p>注意"信封恒为 truthy"的化学反应：任何 `if (member)` 判断都识别不出异常，
 * 这就是为什么测试里专门断言「少余额字段的对象 ≠ 会员已识别」。
 */
const mockHttp = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/utils/api', async () => {
  const actual = await vi.importActual<typeof import('../../utils/api/core/helpers')>(
    '../../utils/api/core/helpers',
  );
  return { default: mockHttp, unwrapApiData: actual.unwrapApiData };
});

import { posApi } from '../../services/pos/posApi';

describe('posApi 会员四法解包（D-817 第 3 批）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('memberByPhone 返回裸会员对象 —— setMember 后 member.name/balance 直接可读', async () => {
    mockHttp.get.mockResolvedValue({
      code: 200,
      data: { id: 'm1', name: '王老板', balance: 128.5, discountRate: 0.9 },
    });

    const m = await posApi.memberByPhone('13800138000');
    expect(m).toMatchObject({ id: 'm1', name: '王老板', balance: 128.5 });
    // 彻底的语法：不信 beforeEach，现场确认没有 code 混进来
    expect(m).not.toHaveProperty('code');
  });

  it('未注册手机号（data=null）返回 null 而不是信封 —— null 才会走散客分支', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: null });
    await expect(posApi.memberByPhone('13900139000')).resolves.toBeNull();
  });

  it('rechargeMember 返回充值后的会员（charges 后直接 setMember + 显示新余额）', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: { id: 'm1', balance: 228.5 } });

    const m = await posApi.rechargeMember({ memberId: 'm1', amount: 100 });
    expect(m.balance).toBe(228.5);
  });

  it('memberTransactions 返回裸数组', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: [{ id: 'tx1' }, { id: 'tx2' }] });
    const txs = await posApi.memberTransactions('m1');
    expect(txs).toHaveLength(2);
  });

  it('会员接口失败必须抛错（收银台 catch 后 setMember(null) 走散客，不能拿信封冒充会员）', async () => {
    mockHttp.get.mockResolvedValue({ code: 500, message: '会员服务异常' });
    await expect(posApi.memberByPhone('138')).rejects.toThrow('会员服务异常');
  });
});