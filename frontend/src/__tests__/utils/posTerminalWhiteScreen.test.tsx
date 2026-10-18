import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PosTerminal from '../../modules/pos/pages/PosTerminal';

/**
 * D-817：收银台白屏复现测试。
 *
 * <p>现象：生产 /pos 整页白屏，报 `TypeError: oe.some is not a function`。
 * 该错误来自 antd Table 内部：`dataSource.some(row => row?.children)`。
 * 也就是**某个 Table 收到了非数组的 dataSource** —— antd 不会校验，
 * 只会在这里炸掉，导致整页崩。
 *
 * <p>为什么必须按真实 API 形状渲染整页，而不是只测各 panel：
 * 白屏只在「页面真实首屏 + 真实响应形状」下才复现，
 * 单独测 panel 时 mock 返回的一定是数组，测不出这个问题。
 */
const mockApi = vi.hoisted(() => ({
  today: vi.fn(),
  channels: vi.fn(),
  search: vi.fn(),
  payState: vi.fn(),
  pay: vi.fn(),
  hold: vi.fn(),
  holds: vi.fn(),
  resumeHold: vi.fn(),
  discardHold: vi.fn(),
  returnable: vi.fn(),
  createReturn: vi.fn(),
  currentShift: vi.fn(),
  shifts: vi.fn(),
  openShift: vi.fn(),
  closeShift: vi.fn(),
}));

vi.mock('@/services/pos/posApi', () => ({
  posApi: mockApi,
  default: mockApi,
}));

const noop = async () => {};

describe('收银台白屏复现（D-817）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 首屏：今日汇总 + 渠道状态
    mockApi.today.mockResolvedValue({
      summary: { saleCount: 0, itemCount: 0, amount: 0, creditAmount: 0 },
      byPayMethod: [],
      recent: [],
    });
    mockApi.channels.mockResolvedValue({ wechat: false, alipay: false, card: false });
    mockApi.search.mockResolvedValue([]);
    mockApi.holds.mockResolvedValue([]);
    mockApi.shifts.mockResolvedValue([]);
    mockApi.currentShift.mockResolvedValue(null);
    mockApi.payState.mockImplementation(noop);
  });

  it('首屏（收银分区）必须能渲染出来', async () => {
    render(<PosTerminal />);
    await waitFor(() => expect(screen.getByText(/今日单据/)).toBeTruthy());
    expect(screen.getByText('交接班')).toBeTruthy();
  });

  it('切到「挂单」分区不能崩', async () => {
    render(<PosTerminal />);
    await waitFor(() => expect(screen.getByText(/今日单据/)).toBeTruthy());
    fireEvent.click(screen.getByText('挂单'));
    await waitFor(() => expect(screen.getByText('挂单号')).toBeTruthy());
  });

  it('切到「交接班」分区不能崩', async () => {
    render(<PosTerminal />);
    await waitFor(() => expect(screen.getByText(/今日单据/)).toBeTruthy());
    fireEvent.click(screen.getByText('交接班'));
    await waitFor(() => expect(screen.getByText('钱箱只统计现金')).toBeTruthy());
  });

  /**
   * 关键回归：接口返回非数组（后端改成对象 / 返回 null 外的怪东西）时，
   * 收银台不能整页崩 —— 收银台白屏 = 门店无法营业，代价远大于少显示几行。
   */
  it('列表接口返回非数组时也不能白屏（Table 收到对象会直接炸）', async () => {
    mockApi.holds.mockResolvedValue({ items: [] }); // 后端一旦改了返回结构就会这样
    mockApi.shifts.mockResolvedValue({ items: [] });
    render(<PosTerminal />);
    await waitFor(() => expect(screen.getByText(/今日单据/)).toBeTruthy());

    fireEvent.click(screen.getByText('挂单'));
    await waitFor(() => expect(screen.getByText('挂单')).toBeTruthy());
    fireEvent.click(screen.getByText('交接班'));
    await waitFor(() => expect(screen.getByText('钱箱只统计现金')).toBeTruthy());
  });
});
