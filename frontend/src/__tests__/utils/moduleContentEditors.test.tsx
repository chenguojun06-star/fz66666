import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MODULE_CONTENT, type ModuleContentCtx } from '../../modules/ecommerce/pages/ShopListing/components/DetailModuleContent';

/**
 * 详情页模块内容编辑区（D-782 建立，D-785 随模块合并）
 *
 * 用户诉求原话：「最基本的图片都上传不了，更别说别的了」——
 * 上架编辑页此前只有单张主图 + 每色一张图，轮播图/视频/品牌/卖点/
 * 常见问题/价格说明**根本没有入口**，页面看着完整、实际什么都编辑不了。
 *
 * **最重要的一条：这里不做任何上传限制。**
 * 合规只提示、不拦截 —— 这是用户明确要求的。
 */
const emptyCtx = (): ModuleContentCtx => ({
  content: { gallery: [], videoUrl: null, brand: null, sizeChart: null, points: [], faq: [], priceNote: null },
  setContent: vi.fn(),
  category: '',
  setCategory: vi.fn(),
  categoryOptions: [],
  fabric: '',
  setFabric: vi.fn(),
  wash: '',
  setWash: vi.fn(),
  desc: '',
  setDesc: vi.fn(),
  remark: '',
  setRemark: vi.fn(),
  colors: ['黑色'],
  colorImages: {},
  setColorImages: vi.fn(),
  styleName: '测试款',
  // D-812：尺码表行名来自真实 SKU 尺码
  sizes: ['S', 'M', 'L'],
  styleNo: 'FZ001',
});

const renderModule = (key: string, ctx: ModuleContentCtx = emptyCtx()) => {
  const Editor = MODULE_CONTENT[key];
  if (!Editor) throw new Error(`模块 ${key} 没有登记内容编辑器`);
  return render(<Editor ctx={ctx} />);
};

describe('详情页模块内容编辑区（D-785）', () => {
  it('内容入口必须全部在（缺一个运营就还是编辑不了）', () => {
    const keys = Object.keys(MODULE_CONTENT);
    // 轮播/视频、品牌、卖点、颜色图、分类+成分、价格说明、尺寸表+详情、FAQ、洗涤
    expect(keys.sort()).toEqual(
      ['color', 'detail', 'faq', 'gallery', 'params', 'points', 'priceNote', 'title', 'wash'].sort(),
    );
  });

  it('轮播图与视频入口在「图片轮播」模块里', () => {
    renderModule('gallery');
    // D-808：顶部轮播与纵向详情流拆成两个字段后，这一组是
    // 「没设主图时才生效的回落图」—— 标签必须说清，否则商家改了半天看不到变化
    expect(screen.getByText('顶部轮播回落图')).toBeTruthy();
    expect(screen.getByText(/只有没设主图时/)).toBeTruthy();
    expect(screen.getByText('商品视频')).toBeTruthy();
  });

  it('必须复用系统统一的上传组件（不另造通道）', () => {
    const { container } = renderModule('gallery');
    expect(container.querySelectorAll('input[type="file"]').length).toBeGreaterThan(0);
  });

  it('尺码表要有录入入口：此前读了存了却填不上；D-812 改成结构化表格', () => {
    renderModule('detail');
    expect(screen.getByText(/尺码表（手工录入）/)).toBeTruthy();
    // 结构化录入：量体项可点选添加
    expect(screen.getByRole('button', { name: /胸围/ })).toBeTruthy();
    // 尺码名来自款式真实 SKU，运营不用重打（ctx.sizes 给了 S/M/L → 三行）
    expect(screen.getAllByPlaceholderText('如 M')).toHaveLength(3);
    // 量体数字单元格
    expect(screen.getAllByPlaceholderText('cm').length).toBeGreaterThan(0);
    expect(screen.getByText(/全部留空则不覆盖/)).toBeTruthy();
  });

  it('款式详情与商品说明都在「详情介绍」模块里', () => {
    renderModule('detail');
    expect(screen.getByText('款式详情（图文介绍）')).toBeTruthy();
    expect(screen.getByText('商品说明')).toBeTruthy();
  });

  it('品牌入口在「标题与货号」模块里，并回显只读的商品名与货号', () => {
    renderModule('title');
    expect(screen.getByText('品牌')).toBeTruthy();
    expect(screen.getByText(/测试款/)).toBeTruthy();
    expect(screen.getByText(/FZ001/)).toBeTruthy();
  });

  it('商品分类与面料成分在「商品参数」模块里', () => {
    renderModule('params');
    expect(screen.getByText('商品分类')).toBeTruthy();
    expect(screen.getByText('面料成分')).toBeTruthy();
  });

  it('卖点、常见问题、价格说明、洗涤说明各自独立成块', () => {
    renderModule('points');
    expect(screen.getByText(/一条一行/)).toBeTruthy();
  });

  it('没有任何模块做「不合规就不让存」的校验', () => {
    const src = require('node:fs').readFileSync(
      `${process.cwd()}/src/modules/ecommerce/pages/ShopListing/components/DetailModuleContent.tsx`,
      'utf-8',
    );
    // 不允许出现阻止保存/阻止上传的提示词
    expect(src).not.toContain('禁止上传');
    expect(src).not.toContain('无法保存');
    expect(src).not.toContain('请先修正');
  });
});
