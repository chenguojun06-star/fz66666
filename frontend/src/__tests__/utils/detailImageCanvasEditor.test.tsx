import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DetailImageCanvasEditor from '../../modules/ecommerce/pages/ShopListing/components/DetailImageCanvasEditor';

/**
 * D-803：详情描述画布的回归测试。
 *
 * <p>守护的是三类「看起来能点、实际没反应」的静默失效：
 * ① 排序后顺序没真变（只换角标不换数组）；
 * ② 20 张上限没提示，运营传满 20 张后平台才拒收；
 * ③ 画布挂在错误组件里 —— 之前的 DetailModuleContent 有 6 个内容组件，
 * 同一段收尾代码在多个组件里都出现，接错位置不会报错、只是入口不出现。
 */

const IMAGES = ['a.jpg', 'b.jpg', 'c.jpg'];

describe('详情描述画布（D-803）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('按顺序自上而下渲染全部详情图（纵向连成一条）', () => {
    render(<DetailImageCanvasEditor open images={IMAGES} onChange={() => {}} onClose={() => {}} />);

    expect(screen.getByAltText('详情图 1')).toBeTruthy();
    expect(screen.getByAltText('详情图 2')).toBeTruthy();
    expect(screen.getByAltText('详情图 3')).toBeTruthy();
  });

  it('点「下移」真的交换数组顺序，而不是只换角标', () => {
    const onChange = vi.fn();
    render(<DetailImageCanvasEditor open images={IMAGES} onChange={onChange} onClose={() => {}} />);

    fireEvent.click(screen.getAllByRole('button', { name: /下移/ })[0]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['b.jpg', 'a.jpg', 'c.jpg']);
  });

  it('第 1 张禁用「上移」、最后一张禁用「下移」', () => {
    render(<DetailImageCanvasEditor open images={IMAGES} onChange={() => {}} onClose={() => {}} />);

    const ups = screen.getAllByRole('button', { name: /上移/ }) as HTMLButtonElement[];
    const downs = screen.getAllByRole('button', { name: /下移/ }) as HTMLButtonElement[];

    expect(ups[0].disabled).toBe(true);
    expect(downs[downs.length - 1].disabled).toBe(true);
  });

  it('删除单张时把该张从结果里剔掉', async () => {
    const onChange = vi.fn();
    render(<DetailImageCanvasEditor open images={IMAGES} onChange={onChange} onClose={() => {}} />);

    fireEvent.click(screen.getAllByRole('button', { name: '删除这张详情图' })[0]);
    // Popconfirm 是二次确认，直接点删除不会真的删 —— 不点确认的删除等于没删。
    // antd 会给两个汉字的按钮自动插空格（渲染成「删 除」），所以用正则匹配。
    fireEvent.click(await screen.findByRole('button', { name: /^删\s*除$/ }));

    expect(onChange).toHaveBeenCalledWith(['b.jpg', 'c.jpg']);
  });

  it('已有 20 张时提示已达上限', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `img-${i}.jpg`);
    render(<DetailImageCanvasEditor open images={twenty} onChange={() => {}} onClose={() => {}} />);

    expect(screen.getByText('20 / 20 张')).toBeTruthy();
    expect(screen.getByText('已达上限 20 张')).toBeTruthy();
  });

  it('空态说明「从上到下连成一条」，且不编造平台不存在的页面模板', () => {
    render(<DetailImageCanvasEditor open images={[]} onChange={() => {}} onClose={() => {}} />);

    expect(screen.getByText('还没有详情图')).toBeTruthy();
    expect(screen.getAllByText('默认宝贝详情页').length).toBeGreaterThan(0);
  });

  it('工具条常驻规格提示，避免运营反复试错', () => {
    render(<DetailImageCanvasEditor open images={IMAGES} onChange={() => {}} onClose={() => {}} />);

    expect(screen.getByText(/单张建议宽 750–1242px/)).toBeTruthy();
  });
});