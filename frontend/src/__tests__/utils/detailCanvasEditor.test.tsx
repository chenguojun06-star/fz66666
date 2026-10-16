import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DetailCanvasEditor from '../../modules/ecommerce/pages/ShopListing/components/DetailCanvasEditor';
import type { DetailBlock } from '../../modules/ecommerce/pages/ShopListing/types';

/**
 * D-808：详情描述画布（图 + 文交错）的回归测试。
 *
 * <p>守护的是四类「看起来能点、实际没反应」的静默失效：
 * ① 排序后顺序没真变（只换角标不换数组）；
 * ② 图与文的交错顺序被破坏 —— 顺序就是详情页本身；
 * ③ 上限按「图」计而不是按「块」计 → 平台会拒收而系统毫无提示；
 * ④ 空图片/空文字块混进列表 → 顾客端出现空图框或空白段落。
 */

const BLOCKS: DetailBlock[] = [
  { type: 'image', url: 'a.jpg' },
  { type: 'text', content: '卖点：透气' },
  { type: 'image', url: 'b.jpg' },
];

describe('详情描述画布 · 图文交错（D-808）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('按顺序渲染图与文，交错关系不被拆开', () => {
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={() => {}} onClose={() => {}} />);

    // alt 用「第 N 块的图片」而不是「第 N 张详情图」：图文交错后
    // 块序号 ≠ 图片序号，沿用图片序号会让人误判自己是第几张图
    expect(screen.getByAltText('第 1 块的图片')).toBeTruthy();
    expect(screen.getByAltText('第 3 块的图片')).toBeTruthy();
    // 文字块必须渲染成可编辑区域，而不是被静默丢弃（D-809 起是富文本）
    expect(screen.getByRole('textbox', { name: '第 2 块文字' })).toBeTruthy();
    expect(screen.getByText('卖点：透气')).toBeTruthy();
  });

  it('统计里图与文分开计数，便于运营核对', () => {
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={() => {}} onClose={() => {}} />);

    expect(screen.getByText('3 / 20 块')).toBeTruthy();
    expect(screen.getByText('2 图')).toBeTruthy();
    expect(screen.getByText('1 段文字')).toBeTruthy();
  });

  it('点「下移」真的交换顺序，而不是只换角标', () => {
    const onChange = vi.fn();
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={onChange} onClose={() => {}} />);

    fireEvent.click(screen.getAllByRole('button', { name: /下移/ })[0]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      { type: 'text', content: '卖点：透气' },
      { type: 'image', url: 'a.jpg' },
      { type: 'image', url: 'b.jpg' },
    ]);
  });

  it('第 1 块禁用「上移」、最后一块禁用「下移」', () => {
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={() => {}} onClose={() => {}} />);

    const ups = screen.getAllByRole('button', { name: /上移/ }) as HTMLButtonElement[];
    const downs = screen.getAllByRole('button', { name: /下移/ }) as HTMLButtonElement[];

    expect(ups[0].disabled).toBe(true);
    expect(downs[downs.length - 1].disabled).toBe(true);
  });

  it('文字块不提供「查看大图」，图片块才有', () => {
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={() => {}} onClose={() => {}} />);

    // 2 张图 → 2 个查看大图；文字块没有
    expect(screen.getAllByRole('button', { name: '查看大图' })).toHaveLength(2);
  });

  it('删除图片块与删除文字块，回调结果都要剔除该项', async () => {
    const onChange = vi.fn();
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={onChange} onClose={() => {}} />);

    fireEvent.click(screen.getAllByRole('button', { name: '删除这张图片' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /^删\s*除$/ }));
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'text', content: '卖点：透气' },
      { type: 'image', url: 'b.jpg' },
    ]);

    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '删除这段文字' }));
    fireEvent.click(await screen.findByRole('button', { name: /^删\s*除$/ }));
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'image', url: 'a.jpg' },
      { type: 'image', url: 'b.jpg' },
    ]);
  });

  it('「添加文字段落」在末尾追加空文字块，商家可随后编辑', () => {
    const onChange = vi.fn();
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={onChange} onClose={() => {}} />);

    fireEvent.click(screen.getAllByRole('button', { name: /添加文字段落/ })[0]);

    expect(onChange).toHaveBeenCalledWith([...BLOCKS, { type: 'text', content: '' }]);
  });

  it('编辑文字内容只改这一块，不动其他块的顺序', () => {
    const onChange = vi.fn();
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={onChange} onClose={() => {}} />);

    const box = screen.getByRole('textbox', { name: '第 2 块文字' });
    // 富文本是 contentEditable，React 的 change 事件不触发，只能靠 input
    box.innerHTML = '卖点：更透气';
    fireEvent.input(box);

    expect(onChange).toHaveBeenCalledWith([
      { type: 'image', url: 'a.jpg' },
      { type: 'text', content: '卖点：更透气' },
      { type: 'image', url: 'b.jpg' },
    ]);
  });

  it('满 20 块时禁用添加，并按「块」而不是「张」计数', () => {
    const twenty: DetailBlock[] = Array.from({ length: 20 }, (_, i) =>
      i % 2 === 0 ? { type: 'image', url: `i${i}.jpg` } : { type: 'text', content: `第${i}段` },
    );
    render(<DetailCanvasEditor open blocks={twenty} onChange={() => {}} onClose={() => {}} />);

    expect(screen.getByText('20 / 20 块')).toBeTruthy();
    expect(screen.getByText('已达上限 20 块')).toBeTruthy();
    // 平台限制的是描述模块数，不是图片数 —— 10 图 + 10 文已经满了
    expect((screen.getAllByRole('button', { name: /添加文字段落/ })[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('空态说明是「图文交错」而不是「一堆图」', () => {
    render(<DetailCanvasEditor open blocks={[]} onChange={() => {}} onClose={() => {}} />);

    expect(screen.getByText('还没有详情内容')).toBeTruthy();
  });


  it('D-810：给图片加说明 → 插到该图正下方并标记为图注', () => {
    const onChange = vi.fn();
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={onChange} onClose={() => {}} />);

    // 给第 1 张图（图块在 index 0）加说明
    fireEvent.click(screen.getAllByRole('button', { name: '给这张图加说明' })[0]);

    expect(onChange).toHaveBeenCalledWith([
      { type: 'image', url: 'a.jpg' },
      { type: 'text', content: '', caption: true },
      { type: 'text', content: '卖点：透气' },
      { type: 'image', url: 'b.jpg' },
    ]);
  });

  it('D-810：图注标记不能被编辑文字时抹掉', () => {
    const withCaption: DetailBlock[] = [
      { type: 'image', url: 'a.jpg' },
      { type: 'text', content: '说明', caption: true },
    ];
    const onChange = vi.fn();
    render(<DetailCanvasEditor open blocks={withCaption} onChange={onChange} onClose={() => {}} />);

    const box = screen.getByRole('textbox', { name: '第 2 块文字' });
    box.innerHTML = '改过的说明';
    fireEvent.input(box);

    // 整个对象重建就会把 caption 丢掉，图注样式随之失效
    expect(onChange).toHaveBeenCalledWith([
      { type: 'image', url: 'a.jpg' },
      { type: 'text', content: '改过的说明', caption: true },
    ]);
  });

  it('D-810：关闭图注开关只改标记，不动内容与顺序', () => {
    const withCaption: DetailBlock[] = [
      { type: 'image', url: 'a.jpg' },
      { type: 'text', content: '说明', caption: true },
    ];
    const onChange = vi.fn();
    render(<DetailCanvasEditor open blocks={withCaption} onChange={onChange} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledWith([
      { type: 'image', url: 'a.jpg' },
      { type: 'text', content: '说明', caption: false },
    ]);
  });

  it('D-810：图注与普通文字在统计里分开计数', () => {
    const mixed: DetailBlock[] = [
      { type: 'image', url: 'a.jpg' },
      { type: 'text', content: '说明', caption: true },
      { type: 'text', content: '段落' },
    ];
    render(<DetailCanvasEditor open blocks={mixed} onChange={() => {}} onClose={() => {}} />);

    expect(screen.getByText('1 图')).toBeTruthy();
    expect(screen.getByText('2 段文字')).toBeTruthy();
    expect(screen.getByText('1 条图注')).toBeTruthy();
  });
});
