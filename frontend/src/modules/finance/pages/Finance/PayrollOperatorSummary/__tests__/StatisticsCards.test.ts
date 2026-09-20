import { describe, it, expect } from 'vitest';
import { filterRowsByStatus } from '../StatisticsCards';

/**
 * D-474：工资结算顶部统计卡的快捷筛选。
 * 口径必须和统计卡上显示的数字完全一致，否则点"待审批"筛出来的条数跟卡片对不上。
 */
describe('filterRowsByStatus 工资结算快捷筛选', () => {
  const rows = [
    { id: 1, auditStatus: 'pending' },              // 待审批
    { id: 2 },                                       // 没有 auditStatus 也算待审批
    { id: 3, auditStatus: 'approved' },              // 已审批
    { id: 4, auditStatus: 'audited' },               // 已审批（历史取值）
    { id: 5, auditStatus: 'approved', paymentStatus: 'paid' }, // 已付款
    { id: 6, status: 'paid' },                       // 已付款（另一套字段）
  ];

  it('不筛选时原样返回（null / 传入空）', () => {
    expect(filterRowsByStatus(rows, null)).toBe(rows);
    expect(filterRowsByStatus(rows, null).length).toBe(6);
  });

  it('待审批：auditStatus 为空或 pending 都算', () => {
    const got = filterRowsByStatus(rows, 'pending');
    expect(got.map((r: any) => r.id)).toEqual([1, 2]);
  });

  it('已审批：approved 与 audited 都算', () => {
    const got = filterRowsByStatus(rows, 'approved');
    expect(got.map((r: any) => r.id)).toEqual([3, 4, 5]);
  });

  it('已付款：paymentStatus=paid 或 status=paid 都算', () => {
    const got = filterRowsByStatus(rows, 'paid');
    expect(got.map((r: any) => r.id)).toEqual([5, 6]);
  });

  it('已付款的不会混进待审批（核心：早期这里会误算）', () => {
    const pendingIds = filterRowsByStatus(rows, 'pending').map((r: any) => r.id);
    expect(pendingIds).not.toContain(5);
    expect(pendingIds).not.toContain(6);
  });

  it('待审批与已审批互不重叠（同一条不会既待审又已审）', () => {
    const pending = filterRowsByStatus(rows, 'pending').map((r: any) => r.id);
    const approved = filterRowsByStatus(rows, 'approved').map((r: any) => r.id);
    pending.forEach((id: number) => expect(approved).not.toContain(id));
    // 每条记录至少落在其中一类，不会被漏掉
    const covered = new Set([...pending, ...approved, ...filterRowsByStatus(rows, 'paid').map((r: any) => r.id)]);
    rows.forEach((r: any) => expect(covered).toContain(r.id));
  });

  it('空数据不报错', () => {
    expect(filterRowsByStatus([], 'pending')).toEqual([]);
  });
});
