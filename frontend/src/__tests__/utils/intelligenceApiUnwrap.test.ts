import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * intelligenceApi 解包契约（D-824）
 *
 * 96 个方法全部改裸数据：信封 → data；失败信封 → 抛错；
 * 已是裸值（getGuardrails 等原生 Map 接口）→ 幂等透传。
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

import { intelligenceApi } from '../../services/intelligence/intelligenceApi';

describe('intelligenceApi 解包（D-824）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getBrainSnapshot 返回裸快照；失败信封抛错', async () => {
    mockHttp.get.mockResolvedValueOnce({ code: 200, data: { summary: { healthGrade: 'A' } } });
    const snap = await intelligenceApi.getBrainSnapshot();
    expect(snap.summary.healthGrade).toBe('A');

    mockHttp.get.mockResolvedValueOnce({ code: 500, message: 'AI 服务暂不可用' });
    await expect(intelligenceApi.getBrainSnapshot()).rejects.toThrow('AI 服务暂不可用');
  });

  it('detectAnomalies 返回裸对象（此前调用方读 res.data 才拿得到）', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: { items: [{ id: 'a1', severity: 'critical' }] } });
    const res = await intelligenceApi.detectAnomalies();
    expect(res.items).toHaveLength(1);
    expect(res.items![0].severity).toBe('critical');
  });

  it('getDailyBriefing（.then 链改造）返回裸简报；data 缺失走 fallback', async () => {
    mockHttp.get.mockResolvedValueOnce({ code: 200, data: { summary: '今日正常' } });
    expect((await intelligenceApi.getDailyBriefing()).summary).toBe('今日正常');

    mockHttp.get.mockResolvedValueOnce({ code: 200, data: undefined });
    expect(await intelligenceApi.getDailyBriefing()).toEqual({});
  });

  it('getGuardrails 对原生 Map（无 code）幂等透传', async () => {
    mockHttp.get.mockResolvedValue({ rules: [{ id: 'r1' }] });
    const res = await intelligenceApi.getGuardrails();
    expect(res.rules).toHaveLength(1);
  });

  it('safeAdvisorAnalyze 泛型此前写成裸 {answer,source}，实际是信封 → 现在正确解包', async () => {
    mockHttp.post.mockResolvedValue({ code: 200, data: { answer: '建议先排产', source: 'safe-advisor' } });
    const res = await intelligenceApi.safeAdvisorAnalyze('怎么排产');
    expect(res.answer).toBe('建议先排产');
    expect(res.source).toBe('safe-advisor');
  });

  it('getProactiveInsights 返回裸数组；失败抛错', async () => {
    mockHttp.get.mockResolvedValueOnce({ code: 200, data: [{ id: 'i1', title: '面料缺口' }] });
    expect(await intelligenceApi.getProactiveInsights()).toHaveLength(1);

    mockHttp.get.mockResolvedValueOnce({ code: 500, message: '洞察服务异常' });
    await expect(intelligenceApi.getProactiveInsights()).rejects.toThrow('洞察服务异常');
  });

  it('approvePatrolAction（void 写操作）失败必须抛错，不再静默假成功', async () => {
    mockHttp.post.mockResolvedValueOnce({ code: 200, data: null });
    await expect(intelligenceApi.approvePatrolAction(1, '同意')).resolves.toBeUndefined();

    mockHttp.post.mockResolvedValueOnce({ code: 403, message: '无权审批该巡检项' });
    await expect(intelligenceApi.approvePatrolAction(1, '同意')).rejects.toThrow('无权审批该巡检项');
  });

  it('markProactiveInsightRead 成功返回 true，失败抛错', async () => {
    mockHttp.post.mockResolvedValueOnce({ code: 200, data: null });
    expect(await intelligenceApi.markProactiveInsightRead('i1')).toBe(true);

    mockHttp.post.mockResolvedValueOnce({ code: 404, message: '洞察不存在' });
    await expect(intelligenceApi.markProactiveInsightRead('i1')).rejects.toThrow('洞察不存在');
  });

  it('evolutionApprove 返回 data === true 的布尔语义', async () => {
    mockHttp.post.mockResolvedValueOnce({ code: 200, data: true });
    expect(await intelligenceApi.evolutionApprove('p1')).toBe(true);

    mockHttp.post.mockResolvedValueOnce({ code: 200, data: false });
    expect(await intelligenceApi.evolutionApprove('p1')).toBe(false);
  });

  it('getMyPendingTasks 返回裸数组（此前部分调用方自己做信封判断）', async () => {
    mockHttp.get.mockResolvedValue({ code: 200, data: [{ id: 't1', title: '裁剪待跟进' }] });
    const tasks = await intelligenceApi.getMyPendingTasks();
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks[0].title).toBe('裁剪待跟进');
  });
});
