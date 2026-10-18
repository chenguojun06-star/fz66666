import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CashNumpad from '../../modules/pos/pages/PosTerminal/CashNumpad';

/**
 * 收银台现金收款数字键盘。
 *
 * <p>为什么单独测：找零差 0.01 元，收银员要找顾客一枚硬币、顾客要怀疑系统，
 * 当场就是一次纠纷。这类金额 bug 肉眼极难发现，必须用测试钉死。
 */
describe('现金数字键盘', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setup = (due: number) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<CashNumpad open due={due} onConfirm={onConfirm} onCancel={onCancel} />);
    return { onConfirm, onCancel };
  };

  const type = (keys: string) => {
    keys.split(' ').filter(Boolean).forEach((k) => {
      fireEvent.click(screen.getByRole('button', { name: k === 'C' ? '清除' : k }));
    });
  };

  it('按一次左移两位：1 → 0.01，和硬件 POS 键盘一致（不需要再按小数点）', () => {
    setup(0.01);
    type('1');
    expect(screen.getByText('¥0.01')).toBeTruthy();
  });

  it('12 → 0.12', () => {
    setup(1);
    type('1 2');
    expect(screen.getByText('¥0.12')).toBeTruthy();
  });

  it('1200 → 12.00', () => {
    setup(12);
    type('1 2 0 0');
    expect(screen.getByText('¥12.00')).toBeTruthy();
  });

  it('找零显示正确：应收 88，实收 100 → 找零 12', () => {
    setup(88);
    type('1 0 0 0 0');
    expect(screen.getByText(/找零 ¥12\.00/)).toBeTruthy();
  });

  /**
   * 真实坑：应收是**多行金额累加**出来的，可能是 0.1+0.2=0.30000000000000004。
   * 此时实收 0.3，找零算出来是 -5.55e-17：不修正就会判成「钱不够」，
   * 收款按钮直接禁用 —— 一单 3 毛钱永远结不掉。
   */
  it('**浮点累加的应收**：0.1+0.2 实收 0.3，必须判为找零 0 且允许收款', () => {
    const { onConfirm } = setup(0.1 + 0.2);
    type('3 0');
    expect(screen.getByText(/找零 ¥0\.00/)).toBeTruthy();
    const ok = screen.getByRole('button', { name: '确认收款' });
    expect((ok as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(ok);
    expect(onConfirm).toHaveBeenCalledWith(0.3);
  });

  it('钱不够时不能确认收款（避免开出收不到钱的单）', () => {
    const { onConfirm } = setup(100);
    type('5 0 0 0'); // 50 元
    const ok = screen.getByRole('button', { name: '确认收款' });
    expect((ok as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(ok);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/还差 ¥50\.00/)).toBeTruthy();
  });

  it('钱够了才允许确认，回调拿到的就是实收金额', () => {
    const { onConfirm } = setup(100);
    type('1 0 0 0 0'); // 100 元
    const ok = screen.getByRole('button', { name: '确认收款' });
    expect((ok as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(ok);
    expect(onConfirm).toHaveBeenCalledWith(100);
  });

  it('清除键能重置', async () => {
    setup(10);
    type('1 2 3');
    fireEvent.click(screen.getByRole('button', { name: '清除' }));
    await waitFor(() => expect(screen.getByText('¥0.00')).toBeTruthy());
  });

  it('封顶 999999.99：连按不会顶成天文数字', () => {
    setup(1);
    type('9 9 9 9 9 9 9 9 9 9');
    expect(screen.getByText('¥999999.99')).toBeTruthy();
  });
});
