import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import {
  blocksToPages,
  buildSizeTableData,
  estimateTextH,
  htmlToPlain,
  needsBake,
  parseSizeChart,
  settlePageAfterBgLoad,
} from '../../modules/ecommerce/pages/ShopListing/components/detail-page-editor/mapping';
import type { EditorPage, TextElement } from '../../modules/ecommerce/pages/ShopListing/components/detail-page-editor/types';
import DetailPageEditor from '../../modules/ecommerce/pages/ShopListing/components/detail-page-editor/DetailPageEditor';
import type { DetailBlock } from '../../modules/ecommerce/pages/ShopListing/types';

vi.mock('@/utils/antdStatic', () => ({
  message: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const apiPost = vi.hoisted(() => vi.fn(async () => ({ code: 200, data: 'http://uploaded/x.png' })));
vi.mock('@/utils/api', () => ({ default: { post: apiPost } }));

describe('D-835 映射层：旧 blocks ↔ 页面模型', () => {
  it('htmlToPlain：块级标签转换行、压空白、去标签', () => {
    const html = '<p><strong>卖点</strong></p><ul><li>透气</li><li>显瘦</li></ul><p>  多  空  白 </p>';
    expect(htmlToPlain(html)).toBe('卖点\n透气\n显瘦\n多 空 白');
  });

  it('blocksToPages：图片块成页，文字块挂到前一页底部（anchorBottom）', () => {
    const blocks: DetailBlock[] = [
      { type: 'image', url: 'http://x/1.jpg' },
      { type: 'text', content: '<p>图注说明</p>', caption: true },
      { type: 'text', content: '<p>独立文字</p>' },
      { type: 'image', url: 'http://x/2.jpg' },
    ];
    const pages = blocksToPages(blocks);
    expect(pages).toHaveLength(2);
    expect(pages[0].bgUrl).toBe('http://x/1.jpg');
    expect(pages[0].elements).toHaveLength(2); // 两条文字都挂到第一张图
    expect(pages[0].elements.every((e) => e.kind === 'text' && e.anchorBottom)).toBe(true);
    expect((pages[0].elements[0] as TextElement).content).toBe('图注说明');
    expect(pages[1].bgUrl).toBe('http://x/2.jpg');
    expect(pages[1].elements).toHaveLength(0);
  });

  it('blocksToPages：开头就是文字 → 生成白底文字页，不丢内容', () => {
    const pages = blocksToPages([{ type: 'text', content: '<p>开头文字</p>' }]);
    expect(pages).toHaveLength(1);
    expect(pages[0].bgUrl).toBeNull();
    expect((pages[0].elements[0] as TextElement).content).toBe('开头文字');
  });

  it('settlePageAfterBgLoad：按原图定坐标系，迁移文字从底部向上排并清标记', () => {
    const [page] = blocksToPages([
      { type: 'image', url: 'u' },
      { type: 'text', content: '<p>说明</p>' },
    ]);
    const settled = settlePageAfterBgLoad(page, 750, 1600);
    expect(settled.bgW).toBe(750);
    expect(settled.bgH).toBe(1600);
    const el = settled.elements[0] as TextElement;
    expect(el.anchorBottom).toBeFalsy();
    expect(el.y + estimateTextH(el as never)).toBeLessThanOrEqual(1600);
    expect(el.w).toBe(750 - 80);
  });

  it('settlePageAfterBgLoad：尺寸相同且无迁移文字时返回原引用（跳过重排）', () => {
    const page: EditorPage = {
      id: 'p', bgUrl: 'u', bgW: 750, bgH: 1000, bgOpacity: 100, bgBlur: 0,
      elements: [{ id: 'e', kind: 'shape', shape: 'rect', color: '#000', x: 0, y: 0, w: 10, h: 10, opacity: 100 }],
    };
    expect(settlePageAfterBgLoad(page, 750, 1000)).toBe(page);
  });
});

describe('D-835 尺码表与烘焙判定', () => {
  it('parseSizeChart：识别 {cols,rows} JSON，拒绝旧竖线文本', () => {
    expect(parseSizeChart('{"cols":["部位","S"],"rows":[["身高","160"]]}')).toEqual({
      cols: ['部位', 'S'],
      rows: [['身高', '160']],
    });
    expect(parseSizeChart('部位|S|M')).toBeNull();
    expect(parseSizeChart(null)).toBeNull();
  });

  it('buildSizeTableData：无尺码表时按 SKU 尺码生成兜底列', () => {
    const data = buildSizeTableData(null, ['S(155/80A)', 'M(160/84A)']);
    expect(data.cols).toEqual(['部位', 'S(155/80A)', 'M(160/84A)']);
    expect(data.rows.length).toBeGreaterThan(0);
  });

  it('needsBake：干净页沿用原图不重烘；有元素/调过图/白页都要烘', () => {
    const clean: EditorPage = { id: 'p', bgUrl: 'u', bgW: 750, bgH: 1000, bgOpacity: 100, bgBlur: 0, elements: [] };
    expect(needsBake(clean)).toBe(false);
    expect(needsBake({ ...clean, bgOpacity: 80 })).toBe(true);
    expect(needsBake({ ...clean, bgBlur: 2 })).toBe(true);
    expect(needsBake({ ...clean, elements: [{ id: 'e', kind: 'text', content: 'x', fontSize: 20, color: '#000', w: 100, x: 0, y: 0, opacity: 100 }] })).toBe(true);
    expect(needsBake({ ...clean, bgUrl: null })).toBe(true);
  });
});

describe('D-835 编辑器冒烟：布局与交互入口', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  const renderEditor = (blocks: DetailBlock[] = [{ type: 'image', url: 'http://x/1.jpg' }]) =>
    render(
      <DetailPageEditor
        open
        blocks={blocks}
        sizeChart={null}
        sizes={['S', 'M']}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

  it('打开即出三栏骨架：左页签 + 页面列表 + 顶栏撤销/重做/清空 + 底部保存图片', async () => {
    renderEditor();
    expect(await screen.findByRole('tab', { name: /模版/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /素材/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /文字/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /尺码/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /形状/ })).toBeTruthy();
    expect(screen.getByText('详情图1')).toBeTruthy();
    expect(screen.getByRole('button', { name: '撤销' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '重做' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '清空当前页' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '保存图片' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '保存模版' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '退出编辑' })).toBeTruthy();
  });

  it('「文字」页签插入文字元素后，画布出现该文字且可撤销', async () => {
    renderEditor();
    fireEvent.click(await screen.findByRole('tab', { name: /文字/ }));
    fireEvent.click(screen.getByRole('button', { name: /正文/ }));
    expect(document.querySelector('.dpe-el')?.textContent).toContain('在这里输入正文内容');
    // 撤销后元素消失（历史快照机制生效）
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(document.querySelector('.dpe-el')).toBeNull();
  });

  it('「尺码」页签插入尺码表元素（表头来自 SKU 尺码）', async () => {
    renderEditor();
    fireEvent.click(await screen.findByRole('tab', { name: /尺码/ }));
    fireEvent.click(screen.getByRole('button', { name: '插入尺码表' }));
    const table = document.querySelector('.dpe-el__table');
    expect(table).toBeTruthy();
    expect(table?.textContent).toContain('部位');
    expect(table?.textContent).toContain('S');
  });

  it('选中底图后右侧出现「图片」面板（替换图片/透明度/模糊/批量应用）', async () => {
    renderEditor();
    const bg = document.querySelector('.dpe-stage .dpe-page__bg') as HTMLElement; // 舞台里的底图（左栏缩略图也有同 class，须限定）
    expect(bg).toBeTruthy();
    fireEvent.mouseDown(bg);
    expect(await screen.findByText('批量应用到全部页面')).toBeTruthy();
    expect(screen.getByRole('button', { name: '替换图片' })).toBeTruthy();
  });

  it('D-836 批量导入三方式：拖拽 2 张图到页面列表 → 按顺序各成一页', async () => {
    renderEditor([{ type: 'image', url: 'http://x/1.jpg' }, { type: 'image', url: 'http://x/2.jpg' }]);
    const zone = document.querySelector('.dpe-left__pages') as HTMLElement;
    const mk = (n: string) => new File(['x'], n, { type: 'image/png' });
    fireEvent.drop(zone, { dataTransfer: { files: [mk('a.png'), mk('b.png')], types: ['Files'] } });
    await waitFor(() => expect(document.querySelectorAll('.dpe-left__page')).toHaveLength(4));
    expect(apiPost).toHaveBeenCalledTimes(2);
    // 顺序稳定：先选的 a 在前（缩略图 img src 按上传返回顺序）
    const thumbs = Array.from(document.querySelectorAll('.dpe-left__page img'));
    expect(thumbs[2].getAttribute('src')).toContain('http://uploaded/x.png');
  });

  it('D-836 批量导入三方式：Ctrl+V 粘贴图片成页；焦点在文本框时让位不抢', async () => {
    renderEditor([]);
    const paste = (target: EventTarget | null, files: File[]) => {
      const ev = Object.assign(new Event('paste', { bubbles: true }), { clipboardData: { files } });
      (target ?? window).dispatchEvent(ev);
    };
    // 焦点在文本输入框：粘贴不抢（不产生新页）
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    paste(input, [new File(['x'], 'c.png', { type: 'image/png' })]);
    expect(document.querySelectorAll('.dpe-left__page')).toHaveLength(0);
    // 焦点不在输入框：粘贴截图直接成页
    paste(window, [new File(['x'], 'c.png', { type: 'image/png' })]);
    await waitFor(() => expect(document.querySelectorAll('.dpe-left__page')).toHaveLength(1));
    input.remove();
  });
});
