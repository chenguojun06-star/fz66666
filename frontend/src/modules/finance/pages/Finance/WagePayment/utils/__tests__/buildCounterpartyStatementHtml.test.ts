import { describe, it, expect } from 'vitest';
import {
  buildCounterpartyStatementHtml,
  buildMultiCounterpartyStatementHtml,
  type CounterpartyStatementParams,
} from '../buildCounterpartyStatementHtml';

/** 构造一份对账单参数 */
const makeParams = (overrides: Partial<CounterpartyStatementParams> = {}): CounterpartyStatementParams => ({
  counterpartyName: '李老板',
  counterpartyTypeText: '员工',
  monthLabel: '2026-09',
  rows: [
    {
      billNo: 'BA20260818153752706001',
      sourceType: 'STYLE_DEVELOPMENT',
      sourceNo: 'SD-146',
      amount: 32.23,
      settledAmount: 0,
      status: 'CONFIRMED',
      settlementMonth: '2026-08',
    },
  ],
  totalAmount: 32.23,
  settledAmount: 0,
  unpaidAmount: 32.23,
  ...overrides,
});

describe('buildCounterpartyStatementHtml 往来对账单打印模板', () => {
  it('包含标题、对象信息与对方签字栏（发给对方确认用）', () => {
    const html = buildCounterpartyStatementHtml(makeParams());
    expect(html).toContain('往来对账单');
    expect(html).toContain('李老板');
    expect(html).toContain('员工');
    expect(html).toContain('2026-09');
    expect(html).toContain('对方确认签字');
    expect(html).toContain('window.print()');
  });

  it('明细与合计都带金额，未付金额用红字标记', () => {
    const html = buildCounterpartyStatementHtml(makeParams());
    expect(html).toContain('BA20260818153752706001');
    expect(html).toContain('SD-146');
    expect(html).toContain('合计（1 笔）');
    // 未付单元格带 unpaid 类（红字）
    expect(html).toContain('class="r unpaid"');
  });

  it('部分付款时未付 = 金额 - 已付', () => {
    const html = buildCounterpartyStatementHtml(
      makeParams({
        rows: [{ billNo: 'BA002', amount: 100, settledAmount: 40, status: 'SETTLING' }],
        totalAmount: 100,
        settledAmount: 40,
        unpaidAmount: 60,
      }),
    );
    expect(html).toContain('60');
    expect(html).toContain('40');
  });

  it('扣款（负数）用红字标记，不会显示成正数', () => {
    const html = buildCounterpartyStatementHtml(
      makeParams({
        rows: [{ billNo: 'BA003', amount: -50, settledAmount: 0, status: 'CONFIRMED' }],
        totalAmount: -50,
        unpaidAmount: -50,
      }),
    );
    expect(html).toContain('neg');
  });

  it('没有明细时给出占位提示，而不是空白表格', () => {
    const html = buildCounterpartyStatementHtml(makeParams({ rows: [], totalAmount: 0, unpaidAmount: 0 }));
    expect(html).toContain('暂无账单明细');
    expect(html).toContain('合计（0 笔）');
  });

  it('对象名与备注中的 HTML 会被转义，防止打单内容被注入', () => {
    const html = buildCounterpartyStatementHtml(
      makeParams({
        counterpartyName: '<script>alert(1)</script>',
        rows: [{ billNo: '<img src=x onerror=alert(1)>', amount: 1, settledAmount: 0 }],
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });
});

describe('buildMultiCounterpartyStatementHtml 批量打印', () => {
  it('每个对象各占一页，最后一份不插分页符', () => {
    const html = buildMultiCounterpartyStatementHtml([
      makeParams({ counterpartyName: '最美服装工厂' }),
      makeParams({ counterpartyName: '测试工厂_7C6RMQ' }),
    ]);
    expect(html).toContain('最美服装工厂');
    expect(html).toContain('测试工厂_7C6RMQ');
    // 两个对象 → 只有第一份后面需要分页
    expect((html.match(/page-break-after: always/g) || []).length).toBe(1);
    expect(html).toContain('<title>往来对账单</title>');
  });

  it('只有一个对象时不插分页符', () => {
    const html = buildMultiCounterpartyStatementHtml([makeParams()]);
    expect(html).not.toContain('page-break-after: always');
  });
});
