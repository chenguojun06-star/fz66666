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
    expect(screen.getByText('轮播图')).toBeTruthy();
    expect(screen.getByText('商品视频')).toBeTruthy();
  });

  it('必须复用系统统一的上传组件（不另造通道）', () => {
    const { container } = renderModule('gallery');
    expect(container.querySelectorAll('input[type="file"]').length).toBeGreaterThan(0);
  });

  it('尺寸表要有输入框：此前读了存了却没有任何入口，永远填不上', () => {
    renderModule('detail');
    expect(screen.getByText('尺寸表')).toBeTruthy();
    // 「留空即自动生成」是 placeholder 提示，不是正文
    const ta = screen.getByPlaceholderText(/留空即自动生成，无需手填/) as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    expect(screen.getByText(/默认按 SKU 的颜色 × 尺码矩阵/)).toBeTruthy();
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
