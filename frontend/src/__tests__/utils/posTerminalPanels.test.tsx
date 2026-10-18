import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PosHoldPanel from '../../modules/pos/pages/PosTerminal/PosHoldPanel';
import PosReturnPanel from '../../modules/pos/pages/PosTerminal/PosReturnPanel';
import PosShiftPanel from '../../modules/pos/pages/PosTerminal/PosShiftPanel';

/**
 * D-816 / D-817：收银台新增两个分区（退货·换货 / 挂单）的关键交互。
 *
 * <p>重点不是渲染细节，而是**两条业务承诺**：
 * ① 挂单取回后必须把购物车交还给收银台（否则挂单白挂，顾客的东西丢了）；
 * ② 退货页必须说清「退款要人工确认」，否则收银员会以为系统会自动退钱。
 */
// vi.mock 会被提升到文件顶部，直接引用顶层变量会「before initialization」
const mockApi = vi.hoisted(() => ({
  currentShift: vi.fn(),
  shifts: vi.fn(),
  openShift: vi.fn(),
  closeShift: vi.fn(),
  holds: vi.fn(),
  hold: vi.fn(),
  resumeHold: vi.fn(),
  discardHold: vi.fn(),
  returnable: vi.fn(),
  createReturn: vi.fn(),
}));

vi.mock('@/services/pos/posApi', () => ({
  posApi: mockApi,
}));

describe('收银台 · 挂单分区（D-817）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.holds.mockResolvedValue([
      {
        holdNo: 'HLD001',
        customerName: '王女士',
        customerPhone: '13800000000',
        itemCount: 2,
        goodsAmount: 200,
        discountAmount: 0,
        payMethod: 'CASH',
        remark: null,
        status: 'HELD',
        creatorName: '小李',
        createTime: '2026-10-18T10:20:00',
      },
    ]);
    mockApi.resumeHold.mockResolvedValue({
      holdNo: 'HLD001',
      lines: [{ skuId: 1, quantity: 2 }],
      customerId: null,
      customerName: '王女士',
      customerPhone: '13800000000',
      payMethod: 'CASH',
      remark: null,
    });
  });

  it('列出挂起中的挂单，并显示单号/客户/件数', async () => {
    render(
      <PosHoldPanel
        cartLines={[]}
        customerName={null}
        customerPhone={null}
        payMethod={null}
        onResumed={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText('HLD001')).toBeTruthy());
    expect(screen.getByText('王女士')).toBeTruthy();
  });

  it('点「取回」把购物车交还给收银台（挂单的核心价值）', async () => {
    const onResumed = vi.fn();
    render(
      <PosHoldPanel
        cartLines={[]}
        customerName={null}
        customerPhone={null}
        payMethod={null}
        onResumed={onResumed}
      />,
    );

    await waitFor(() => expect(screen.getByText('取回')).toBeTruthy());
    fireEvent.click(screen.getByText('取回'));

    await waitFor(() => expect(onResumed).toHaveBeenCalled());
    const payload = onResumed.mock.calls[0][0];
    expect(payload.lines).toHaveLength(1);
    expect(payload.customerName).toBe('王女士');
  });

  it('空购物车时禁用挂起（避免产生无意义空挂单）', async () => {
    render(
      <PosHoldPanel
        cartLines={[]}
        customerName={null}
        customerPhone={null}
        payMethod={null}
        onResumed={() => {}}
      />,
    );

    await waitFor(() => expect(screen.getByText(/挂起当前购物车/)).toBeTruthy());
    expect((screen.getByText(/挂起当前购物车/).closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('明确告知挂单不是单据：不产生应收/不扣库存', async () => {
    render(
      <PosHoldPanel cartLines={[]} customerName={null} customerPhone={null} payMethod={null} onResumed={() => {}} />,
    );

    await waitFor(() => expect(screen.getByText(/挂单是暂存购物区，不是单据/)).toBeTruthy());
    expect(screen.getByText(/不产生应收、不扣库存、不开小票/)).toBeTruthy();
  });
});

describe('收银台 · 退货换货分区（D-816）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('必须醒目说明：退款由人工确认，系统不会自动退', async () => {
    render(<PosReturnPanel onGoCheckout={() => {}} />);

    await waitFor(() => expect(screen.getByText(/未接支付渠道退款接口/)).toBeTruthy());
    expect(screen.getByText(/需要收银员在线下真实退款后/)).toBeTruthy();
  });

  it('查可退商品后按行显示 已售/已退/可退，且可退为 0 的行禁填', async () => {
    mockApi.returnable.mockResolvedValue([
      {
        saleItemId: 11, skuId: 1, skuCode: 'A', styleNo: 'ST1', styleName: '连衣裙',
        color: '黑', size: 'M', unitPrice: 100, soldQty: 3, returnedQty: 1, returnableQty: 2,
      },
      {
        saleItemId: 12, skuId: 2, skuCode: 'B', styleNo: 'ST2', styleName: '外套',
        color: '米', size: 'L', unitPrice: 200, soldQty: 1, returnedQty: 1, returnableQty: 0,
      },
    ]);

    render(<PosReturnPanel onGoCheckout={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/输入原销售单号/), { target: { value: 'PS001' } });
    fireEvent.click(screen.getByText('查可退商品'));

    await waitFor(() => expect(screen.getByText('连衣裙（黑 M）')).toBeTruthy());
    expect(screen.getByText('已退完')).toBeTruthy();
  });

  it('换货模式会提示「先退旧、再收新」，并给出去收银台的入口', async () => {
    mockApi.returnable.mockResolvedValue([
      {
        saleItemId: 11, skuId: 1, skuCode: 'A', styleNo: 'ST1', styleName: '连衣裙',
        color: '黑', size: 'M', unitPrice: 100, soldQty: 3, returnedQty: 0, returnableQty: 3,
      },
    ]);
    const onGoCheckout = vi.fn();

    render(<PosReturnPanel onGoCheckout={onGoCheckout} />);
    fireEvent.change(screen.getByPlaceholderText(/输入原销售单号/), { target: { value: 'PS001' } });
    fireEvent.click(screen.getByText('查可退商品'));
    await waitFor(() => expect(screen.getByText('连衣裙（黑 M）')).toBeTruthy());

    fireEvent.click(screen.getByText('换货'));
    await waitFor(() => expect(screen.getByText(/换货 = 先退旧、再收新/)).toBeTruthy());

    fireEvent.click(screen.getByText('去收银 Tab 收新货'));
    expect(onGoCheckout).toHaveBeenCalled();
  });
});

describe('收银台 · 交接班/钱箱分区（D-817）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.shifts.mockResolvedValue([]);
  });

  it('必须写明钱箱只算现金 —— 否则收银员对着对不平的数字会放弃用这个功能', async () => {
    mockApi.currentShift.mockResolvedValue(null);
    render(<PosShiftPanel />);

    await waitFor(() => expect(screen.getByText('钱箱只统计现金')).toBeTruthy());
    expect(screen.getByText(/微信 \/ 支付宝是线上到商户账户、刷卡走 POS 对账单/)).toBeTruthy();
  });

  it('未开班时提示开班，并要求登记备用金', async () => {
    mockApi.currentShift.mockResolvedValue(null);
    render(<PosShiftPanel />);

    await waitFor(() => expect(screen.getByText('你当前没有开着的班次')).toBeTruthy());
    expect(screen.getByText('钱箱备用金：')).toBeTruthy();
    expect(screen.getByText('开班')).toBeTruthy();
  });

  it('上班中：分币种列出本班统计，应有钱箱单列醒目', async () => {
    mockApi.currentShift.mockResolvedValue({
      shiftNo: 'SHF001',
      cashierName: '收银员小李',
      terminal: '前台收银台',
      status: 'OPEN',
      openingCash: 200,
      saleCount: 3,
      cashSaleAmount: 100,
      onlineSaleAmount: 500,
      cardSaleAmount: 400,
      creditAmount: 300,
      refundCashAmount: 30,
      expectedCash: 270,
      actualCash: null,
      diffAmount: null,
      diffReason: null,
      openedAt: '2026-10-18T09:00:00',
      closedAt: null,
      cashOnlyHint: '',
    });
    render(<PosShiftPanel />);

    await waitFor(() => expect(screen.getByText(/班次 SHF001/)).toBeTruthy());
    // 备用金 200 + 现金 100 − 现金退款 30 = 270
    expect(screen.getAllByText('¥270.00').length).toBeGreaterThan(0);
    // 微信/刷卡/挂账分列，不并进钱箱
    expect(screen.getAllByText('¥500.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('¥400.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('¥300.00').length).toBeGreaterThan(0);
    expect(screen.getByText('交班')).toBeTruthy();
  });

  it('已交班的班次显示差异（长款/短款）', async () => {
    mockApi.currentShift.mockResolvedValue(null);
    mockApi.shifts.mockResolvedValue([
      {
        shiftNo: 'SHF002',
        cashierName: '收银员小李',
        terminal: null,
        status: 'CLOSED',
        openingCash: 200,
        saleCount: 5,
        cashSaleAmount: 800,
        onlineSaleAmount: 0,
        cardSaleAmount: 0,
        creditAmount: 0,
        refundCashAmount: 0,
        expectedCash: 1000,
        actualCash: 980,
        diffAmount: -20,
        diffReason: '找零给错',
        openedAt: '2026-10-18T09:00:00',
        closedAt: '2026-10-18T18:00:00',
        cashOnlyHint: '',
      },
    ]);
    render(<PosShiftPanel />);

    await waitFor(() => expect(screen.getByText('SHF002')).toBeTruthy());
    expect(screen.getByText(/短款 20.00/)).toBeTruthy();
  });
});
