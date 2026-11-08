import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { countVisibleSuggestions, decisionCardKey, suggestionKey } from '../../components/Layout/SmartAlertBell/helpers';

/**
 * D-915：消息中心「通知/预警（N）」必须随「× 今日不再提醒」扣减。
 *
 * <b>线上现象</b>：用户把提醒建议逐条点 × 关掉，页签仍显示（42），
 * 面板里只剩一行「提醒建议」标题和「暂无后台任务」。
 *
 * <b>根因</b>：MessageCenter 用服务端原始未读数（unread-count 接口）+ 自己那份
 * 独立拉的洞察列表算页签数；面板里的 × 只把 id 写进 localStorage，
 * 仅过滤列表显示。两边各算各的，固定对不上。
 *
 * <b>修复口径</b>：消息中心持有唯一数据源（useAlertData + useProactiveInsights），
 * 页签数从该数据的可见数（panelAlertCount + 洞察数）导出，并原样注入面板。
 * 本文件守住三层：建议可见数的计算口径、接线契约、渲染结果。
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf-8');

describe('提醒建议可见数（countVisibleSuggestions）', () => {
  it('没有建议时为 0', () => {
    expect(countVisibleSuggestions(null, new Set())).toBe(0);
    expect(countVisibleSuggestions({ suggestions: [] } as never, new Set())).toBe(0);
  });

  it('未关闭时全数可见，只展示前 3 条', () => {
    const brief = { suggestions: ['a', 'b', 'c', 'd', 'e'] } as never;
    expect(countVisibleSuggestions(brief, new Set())).toBe(3);
  });

  it('关闭一条就少一条（这是本次修复的核心行为）', () => {
    const brief = { suggestions: ['建议甲', '建议乙', '建议丙'] } as never;
    const dismissed = new Set([suggestionKey('建议乙')]);
    expect(countVisibleSuggestions(brief, dismissed)).toBe(2);
  });

  it('全部关闭后为 0（面板不应再留空标题）', () => {
    const brief = { suggestions: ['建议甲', '建议乙'] } as never;
    const dismissed = new Set([suggestionKey('建议甲'), suggestionKey('建议乙')]);
    expect(countVisibleSuggestions(brief, dismissed)).toBe(0);
  });

  it('决策卡片优先于纯文本建议，同样按 dismiss 扣减', () => {
    const cards = [
      { title: '逾期 4单 / 90件' },
      { title: '高风险 2单' },
      { title: '备货偏低' },
    ];
    const brief = { suggestions: ['文本建议'], decisionCards: cards } as never;
    expect(countVisibleSuggestions(brief, new Set())).toBe(3);
    expect(countVisibleSuggestions(brief, new Set([decisionCardKey(cards[1])]))).toBe(2);
  });
});

describe('接线契约：页签数与面板共用同一份数据（D-915）', () => {
  it('消息中心不再读服务端原始未读数，避免与 dismiss 脱节', () => {
    const s = read('src/components/Layout/MessageCenter.tsx');
    expect(s).not.toContain('getUnreadCount');
    expect(s).not.toContain('sysNoticeApi');
  });

  it('页签数从可见数导出', () => {
    const s = read('src/components/Layout/MessageCenter.tsx');
    expect(s).toContain('panelAlertCount');
    expect(s).toContain('alertsCount');
  });

  it('消息中心把同一份数据注入面板渲染', () => {
    const s = read('src/components/Layout/MessageCenter.tsx');
    expect(s).toContain('data={alertData}');
    expect(s).toContain('insightsState={insightsState}');
  });

  it('面板全部关闭后整段不渲染，不留空标题', () => {
    const s = read('src/components/Layout/SmartAlertBell.tsx');
    expect(s).toContain('suggestionsVisibleCount > 0');
  });

  it('useAlertData 导出 panelAlertCount（含已 dismiss 过滤）', () => {
    const s = read('src/components/Layout/SmartAlertBell/hooks/useAlertData.ts');
    expect(s).toContain('panelAlertCount');
    expect(s).toContain('countVisibleSuggestions');
    expect(s).toContain('unreadNoticeCount');
  });
});

/* ── 渲染验证：数字真的随 dismiss 变化 ── */

const mocks = vi.hoisted(() => ({
  panelAlertCount: 42,
  insights: [] as Array<{ id: string }>,
}));

vi.mock('../../components/Layout/SmartAlertBell/hooks/useAlertData', () => ({
  useAlertData: () => ({ panelAlertCount: mocks.panelAlertCount }),
}));

vi.mock('../../components/Layout/SmartAlertBell/hooks/useProactiveInsights', () => ({
  useProactiveInsights: () => ({
    insights: mocks.insights,
    loading: false,
    refresh: vi.fn(),
    markRead: vi.fn(),
  }),
}));

vi.mock('@/services/intelligence/intelligenceApi', () => ({
  intelligenceApi: { aiDecisionCards: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../components/Layout/SmartAlertBell', () => ({
  default: () => <div>面板</div>,
}));

vi.mock('../../components/Layout/AiSuggestionBell', () => ({
  default: () => <div>AI 面板</div>,
}));

import MessageCenter from '../../components/Layout/MessageCenter';

describe('渲染：页签数字随可见数变化', () => {
  beforeEach(() => {
    mocks.panelAlertCount = 42;
    mocks.insights = [];
  });

  const openCenter = async () => {
    fireEvent.click(screen.getByText('消息中心'));
    await waitFor(() => expect(screen.getByText('通知/预警', { exact: false })).toBeTruthy());
  };

  it('显示可见总数', async () => {
    render(<MessageCenter />);
    await openCenter();
    await waitFor(() => expect(screen.getByText(/通知\/预警（42）/)).toBeTruthy());
  });

  it('可见数降低时页签数字同步降低（关闭即扣减）', async () => {
    const { rerender } = render(<MessageCenter />);
    await openCenter();
    await waitFor(() => expect(screen.getByText(/通知\/预警（42）/)).toBeTruthy());
    mocks.panelAlertCount = 41;
    rerender(<MessageCenter />);
    await waitFor(() => expect(screen.getByText(/通知\/预警（41）/)).toBeTruthy());
  });

  it('可见数为 0 时不显示括号数字', async () => {
    mocks.panelAlertCount = 0;
    render(<MessageCenter />);
    await openCenter();
    const tabText = screen.getByText('通知/预警', { exact: false });
    expect(tabText.textContent).toBe('通知/预警');
  });
});
