import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DetailModuleEditor from '../../modules/ecommerce/pages/ShopListing/components/DetailModuleEditor';
import type { ModuleContentCtx } from '../../modules/ecommerce/pages/ShopListing/components/DetailModuleContent';
import shopAdminApi from '../../services/shop/shopApi';

/**
 * 详情页模块编辑器（D-785，承接 D-770）
 *
 * <b>线上事故</b>：打开商品编辑抽屉时顶部报红 `u.map is not a function`。
 * 根因是 axios 拦截器返回完整信封，组件把 `{}` 当数组 `.map()`。
 *
 * D-818 起信封解包已收口到 shopApi service 层，组件拿到的就是裸数组。
 * 因此这里 mock 的是「service 的真实契约」；信封→裸数据的转换由
 * `shopApiUnwrap.test.ts` 在底层 http 层验证。继续在组件测试里 mock 信封，
 * 等于替实现说谎——组件早已没有解包逻辑，测试却以为它还需要。
 */
const mockApi = vi.hoisted(() => ({
  layoutModules: vi.fn(),
  getStyleLayout: vi.fn(),
  saveStyleLayout: vi.fn(),
}));

vi.mock('@/services/shop/shopApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/shop/shopApi')>();
  return { ...actual, default: { ...actual.default, ...mockApi } };
});

const ctx = (): ModuleContentCtx => ({
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
  colors: [],
  colorImages: {},
  setColorImages: vi.fn(),
  styleName: '测试款',
  // D-812：尺码表行名来自真实 SKU 尺码
  sizes: ['S', 'M', 'L'],
  styleNo: 'FZ001',
});

const DEF_MODULES = [
  { moduleKey: 'gallery', defaultTitle: '图片轮播', canHide: false },
  { moduleKey: 'price', defaultTitle: '价格与库存', canHide: false },
  { moduleKey: 'points', defaultTitle: '核心卖点', canHide: true },
  { moduleKey: 'size', defaultTitle: '尺码选择', canHide: true },
  { moduleKey: 'faq', defaultTitle: '常见问题', canHide: true },
];

beforeEach(() => {
  mockApi.layoutModules.mockReset();
  mockApi.getStyleLayout.mockReset();
  mockApi.saveStyleLayout.mockReset();
});

describe('详情页模块编辑器（service 裸数据契约 + 内容合一）', () => {
  it('service 返回裸数组时正常渲染模块', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_MODULES);
    mockApi.getStyleLayout.mockResolvedValue([]);
    render(<DetailModuleEditor styleId={147} ctx={ctx()} />);
    await waitFor(() => expect(screen.getByText('图片轮播')).toBeTruthy());
    expect(screen.getByText('核心卖点')).toBeTruthy();
    expect(screen.queryByText(/is not a function/)).toBeNull();
  });

  it('布局为空时仍渲染模块定义（全默认开启）', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_MODULES);
    mockApi.getStyleLayout.mockResolvedValue([]);
    render(<DetailModuleEditor styleId={147} ctx={ctx()} />);
    await waitFor(() => expect(screen.getByText('图片轮播')).toBeTruthy());
  });

  it('接口返回非数组的怪东西时降级为空列表，不许把整个区块搞崩', async () => {
    mockApi.layoutModules.mockResolvedValue({ unexpected: 'oops' });
    mockApi.getStyleLayout.mockResolvedValue(null);
    render(<DetailModuleEditor styleId={147} ctx={ctx()} />);
    await waitFor(() => expect(mockApi.layoutModules).toHaveBeenCalled());
    expect(screen.queryByText(/is not a function/)).toBeNull();
  });

  it('不可隐藏的模块必须标出「必需」', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_MODULES);
    mockApi.getStyleLayout.mockResolvedValue([]);
    render(<DetailModuleEditor styleId={147} ctx={ctx()} />);
    await waitFor(() => expect(screen.getAllByText('必需').length).toBe(2));
  });

  it('有内容的模块默认展开，直接能看到这个开关管的是哪段内容', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_MODULES);
    mockApi.getStyleLayout.mockResolvedValue([]);
    render(<DetailModuleEditor styleId={147} ctx={ctx()} />);
    // 「图片轮播」展开后应能看到轮播图输入区
    await waitFor(() => expect(screen.getByText('顶部轮播回落图')).toBeTruthy());
  });

  it('没有内容的模块把来源放进标题旁的图标，点击后可见，不占页面空白', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_MODULES);
    mockApi.getStyleLayout.mockResolvedValue([]);
    render(<DetailModuleEditor styleId={147} ctx={ctx()} />);
    await waitFor(() => expect(screen.getByText('尺码选择')).toBeTruthy());
    // 说明统一收进标题旁的感叹号图标（悬停/点击查看）
    const hints = screen.getAllByLabelText('说明');
    fireEvent.click(hints[3]);
    await waitFor(() => expect(screen.getByText('尺码名来自 SKU，不用在这里填。')).toBeTruthy());
  });

  it('每个模块的顾客端说明都可在标题旁悬停查看，且不铺满页面', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_MODULES);
    mockApi.getStyleLayout.mockResolvedValue([]);
    render(<DetailModuleEditor styleId={147} ctx={ctx()} />);
    await waitFor(() => expect(screen.getByText('价格与库存')).toBeTruthy());
    // D-808：说明必须说清真实优先级 —— D-801 之后「设了主图就以主图为准」，
    // 原文案「这里配的图会盖过主图」已经不成立，留在页面上是在骗运营
    // （他们会改半天看不到任何变化）。
    fireEvent.click(screen.getAllByLabelText('说明')[0]);
    await waitFor(() => expect(screen.getByText(/只有没设主图时/)).toBeTruthy());
    // 有编辑器的模块才渲染内容区；无编辑器的模块不铺说明块
    expect(document.querySelectorAll('.shop-module-item-body').length).toBeGreaterThan(0);
  });
});
