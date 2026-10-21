import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
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
    // D-832：同一文案会出现在画布与左侧缩略图栏两处，用 getAllByText 断言
    expect(screen.getAllByText('卖点：透气').length).toBeGreaterThan(0);
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

  it('D-834：操作收进右侧面板 —— 选中图片块才有「查看大图」，文字块没有', () => {
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={() => {}} onClose={() => {}} />);

    // 面板只显示当前选中块的操作：选中第 2 块（文字）→ 没有查看大图
    fireEvent.click(screen.getByRole('button', { name: '跳到第 2 块' }));
    expect(screen.queryByRole('button', { name: '查看大图' })).toBeNull();
    // 切回图片块 → 恰好 1 个查看大图（不再像旧版每张图各挂一个）
    fireEvent.click(screen.getByRole('button', { name: '跳到第 1 块' }));
    expect(screen.getAllByRole('button', { name: '查看大图' })).toHaveLength(1);
  });

  // 这个用例会渲染 ResizableModal 92vw 大弹窗 + 两次 antd Popconfirm，
  // 全量并行跑时本机负载高，单跑 ~1s、全量可能 >5s，撞上 vitest 默认上限。
  // 显式放宽的是**测试时限**，不是断言，也不是靠 sleep 掩盖。
  it('删除图片块与删除文字块，回调结果都要剔除该项', async () => {
    const onChange = vi.fn();
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={onChange} onClose={() => {}} />);

    // D-834：删除操作收进右侧属性面板 —— 先选中第 1 块（图片 a）再操作
    fireEvent.click(screen.getByRole('button', { name: '跳到第 1 块' }));
    fireEvent.click(screen.getByRole('button', { name: '删除这张图片' }));
    // Popconfirm 有入场动画，全量跑时机器负载高，默认 1s 等待会偶发超时 ——
    // 这类 flaky 必须治（重跑蒙混等于把门控交给运气），不是加 sleep。
    fireEvent.click(await screen.findByRole('button', { name: /^删\s*除$/ }, { timeout: 8000 }));
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'text', content: '卖点：透气' },
      { type: 'image', url: 'b.jpg' },
    ]);

    onChange.mockClear();
    // onChange 是 noop mock，列表不会真变短 —— 文字块仍是第 2 块，重新选中它
    fireEvent.click(screen.getByRole('button', { name: '跳到第 2 块' }));
    fireEvent.click(screen.getByRole('button', { name: '删除这段文字' }));
    fireEvent.click(await screen.findByRole('button', { name: /^删\s*除$/ }, { timeout: 8000 }));
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'image', url: 'a.jpg' },
      { type: 'image', url: 'b.jpg' },
    ]);
   }, 20000);

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

    // D-834：按钮在右侧属性面板 —— 先选中第 1 块（图片 a）再点
    fireEvent.click(screen.getByRole('button', { name: '跳到第 1 块' }));
    fireEvent.click(screen.getByRole('button', { name: '给这张图加说明' }));

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

    // D-834：图注开关移到右侧属性面板 —— 先选中第 2 块（文字）再切换
    fireEvent.click(screen.getByRole('button', { name: '跳到第 2 块' }));
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

/**
 * D-832：左侧缩略图栏 —— 竞品编辑器同款交互。
 * 画布里的上下箭头太难用（用户原话），排序主交互改为**直接拖拽缩略图**；
 * 点击缩略图 → 编辑区滚到对应块；编辑区滚动 → 高亮跟随。
 */
describe('详情描述画布 · 左侧缩略图栏（D-832）', () => {
  it('每块都有缩略项：图片块出缩略图、文字块出文字摘要、序号递增', () => {
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={() => {}} onClose={() => {}} />);

    expect(screen.getByAltText('第 1 块缩略图')).toBeTruthy();
    expect(screen.getByAltText('第 3 块缩略图')).toBeTruthy();
    // 文字块缩略项显示去标签后的纯文本摘要
    expect(screen.getByRole('button', { name: '跳到第 2 块' }).textContent).toContain('卖点：透气');
  });

  it('画布里不再有上下箭头按钮（排序走拖拽），箭头只在缩略图栏悬停区', () => {
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={() => {}} onClose={() => {}} />);

    // 3 块 → 缩略图栏恰好 3 个「上移」3 个「下移」；画布工具条不再出现箭头
    expect(screen.getAllByRole('button', { name: '上移' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: '下移' })).toHaveLength(3);
  });

  it('点击缩略图 → 编辑区滚动到对应块（scrollIntoView 被调用）', () => {
    const spy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: spy,
    });
    try {
      render(<DetailCanvasEditor open blocks={BLOCKS} onChange={() => {}} onClose={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: '跳到第 3 块' }));
      expect(spy).toHaveBeenCalled();
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('拖拽缩略图排序：第 1 块拖到第 3 块，数组顺序真变', () => {
    const onChange = vi.fn();
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={onChange} onClose={() => {}} />);

    const items = screen.getAllByRole('button', { name: /跳到第 \d+ 块/ });
    fireEvent.dragStart(items[0]);
    fireEvent.drop(items[2]);

    expect(onChange).toHaveBeenCalledWith([
      { type: 'text', content: '卖点：透气' },
      { type: 'image', url: 'b.jpg' },
      { type: 'image', url: 'a.jpg' },
    ]);
  });

  it('拖拽到原位不触发 onChange（无害冗余操作）', () => {
    const onChange = vi.fn();
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={onChange} onClose={() => {}} />);

    const items = screen.getAllByRole('button', { name: /跳到第 \d+ 块/ });
    fireEvent.dragStart(items[1]);
    fireEvent.drop(items[1]);

    expect(onChange).not.toHaveBeenCalled();
  });
});

/**
 * D-831 回归：从空白详情开始，「添加文字段落」要真的出现可编辑区。
 *
 * 根因：渲染列表曾把「没有内容的文字块」过滤掉 —— 点添加确实追加了空块，
 * 但它被过滤器吞掉、界面上永远不出现，看起来就是「点了没反应」。
 * 必须用**带状态的宿主**做渲染级断言（只断 onChange 被调用抓不到这个 bug）。
 */
describe('详情描述画布 · 添加文字段落真实可见（D-831）', () => {
  const Host: React.FC = () => {
    const [blocks, setBlocks] = useState<DetailBlock[]>([]);
    return <DetailCanvasEditor open blocks={blocks} onChange={setBlocks} onClose={() => {}} />;
  };

  it('空白详情：点「添加文字段落」→ 立即出现可编辑的文字块', () => {
    render(<Host />);
    fireEvent.click(screen.getAllByRole('button', { name: /添加文字段落/ })[0]);
    expect(screen.getByRole('textbox', { name: '第 1 块文字' })).toBeTruthy();
  });

  it('空白详情：点模板按钮「核心卖点」→ 插入的模板文案可见可编辑', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: '核心卖点' }));
    const box = screen.getByRole('textbox', { name: '第 1 块文字' });
    expect(box.innerHTML).toContain('为什么值得入手');
  });

  it('工具条「插入文案模板」下拉可用，选中后插入对应段落', async () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: /插入文案模板/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '洗涤与保养' }, { timeout: 5000 }));
    const box = await screen.findByRole('textbox', { name: '第 1 块文字' }, { timeout: 5000 });
    expect(box.innerHTML).toContain('洗涤与保养');
  });
});

/**
 * D-834：右侧属性面板 —— 对齐竞品「左列表 / 中画布 / 右属性」三栏方案。
 * 画布只管内容与布局，选中块的操作（替换图片/查看大图/加说明/删除/图注开关）
 * 全部集中到右侧面板；左侧缩略图直接带删除 X，不必先跳转再找删除。
 */
describe('详情描述画布 · 右侧属性面板（D-834）', () => {
  it('空详情：属性面板显示空态引导，而不是一片空白', () => {
    render(<DetailCanvasEditor open blocks={[]} onChange={() => {}} onClose={() => {}} />);

    expect(screen.getByText('还没有选中内容块')).toBeTruthy();
  });

  it('缩略图直接带删除 X：点「删除第 3 块」确认后真删，不动其他块', async () => {
    const onChange = vi.fn();
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={onChange} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '删除第 3 块' }));
    fireEvent.click(await screen.findByRole('button', { name: /^删\s*除$/ }, { timeout: 8000 }));
    expect(onChange).toHaveBeenLastCalledWith([
      { type: 'image', url: 'a.jpg' },
      { type: 'text', content: '卖点：透气' },
    ]);
  }, 20000);

  it('图片块面板提供「替换图片」入口（原位换图，不动其他块顺序）', () => {
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={() => {}} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '跳到第 1 块' }));
    expect(screen.getByRole('button', { name: /替换图片/ })).toBeTruthy();
  });

  it('点击画布中的块 → 选中态同步到左侧缩略图栏', () => {
    render(<DetailCanvasEditor open blocks={BLOCKS} onChange={() => {}} onClose={() => {}} />);

    fireEvent.click(screen.getByAltText('第 1 块的图片'));
    // SideDrawer 渲染在 portal（document.body）里，rail 不在 render container 下，
    // 必须从 body 查询
    const active = document.body.querySelector('.deic-rail__item.is-active');
    expect(active).toBeTruthy();
    // 高亮的正是第 1 块的缩略项（包含其缩略图）
    expect(active?.contains(screen.getByAltText('第 1 块缩略图'))).toBe(true);
  });
});
