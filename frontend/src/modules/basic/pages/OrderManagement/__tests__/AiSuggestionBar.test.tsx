import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { App } from 'antd';
import type { ReactNode } from 'react';
import AiSuggestionBar from '../components/AiSuggestionBar';

/**
 * D-854：订单列表页 AI 建议横条。
 *
 * 守护三件事：
 * ① 没有建议时必须完全不渲染（不占位、不打扰用户）
 * ② 有建议时展示条数与内容（否则「生成了人看不到」的老问题复发）
 * ③ 采纳动作必须真的调反馈接口（否则采纳率永远 0、AI 无真值校准）
 */
const mockCards = vi.fn();
const mockFeedback = vi.fn();

vi.mock('@/services/intelligence/intelligenceApi', () => ({
  intelligenceApi: {
    aiDecisionCards: (...args: unknown[]) => mockCards(...args),
    aiDecisionFeedback: (...args: unknown[]) => mockFeedback(...args),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** antd v5 的 App.useApp() 需要外层 provider */
const wrap = (ui: ReactNode) => render(<App>{ui}</App>);

describe('AiSuggestionBar — 订单列表页 AI 建议横条', () => {
  it('无建议时完全不渲染（不占位不打扰）', async () => {
    mockCards.mockResolvedValue([]);
    const { container } = wrap(<AiSuggestionBar />);
    await waitFor(() => expect(mockCards).toHaveBeenCalled());
    expect(container.textContent || '').not.toContain('AI 建议');
  });

  it('有建议时展示条数与问题/建议内容', async () => {
    mockCards.mockResolvedValue([
      {
        id: 1,
        question: '这单为什么延期',
        recommendation: '面辅料晚到 3 天，建议把交期顺延并通知客户',
        riskLevel: 'high',
        confidence: 0.82,
        adopted: 0,
      },
    ]);
    wrap(<AiSuggestionBar />);
    expect(await screen.findByText(/AI 建议 1 条/)).toBeTruthy();
    fireEvent.click(screen.getByText(/AI 建议 1 条/));
    expect(await screen.findByText('这单为什么延期')).toBeTruthy();
  });

  it('已采纳的建议不再展示（avoid 重复打扰）', async () => {
    mockCards.mockResolvedValue([
      { id: 2, question: '旧建议', recommendation: 'R', adopted: 1 },
    ]);
    const { container } = wrap(<AiSuggestionBar />);
    await waitFor(() => expect(mockCards).toHaveBeenCalled());
    expect(container.textContent || '').not.toContain('AI 建议');
  });

  it('点击采纳必须调用反馈接口并移除该条', async () => {
    mockCards.mockResolvedValue([
      { id: 7, question: '该转哪家厂', recommendation: '建议转 A 厂', adopted: 0 },
    ]);
    mockFeedback.mockResolvedValue(undefined);
    wrap(<AiSuggestionBar />);

    fireEvent.click(await screen.findByText(/AI 建议 1 条/));
    fireEvent.click(await screen.findByText('采纳'));

    await waitFor(() => expect(mockFeedback).toHaveBeenCalledWith(7, 1, undefined));
  });

  it('接口失败时静默降级为空列表（不影响订单列表主流程）', async () => {
    mockCards.mockRejectedValue(new Error('network down'));
    const { container } = wrap(<AiSuggestionBar />);
    await waitFor(() => expect(mockCards).toHaveBeenCalled());
    expect(container.textContent || '').not.toContain('AI 建议');
  });
});
