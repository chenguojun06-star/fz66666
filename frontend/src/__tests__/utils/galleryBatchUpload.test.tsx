import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';
import MODULE_CONTENT, { type ModuleContentCtx } from '../../modules/ecommerce/pages/ShopListing/components/DetailModuleContent';
import type { ListingContent } from '../../modules/ecommerce/pages/ShopListing/types';

/**
 * D-837：图片轮播批量加图（点击 / 拖拽 / Ctrl+V 粘贴三方式）。
 * 与 detail-page-editor 的 EditorPagesColumn 同款链路，这里覆盖轮播侧：
 *   ① 拖拽多张 → 逐张上传 → gallery 追加
 *   ② Ctrl+V 粘贴截图 → 上传追加；焦点在输入框时让位
 *   ③ 已满 5 张 → 不再上传（上限保护）
 */

const apiPost = vi.hoisted(() => vi.fn(async () => ({ code: 200, data: 'http://uploaded/g.png' })));
vi.mock('@/utils/api', () => ({ default: { post: apiPost } }));

const baseContent: ListingContent = {
  gallery: ['http://existing/0.jpg'],
  videoUrl: null,
  brand: null,
  sizeChart: null,
  points: [],
  faq: [],
  priceNote: null,
};

function renderGallery(gallery: string[] = baseContent.gallery) {
  const setContent = vi.fn();
  const ctx: ModuleContentCtx = {
    content: { ...baseContent, gallery },
    setContent,
    category: '',
    setCategory: () => undefined,
    categoryOptions: [],
    fabric: '',
    setFabric: () => undefined,
    wash: '',
    setWash: () => undefined,
    desc: '',
    setDesc: () => undefined,
    remark: '',
    setRemark: () => undefined,
    colors: [],
    colorImages: {},
    setColorImages: () => undefined,
    sizes: [],
    styleName: '测试款',
    styleNo: 'D837TEST',
  };
  const Gallery = MODULE_CONTENT.gallery;
  if (!Gallery) throw new Error('MODULE_CONTENT.gallery 不存在');
  render(<Gallery ctx={ctx} />);
  return { setContent };
}

/** 轮播拖放区 = 「批量加图」入口的父容器（内联 outline 虚线那个 div） */
function dropZone(): HTMLElement {
  const entry = document.querySelector('[aria-label="批量加图"]') as HTMLElement | null;
  if (!entry) throw new Error('批量加图入口不存在');
  return entry.parentElement as HTMLElement;
}

const mkFile = (n: string) => new File(['x'], n, { type: 'image/png' });

beforeEach(() => {
  apiPost.mockClear();
  cleanup();
});

describe('D-837 图片轮播批量加图', () => {
  it('拖拽 2 张图 → 逐张上传 → gallery 按顺序追加', async () => {
    const { setContent } = renderGallery();
    fireEvent.drop(dropZone(), {
      dataTransfer: { files: [mkFile('a.png'), mkFile('b.png')], types: ['Files'] },
    });
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(setContent).toHaveBeenCalled());
    const calls = setContent.mock.calls as unknown as Array<[ListingContent]>;
    const last = calls[calls.length - 1][0];
    expect(last.gallery).toEqual(['http://existing/0.jpg', 'http://uploaded/g.png', 'http://uploaded/g.png']);
  });

  it('Ctrl+V 粘贴截图 → 追加轮播图；焦点在输入框时让位不抢', async () => {
    const { setContent } = renderGallery();
    const paste = (target: EventTarget | null, files: File[]) => {
      const ev = Object.assign(new Event('paste', { bubbles: true }), { clipboardData: { files } });
      (target ?? window).dispatchEvent(ev);
    };
    // 焦点在输入框：让位给文本粘贴，不产生上传
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    paste(input, [mkFile('c.png')]);
    expect(apiPost).not.toHaveBeenCalled();
    // 焦点不在输入框：粘贴直接上传追加
    paste(window, [mkFile('c.png')]);
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(setContent).toHaveBeenCalled());
    const calls = setContent.mock.calls as unknown as Array<[ListingContent]>;
    const last = calls[calls.length - 1][0];
    expect(last.gallery).toEqual(['http://existing/0.jpg', 'http://uploaded/g.png']);
    input.remove();
  });

  it('已满 5 张 → 拖拽不再上传（上限保护）', async () => {
    renderGallery(['http://x/1.jpg', 'http://x/2.jpg', 'http://x/3.jpg', 'http://x/4.jpg', 'http://x/5.jpg']);
    fireEvent.drop(dropZone(), { dataTransfer: { files: [mkFile('a.png')], types: ['Files'] } });
    await new Promise((r) => setTimeout(r, 50));
    expect(apiPost).not.toHaveBeenCalled();
  });
});
