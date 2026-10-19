import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * sysNoticeApi 解包契约（D-817 信封清理 · 第 1 批）
 *
 * <p>这批把 `getMyNotices` / `getUnreadCount` 从"返回信封"改成"返回裸数据"，
 * 调用方 `useAlertData` 同步去掉 `as Promise<any>` + `?.data`。
 *
 * <p>为什么单独钉住：`useAlertData` 原来用 `as Promise<any>` 迁就信封，
 * 代价是**整条链路丢掉类型** —— 拼错字段名（如 `notices` 写成 `notice`）
 * 要等运行时才发现。改成裸数据后类型重新生效，这条链路的编译错误能挡住。
 *
 * <p>同时验证 `unwrapApiData` 的幂等性在这里也成立：
 * 即便某个调用方仍多包一层，也不会恒抛异常导致通知铃静默为空。
 */
const mockHttp = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

// 复用真实的 unwrapApiData（它现在是幂等的），
// 只替换底层 http —— 这样测的是真实链路而不是替实现重写一遍
vi.mock('@/utils/api', async () => {
  const actual = await vi.importActual<typeof import('../../utils/api/core/helpers')>(
    '../../utils/api/core/helpers',
  );
  return { default: mockHttp, unwrapApiData: actual.unwrapApiData };
});

import { sysNoticeApi } from '../../services/production/productionApi';

describe('sysNoticeApi 解包（D-817 第 1 批）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getMyNotices 返回裸数组，不是信封（信封会让通知铃 setState 收到对象）', async () => {
    const notice = { id: 1, title: '跟单提醒', isRead: false };
    mockHttp.get.mockResolvedValue({ code: 200, data: [notice] });

    const out = await sysNoticeApi.getMyNotices();
    expect(Array.isArray(out)).toBe(true);
    expect(out).toEqual([notice]);
  });

  it('getUnreadCount 直接返回数字，调用方不再读 .data.count', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: { count: 7 } });
    await expect(sysNoticeApi.getUnreadCount()).resolves.toBe(7);
  });

  it('失败信封必须抛错（通知铃据此标记为 failed，不能静默当 0）', async () => {
    mockHttp.get.mockResolvedValue({ code: 500, message: '通知服务异常' });
    await expect(sysNoticeApi.getMyNotices()).rejects.toThrow('通知服务异常');
    await expect(sysNoticeApi.getUnreadCount()).rejects.toThrow('通知服务异常');
  });

  it('空列表返回空数组而不是 undefined（setState 收到 undefined 会渲染出空壳）', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: [] });
    const out = await sysNoticeApi.getMyNotices();
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(0);
  });
});