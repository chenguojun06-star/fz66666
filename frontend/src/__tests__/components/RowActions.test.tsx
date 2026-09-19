import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RowActions, { type RowAction } from '../../components/common/RowActions';

/**
 * RowActions 组件回归测试
 *
 * 覆盖范围（基于 2026-08-04 整改需求）：
 * - maxInline 默认逻辑：操作<=2个全显，>2个仅显1个主按钮
 * - 显式 maxInline 仍可强制覆盖
 * - 主操作（primary）优先显示
 * - 日志（log）操作总是进入"更多"下拉
 * - "更多"容器集成：自带 children 时合并到下拉菜单
 * - 安全过滤：空 key 操作被剔除
 * - 全部禁用时下拉不可点
 * - 点击主按钮触发 onClick
 */
describe('RowActions 组件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const makeAction = (key: string, opts: Partial<RowAction> = {}): RowAction => ({
    key,
    label: key,
    onClick: vi.fn(),
    ...opts,
  });

  // ==================== maxInline 默认逻辑（关键回归点）====================

  describe('maxInline 默认逻辑回归（物料采购等全系统整改项）', () => {
    it('1个操作-全显示且无"更多"下拉', () => {
      render(<RowActions actions={[makeAction('view')]} />);
      expect(screen.getByRole('button', { name: 'view' })).toBeTruthy();
      expect(screen.queryByText('更多')).toBeNull();
    });

    it('2个操作-全显示且无"更多"下拉', () => {
      const actions = [makeAction('view'), makeAction('edit')];
      render(<RowActions actions={actions} />);
      expect(screen.getByRole('button', { name: 'view' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'edit' })).toBeTruthy();
      expect(screen.queryByText('更多')).toBeNull();
    });

    it('3个操作-只显示1个主按钮+更多下拉（不允许3个按钮）', () => {
      // 这是关键回归点：物料采购页面整改前 maxInline={2} 导致3个按钮并存
      const actions = [makeAction('view'), makeAction('edit'), makeAction('delete')];
      render(<RowActions actions={actions} />);

      // 只显示1个行内按钮
      const buttons = screen.getAllByRole('button');
      // 行内按钮 + 更多按钮 = 2
      expect(buttons.length).toBe(2);
      expect(screen.getByText('更多')).toBeTruthy();
    });

    it('5个操作-仍只显示1个主按钮+更多下拉', () => {
      const actions = [
        makeAction('view'),
        makeAction('edit'),
        makeAction('delete'),
        makeAction('copy'),
        makeAction('export'),
      ];
      render(<RowActions actions={actions} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(2);
      expect(screen.getByText('更多')).toBeTruthy();
    });
  });

  // ==================== 显式 maxInline 覆盖 ====================

  describe('显式 maxInline 覆盖', () => {
    it('显式 maxInline=2 时即使操作=3个仍只显示2个行内按钮+更多', () => {
      const actions = [makeAction('view'), makeAction('edit'), makeAction('delete')];
      render(<RowActions actions={actions} maxInline={2} />);
      const buttons = screen.getAllByRole('button');
      // 2个行内 + 1个更多 = 3
      expect(buttons.length).toBe(3);
    });
  });

  // ==================== 主操作优先 ====================

  describe('主操作优先级', () => {
    it('primary 操作会排在非primary操作之前显示', () => {
      const actions = [
        makeAction('view', { primary: false }),
        makeAction('purchase', { primary: true }),
        makeAction('delete', { primary: false }),
      ];
      render(<RowActions actions={actions} />);

      // 唯一显示的行内按钮应为 'purchase'（primary 优先）
      const inlineButton = screen.getByRole('button', { name: 'purchase' });
      expect(inlineButton).toBeTruthy();
      expect(inlineButton.className).toContain('row-actions__btn--primary');
    });
  });

  // ==================== 日志操作固定进入下拉 ====================

  describe('日志操作（key=log 或 label=日志）', () => {
    it('key=log 的操作即使只有一个也进入"更多"下拉', () => {
      const actions = [makeAction('view'), makeAction('log', { label: '日志' })];
      render(<RowActions actions={actions} />);

      // 'view' 显示，'log' 在更多下拉里
      expect(screen.getByRole('button', { name: 'view' })).toBeTruthy();
      expect(screen.getByText('更多')).toBeTruthy();
    });

    it('label=日志 的操作（key不为log）也进入"更多"下拉', () => {
      const actions = [
        makeAction('view'),
        makeAction('remark', { label: '日志' }),
      ];
      render(<RowActions actions={actions} />);

      expect(screen.getByRole('button', { name: 'view' })).toBeTruthy();
      // 行内只有 view
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(2); // view + 更多
    });
  });

  // ==================== "更多"容器集成 ====================

  describe('"更多"容器集成（用户自带的 more 容器）', () => {
    it('action list 中包含 key=more 的容器时-容器的 children 合并到下拉菜单', () => {
      const customMoreChildren = [
        { key: 'custom-edit', label: '自定义编辑' },
        { key: 'custom-delete', label: '自定义删除' },
      ];
      const actions = [
        makeAction('view'),
        {
          key: 'more',
          label: '更多',
          children: customMoreChildren as any,
        } as RowAction,
      ];
      render(<RowActions actions={actions} />);

      // 'view' 仍显示行内
      expect(screen.getByRole('button', { name: 'view' })).toBeTruthy();
      // 更多下拉按钮存在
      expect(screen.getByText('更多')).toBeTruthy();
    });
  });

  // ==================== 边界条件 ====================

  describe('边界条件', () => {
    it('空 actions 数组-不渲染任何内容', () => {
      const { container } = render(<RowActions actions={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it('undefined actions-不渲染任何内容', () => {
      const { container } = render(<RowActions actions={undefined as any} />);
      expect(container.firstChild).toBeNull();
    });

    it('空 key 的 action 被过滤掉', () => {
      const actions = [
        makeAction('view'),
        makeAction('   '), // 仅空白
        makeAction(''),
      ];
      render(<RowActions actions={actions} />);
      expect(screen.getByRole('button', { name: 'view' })).toBeTruthy();
      // 仅 1 个有效操作，仅 1 个行内按钮
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(1);
    });

    it('action.label 是 ReactNode 数字时不会崩', () => {
      const actions = [makeAction('count', { label: 42 as any })];
      const { container } = render(<RowActions actions={actions} />);
      expect(container.textContent).toContain('42');
    });
  });

  // ==================== 交互 ====================

  describe('点击行为', () => {
    it('点击行内按钮触发对应 onClick', () => {
      const onClick = vi.fn();
      const actions = [
        makeAction('view', { onClick }),
        makeAction('edit'),
        makeAction('delete'),
      ];
      render(<RowActions actions={actions} />);

      fireEvent.click(screen.getByRole('button', { name: 'view' }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('disabled 按钮不可点击', () => {
      const onClick = vi.fn();
      const actions = [makeAction('view', { onClick, disabled: true })];
      render(<RowActions actions={actions} />);

      const btn = screen.getByRole('button', { name: 'view' });
      expect((btn as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(btn);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('所有下拉项都 disabled 时-更多按钮也 disabled', () => {
      const actions = [
        makeAction('view'),
        makeAction('edit', { disabled: true }),
        makeAction('delete', { disabled: true }),
      ];
      render(<RowActions actions={actions} />);

      const moreBtn = screen.getByRole('button', { name: '更多' });
      expect((moreBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  // ==================== 主按钮类名 ====================

  describe('样式类名', () => {
    it('primary 操作的行内按钮带 --primary 修饰类', () => {
      const actions = [makeAction('purchase', { primary: true })];
      render(<RowActions actions={actions} />);

      const btn = screen.getByRole('button', { name: 'purchase' });
      expect(btn.className).toMatch(/row-actions__btn--primary/);
    });

    it('非 primary 操作的行内按钮不带 --primary 修饰类', () => {
      const actions = [makeAction('view')];
      render(<RowActions actions={actions} />);

      const btn = screen.getByRole('button', { name: 'view' });
      expect(btn.className).not.toMatch(/row-actions__btn--primary/);
    });
  });
});
