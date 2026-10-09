import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LayoutEditorSection from '../../modules/ecommerce/pages/ShopListing/components/LayoutEditorSection';
import shopAdminApi from '../../services/shop/shopApi';

/**
 * 详情页布局编辑区（D-770）
 *
 * <b>线上事故</b>：打开商品编辑抽屉时顶部报红 `u.map is not a function`，
 * 整个「详情页布局」区块加载不出来。
 *
 * 根因：axios 响应拦截器是 `return response.data`，而后端返回的是**完整信封**
 * `{code, message, data, requestId}` —— 所以 `shopAdminApi.layoutModules()`
 * 拿到的是信封对象而不是数组。代码写成 `(defs || []).map(...)`，
 * 而 `{}` 是 truthy，`|| []` 兜不住，对象没有 .map → TypeError。
 *
 * 这个坑仓库里早就有 unwrap.ts，但这个区块当时没用上。
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

const DEF_ENVELOPE = {
  code: 200,
  message: '操作成功',
  data: [
    { moduleKey: 'gallery', defaultTitle: '图片轮播', canHide: false },
    { moduleKey: 'price', defaultTitle: '价格与库存', canHide: false },
    { moduleKey: 'points', defaultTitle: '核心卖点', canHide: true },
    { moduleKey: 'faq', defaultTitle: '常见问题', canHide: true },
  ],
};

beforeEach(() => {
  mockApi.layoutModules.mockReset();
  mockApi.getStyleLayout.mockReset();
  mockApi.saveStyleLayout.mockReset();
});

describe('详情页布局编辑区（信封解包）', () => {
  it('拿到信封时必须正常渲染出模块，不能抛 map is not a function', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_ENVELOPE);
    mockApi.getStyleLayout.mockResolvedValue({ code: 200, data: [] });
    render(<LayoutEditorSection styleId={147} />);
    await waitFor(() => expect(screen.getByText('图片轮播')).toBeTruthy());
    expect(screen.getByText('核心卖点')).toBeTruthy();
    expect(screen.queryByText(/is not a function/)).toBeNull();
  });

  it('拿到已解包数组时同样正常（接口形态不能假设只有一种）', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_ENVELOPE.data);
    mockApi.getStyleLayout.mockResolvedValue([]);
    render(<LayoutEditorSection styleId={147} />);
    await waitFor(() => expect(screen.getByText('图片轮播')).toBeTruthy());
  });

  it('接口返回非数组的怪东西时降级为空列表，不许把整个区块搞崩', async () => {
    mockApi.layoutModules.mockResolvedValue({ code: 200, data: 'oops' });
    mockApi.getStyleLayout.mockResolvedValue({ code: 200, data: null });
    render(<LayoutEditorSection styleId={147} />);
    // 至少不能抛未捕获异常
    await waitFor(() => expect(mockApi.layoutModules).toHaveBeenCalled());
    expect(screen.queryByText(/is not a function/)).toBeNull();
  });

  it('必留模块（gallery/price）必须标出且不可关', async () => {
    mockApi.layoutModules.mockResolvedValue(DEF_ENVELOPE);
    mockApi.getStyleLayout.mockResolvedValue({ code: 200, data: [] });
    render(<LayoutEditorSection styleId={147} />);
    await waitFor(() => expect(screen.getAllByText('必需').length).toBe(2));
  });
});