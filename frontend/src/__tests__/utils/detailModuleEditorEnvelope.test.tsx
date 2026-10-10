import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DetailModuleEditor from '../../modules/ecommerce/pages/ShopListing/components/DetailModuleEditor';
import type { ModuleContentCtx } from '../../modules/ecommerce/pages/ShopListing/components/DetailModuleContent';
import shopAdminApi from '../../services/shop/shopApi';

/**
 * 详情页模块编辑器（D-785，承接 D-770）
 *
 * <b>线上事故</b>：打开商品编辑抽屉时顶部报红 `u.map is not a function`，
 * 整个布局区块加载不出来。
 *
 * 根因：axios 响应拦截器是 `return response.data`，而后端返回的是**完整信封**
 * `{code, message, data, requestId}` —— 所以 `shopAdminApi.layoutModules()`
 * 拿到的是信封对象而不是数组。代码写成 `(defs || []).map(...)`，
 * 而 `{}` 是 truthy，`|| []` 兜不住，对象没有 .map → TypeError。
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
  styleNo: 'FZ001',
});

const DEF_ENVELOPE = {
  code: 200,
  message: '操作成功',
  data: [
    { moduleKey: 'gallery', defaultTitle: '图片轮播', canHide: false },
    { moduleKey: 'price', defaultTitle: '价格与库存', canHide: false },
    { moduleKey: 'points', defaultTitle: '核心卖点', canHide: true },
    { moduleKey: 'size', defaultTitle: '尺码选择', canHide: true },
    { moduleKey: 'faq', defaultTitle: '常见问题', canHide: true },
  ],
};

beforeEach(() => {
  mockApi.layoutModules.mockReset();
  mockApi.getStyleLayout.mockReset();
  mockApi.saveStyleLayout.mockReset();
});

describe('详情页模块编辑器（信封解包 + 内容合一）', () => {
  it('拿到信封时必须正常渲染出模块，不能抛 map is not a function', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_ENVELOPE);
    mockApi.getStyleLayout.mockResolvedValue({ code: 200, data: [] });
    render(<DetailModuleEditor styleId={147} ctx={ctx()} />);
    await waitFor(() => expect(screen.getByText('图片轮播')).toBeTruthy());
    expect(screen.getByText('核心卖点')).toBeTruthy();
    expect(screen.queryByText(/is not a function/)).toBeNull();
  });

  it('拿到已解包数组时同样正常（接口形态不能假设只有一种）', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_ENVELOPE.data);
    mockApi.getStyleLayout.mockResolvedValue([]);
    render(<DetailModuleEditor styleId={147} ctx={ctx()} />);
    await waitFor(() => expect(screen.getByText('图片轮播')).toBeTruthy());
  });

  it('接口返回非数组的怪东西时降级为空列表，不许把整个区块搞崩', async () => {
    mockApi.layoutModules.mockResolvedValue({ code: 200, data: 'oops' });
    mockApi.getStyleLayout.mockResolvedValue({ code: 200, data: null });
    render(<DetailModuleEditor styleId={147} ctx={ctx()} />);
    await waitFor(() => expect(mockApi.layoutModules).toHaveBeenCalled());
    expect(screen.queryByText(/is not a function/)).toBeNull();
  });

  it('不可隐藏的模块必须标出「必需」', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_ENVELOPE);
    mockApi.getStyleLayout.mockResolvedValue({ code: 200, data: [] });
    render(<DetailModuleEditor styleId={147} ctx={ctx()} />);
    await waitFor(() => expect(screen.getAllByText('必需').length).toBe(2));
  });

  it('有内容的模块默认展开，直接能看到这个开关管的是哪段内容', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_ENVELOPE);
    mockApi.getStyleLayout.mockResolvedValue({ code: 200, data: [] });
    render(<DetailModuleEditor styleId={147} ctx={ctx()} />);
    // 「图片轮播」展开后应能看到轮播图输入区
    await waitFor(() => expect(screen.getByText('轮播图')).toBeTruthy());
  });

  it('没有内容的模块要说清来源，而不是留一个空输入框', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_ENVELOPE);
    mockApi.getStyleLayout.mockResolvedValue({ code: 200, data: [] });
    render(<DetailModuleEditor styleId={147} ctx={ctx()} />);
    await waitFor(() => expect(screen.getByText('尺码选择')).toBeTruthy());
    // 无内容的模块默认折叠，展开后才看到来源说明
    fireEvent.click(screen.getByText('尺码选择'));
    await waitFor(() => expect(screen.getByText('尺码名来自 SKU，不用在这里填。')).toBeTruthy());
  });

  it('每个模块都要有一句顾客端说明，避免商家猜开关作用', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_ENVELOPE);
    mockApi.getStyleLayout.mockResolvedValue({ code: 200, data: [] });
    render(<DetailModuleEditor styleId={147} ctx={ctx()} />);
    await waitFor(() => expect(screen.getByText('价格与库存')).toBeTruthy());
    expect(screen.getByText(/售价、库存与配送/)).toBeTruthy();
  });
});
