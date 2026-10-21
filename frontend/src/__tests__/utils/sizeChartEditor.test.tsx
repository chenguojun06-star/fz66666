import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import SizeChartEditor from '../../modules/ecommerce/pages/ShopListing/components/SizeChartEditor';

/**
 * D-831 回归：尺寸表（手工录入）量体项按钮「点了没反应/加了就消失」。
 *
 * 根因：emit 对「全空值」一律回传 null（留空则不覆盖 SKU 矩阵的既定语义），
 * 但本地的 loadedRef 没有同步更新 —— 父组件把 null 回传后，
 * effect 认为「外部值变了」重新装载默认列，刚加的量体项列被冲掉。
 * 用户视角就是：点 +胸围 → 列闪一下消失 → 「不能添加部位」。
 *
 * 触发条件是 value 原本是非空 JSON（行值全空的存量数据），
 * 所以三个用例分别覆盖 null / 空值 JSON / 有值 JSON 三种起点。
 */

const hasCol = (name: string) =>
  screen.getAllByRole('columnheader').some((h) => h.textContent?.includes(name));

const Host: React.FC<{ initial: string | null }> = ({ initial }) => {
  const [v, setV] = useState<string | null>(initial);
  return <SizeChartEditor value={v} sizes={['S(160/70A)', 'M(165/74A)']} onChange={setV} />;
};

describe('尺寸表手工录入 · 量体项添加（D-831）', () => {
  it('起点为 null（从未录入）：点 +胸围，列出现且保持', () => {
    render(<Host initial={null} />);
    fireEvent.click(screen.getByRole('button', { name: /胸围/ }));
    expect(hasCol('胸围')).toBe(true);
  });

  it('起点为行值全空的存量 JSON（回归主场景）：点 +胸围，列不被重置', () => {
    const saved = JSON.stringify({
      cols: ['尺码', '腰围', '臀围', '裤长'],
      rows: [
        ['S(160/70A)', '', '', ''],
        ['M(165/74A)', '', '', ''],
      ],
    });
    render(<Host initial={saved} />);
    fireEvent.click(screen.getByRole('button', { name: /胸围/ }));
    expect(hasCol('胸围')).toBe(true);
  });

  it('起点为有数值的 JSON：点 +胸围，列出现且原数值保留', () => {
    const saved = JSON.stringify({
      cols: ['尺码', '腰围'],
      rows: [
        ['S(160/70A)', '60'],
        ['M(165/74A)', '62'],
      ],
    });
    render(<Host initial={saved} />);
    fireEvent.click(screen.getByRole('button', { name: /胸围/ }));
    expect(hasCol('胸围')).toBe(true);
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    expect(inputs.some((i) => i.value === '60')).toBe(true);
  });

  it('加了列但还没填数 → 回传 null（不覆盖顾客端自动生成的 SKU 矩阵）', () => {
    const onChange = vi.fn();
    render(<SizeChartEditor value={null} sizes={['S(160/70A)']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /胸围/ }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('加了列后填入数值 → 回传 JSON 且包含新列', () => {
    const onChange = vi.fn();
    render(<SizeChartEditor value={null} sizes={['S(160/70A)']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /胸围/ }));
    // 单行表格：最后一列即新加的「胸围」单元格
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(inputs[inputs.length - 1], { target: { value: '88' } });
    const calls = onChange.mock.calls as Array<[string]>;
    const last = calls[calls.length - 1]?.[0] as string;
    const parsed = JSON.parse(last) as { cols: string[]; rows: string[][] };
    expect(parsed.cols).toContain('胸围');
    expect(parsed.rows[0]).toContain('88');
  });
});
