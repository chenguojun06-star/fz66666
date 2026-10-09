import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ListingContentSection, {
  type ListingContent,
} from '../../modules/ecommerce/pages/ShopListing/components/ListingContentSection';

/**
 * 详情内容编辑区（D-782）
 *
 * 用户诉求原话：「最基本的图片都上传不了，更别说别的了」——
 * 上架编辑页此前只有单张主图 + 每色一张图，轮播图/视频/品牌/卖点/
 * 常见问题/价格说明**根本没有入口**，页面看着完整、实际什么都编辑不了。
 *
 * **最重要的一条：这里不做任何上传限制。**
 * 合规只提示、不拦截 —— 这是用户明确要求的。
 */
const empty: ListingContent = {
  gallery: [], videoUrl: null, brand: null, sizeChart: null,
  points: [], faq: [], priceNote: null,
};

const setup = () => {
  const setContent = vi.fn();
  render(<ListingContentSection content={empty} setContent={setContent} />);
  return { setContent };
};

describe('详情内容编辑区（D-782）', () => {
  it('六个内容入口必须全部在（缺一个运营就还是编辑不了）', () => {
    setup();
    expect(screen.getByText('轮播图')).toBeTruthy();
    expect(screen.getByText('商品视频')).toBeTruthy();
    expect(screen.getByText('品牌')).toBeTruthy();
    expect(screen.getByText('核心卖点')).toBeTruthy();
    expect(screen.getByText('常见问题')).toBeTruthy();
    expect(screen.getByText('价格说明')).toBeTruthy();
  });

  it('必须复用系统统一的上传组件（不另造通道）', () => {
    const { container } = render(
      <ListingContentSection content={empty} setContent={vi.fn()} />
    );
    // ImageUploadBox 内部是 file input + 点击/拖拽/粘贴
    const inputs = container.querySelectorAll('input[type="file"]');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('必须显式声明「这里不做上传限制」，避免又做出拦截式提示', () => {
    setup();
    expect(screen.getByText('这里不做上传限制')).toBeTruthy();
  });

  it('空态展示「加图」入口，运营能直接上传第一张', () => {
    setup();
    expect(screen.getByText('加图')).toBeTruthy();
  });

  it('已有图时展示封面标记与排序/删除操作', () => {
    const content = { ...empty, gallery: ['/a.png', '/b.png', '/c.png'] };
    const { container } = render(
      <ListingContentSection content={content} setContent={vi.fn()} />
    );
    expect(screen.getByText('封面')).toBeTruthy();
    expect(screen.getByText('第2张')).toBeTruthy();
    expect(screen.getByText('第3张')).toBeTruthy();
    // 3 张图 + 1 个加图入口 + 1 个视频上传 = 5 个 file input
    expect(container.querySelectorAll('input[type="file"]').length).toBe(5);
  });

  it('加卖点后能写入内容', async () => {
    const { setContent } = setup();
    // 「加一条」有两处（卖点/常见问题），按顺序取第一个 = 卖点
    const addBtns = screen.getAllByText('加一条');
    (addBtns[0].closest('button') as HTMLElement).click();
    await waitFor(() => expect(setContent).toHaveBeenCalled());
    const arg = setContent.mock.calls[0][0] as ListingContent;
    expect(arg.points).toHaveLength(1);
  });

  it('品牌可直接输入', async () => {
    const { setContent } = setup();
    const brandInput = screen.getByPlaceholderText(/展示在详情页标题下方/) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )!.set!;
    setter.call(brandInput, '云裳严选');
    brandInput.dispatchEvent(new Event('input', { bubbles: true }));
    await waitFor(() => expect(setContent).toHaveBeenCalled());
    const calls = setContent.mock.calls;
    expect((calls[calls.length - 1][0] as ListingContent).brand).toBe('云裳严选');
  });

  it('卖点条数达上限后不能再加', () => {
    const content = { ...empty, points: Array.from({ length: 8 }, (_, i) => `卖点${i}`) };
    render(<ListingContentSection content={content} setContent={vi.fn()} />);
    const addBtn = screen.getAllByText('加一条')[0].closest('button') as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
  });
});