import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import BrandLoader, { MARK_MAX_SIZE } from '@/components/common/BrandLoader';
import BrandMark from '@/components/common/BrandMark';

// 本仓库 vitest 未开 globals:true，@testing-library/react 不会自动注册 afterEach 清理，
// DOM 会跨用例累积导致 getByRole/getByTestId 命中多个元素。此处显式清理。
afterEach(() => cleanup());

describe('BrandLoader — 全站统一加载指示器（D-702）', () => {
  describe('按像素分档：小尺寸用云标，大尺寸用吉祥物', () => {
    it('小于 32px 用极简云标（吉祥物在 16px 会糊成蓝点）', () => {
      const { container } = render(<BrandLoader size={18} />);
      expect(container.querySelector('[data-testid="brand-mark"]')).toBeTruthy();
    });

    it('32px 及以上用小云吉祥物', () => {
      const { container } = render(<BrandLoader size={64} />);
      expect(container.querySelector('[data-testid="brand-mark"]')).toBeFalsy();
      // 吉祥物渲染为带 halo/ring 的 stage
      expect(container.querySelector('[class*="stage"]')).toBeTruthy();
    });

    it('分档阈值导出且为 32', () => {
      expect(MARK_MAX_SIZE).toBe(32);
    });
  });

  describe('无障碍', () => {
    it('默认带 role=status 与中文 aria-label', () => {
      render(<BrandLoader size={20} />);
      const el = screen.getByRole('status');
      expect(el.getAttribute('aria-label')).toBe('加载中');
    });

    it('传入文字 label 时自动用它做无障碍文案', () => {
      render(<BrandLoader size={20} label="正在同步订单…" />);
      expect(screen.getByRole('status').getAttribute('aria-label')).toBe('正在同步订单…');
    });

    it('ariaLabel={false} 时降级为纯装饰（紧跟已有文字时用）', () => {
      const { container } = render(<BrandLoader size={20} ariaLabel={false} />);
      expect(container.querySelector('[role="status"]')).toBeFalsy();
    });
  });

  describe('布局', () => {
    it('无 label 且非 block 时不产生多余包裹层', () => {
      const { container } = render(<BrandLoader size={18} />);
      expect(container.querySelector('[data-testid="brand-loader"]')).toBeFalsy();
    });

    it('block 模式生成居中容器', () => {
      render(<BrandLoader size={96} block label="正在加载…" />);
      const el = screen.getByTestId('brand-loader');
      expect(el.className).toMatch(/block/);
    });

    it('label 为 0 等 falsy 值时仍不渲染空标签', () => {
      const { container } = render(<BrandLoader size={20} label={0} />);
      expect(container.querySelector('[data-testid="brand-loader"]')).toBeFalsy();
    });
  });
});

describe('BrandMark — 极简云标（D-702）', () => {
  it('默认 20px，尺寸写进 style', () => {
    const { container } = render(<BrandMark />);
    const el = container.querySelector('[data-testid="brand-mark"]') as HTMLElement;
    expect(el.style.width).toBe('20px');
    expect(el.style.height).toBe('20px');
  });

  it('onColor 时切换反白样式', () => {
    const { container } = render(<BrandMark size={18} onColor />);
    const el = container.querySelector('[data-testid="brand-mark"]') as HTMLElement;
    expect(el.className).toMatch(/onColor/);
  });

  it('label={false} 渲染为 presentation', () => {
    const { container } = render(<BrandMark label={false} />);
    expect(container.querySelector('[role="presentation"]')).toBeTruthy();
  });

  it('云体由三团 + 底座 + 呼吸线构成（视觉 DNA 与吉祥物一致）', () => {
    const { container } = render(<BrandMark />);
    const el = container.querySelector('[data-testid="brand-mark"]') as HTMLElement;
    expect(el.children).toHaveLength(5);
  });
});
