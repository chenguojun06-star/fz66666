import type { DetailBlock } from '../../types';
import type { EditorPage, SizeTableElement, TextElement } from './types';
import { DEFAULT_PAGE_H, DEFAULT_PAGE_W, uid } from './types';

/**
 * D-835：旧数据（图+文交错块）↔ 页面模型 的双向映射。
 *
 * <p><b>打开时（blocksToPages）</b>：图片块 → 页面底图；文字块 → 挂到前一张图的
 * 覆盖文字（anchorBottom，底图加载后重排到页面底部）——这与 D-810「作为上一张图
 * 的说明」的语义一致，内容不会丢。
 *
 * <p><b>保存时（pagesToBlocks）</b>：每页烘焙成图片后输出纯图片块，
 * C 端渲染链路不变（见 exportPages.ts）。
 */

/** 富文本 → 画布纯文本：块级标签转换行，压缩空白 */
export function htmlToPlain(html: string): string {
  if (!html) return '';
  const host = document.createElement('div');
  host.innerHTML = html;
  host.querySelectorAll('br').forEach((n) => n.replaceWith('\n'));
  ['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr'].forEach((tag) => {
    host.querySelectorAll(tag).forEach((n) => n.append('\n'));
  });
  return (host.textContent ?? '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function newPage(bgUrl: string | null): EditorPage {
  return { id: uid('pg'), bgUrl, bgW: DEFAULT_PAGE_W, bgH: DEFAULT_PAGE_H, bgOpacity: 100, bgBlur: 0, elements: [] };
}

export function blocksToPages(blocks: DetailBlock[]): EditorPage[] {
  const pages: EditorPage[] = [];
  for (const b of blocks) {
    if (b.type === 'image') {
      pages.push(newPage(b.url));
      continue;
    }
    const plain = htmlToPlain(b.content);
    if (!plain) continue;
    const el: TextElement = {
      id: uid('el'),
      kind: 'text',
      content: plain,
      fontSize: 28,
      color: '#333333',
      align: 'center',
      opacity: 100,
      w: DEFAULT_PAGE_W - 80,
      x: 40,
      y: 0,
      anchorBottom: true,
    };
    const last = pages[pages.length - 1];
    if (last) last.elements.push(el);
    else {
      const first = newPage(null);
      first.elements.push(el);
      pages.push(first);
    }
  }
  return pages;
}

/** 估算文字元素在页面坐标下的高度（导出/重排用，允许误差） */
export function estimateTextH(el: TextElement): number {
  const perLine = Math.max(4, Math.floor(el.w / (el.fontSize || 28)));
  const lines = el.content
    .split('\n')
    .reduce((sum, seg) => sum + Math.max(1, Math.ceil(seg.length / perLine)), 0);
  return lines * el.fontSize * 1.5 + 8;
}

/**
 * 底图加载后：按原图尺寸定页面坐标系，并把 anchorBottom 的迁移文字
 * 从页面底部向上依次排开（排完清除标记，后续保存/导出不再特判）。
 */
export function settlePageAfterBgLoad(page: EditorPage, natW: number, natH: number): EditorPage {
  const anchored = page.elements.filter((e): e is TextElement => e.kind === 'text' && !!e.anchorBottom);
  if (page.bgW === natW && page.bgH === natH && anchored.length === 0) return page;
  let y = natH - 40;
  const positioned = new Map<string, { x: number; y: number; w: number }>();
  [...anchored].reverse().forEach((el) => {
    const h = estimateTextH({ ...el, fontSize: el.fontSize || 28 });
    y -= h;
    positioned.set(el.id, { x: 40, y: Math.max(20, y), w: natW - 80 });
    y -= 24;
  });
  return {
    ...page,
    bgW: natW,
    bgH: natH,
    elements: page.elements.map((e) => {
      const pos = positioned.get(e.id);
      return e.kind === 'text' && pos ? { ...e, ...pos, anchorBottom: false } : e;
    }),
  };
}

/** sizeChart 落库格式：{cols, rows} JSON；旧数据可能是竖线文本（返回 null 走兜底） */
export function parseSizeChart(v: string | null): { cols: string[]; rows: string[][] } | null {
  if (!v || !v.trim().startsWith('{')) return null;
  try {
    const o = JSON.parse(v) as { cols?: unknown; rows?: unknown };
    if (!Array.isArray(o.cols) || !Array.isArray(o.rows) || o.cols.length < 2 || o.rows.length === 0) return null;
    return {
      cols: (o.cols as unknown[]).map((c) => String(c ?? '')),
      rows: (o.rows as unknown[]).map((r) => (Array.isArray(r) ? (r as unknown[]).map((c) => String(c ?? '')) : [])),
    };
  } catch {
    return null;
  }
}

/** 「尺码」页签：优先用已录入的尺码表，没有则按 SKU 尺码生成空表 */
export function buildSizeTableData(sizeChart: string | null, sizes: string[]): { cols: string[]; rows: string[][] } {
  const parsed = parseSizeChart(sizeChart);
  if (parsed) return parsed;
  const cols = ['部位', ...sizes.slice(0, 6)];
  if (cols.length < 2) cols.push('S', 'M', 'L');
  return {
    cols,
    rows: [['建议身高', ...cols.slice(1).map(() => '')], ['胸围', ...cols.slice(1).map(() => '')]].map((r) =>
      r.map((c) => c ?? ''),
    ),
  };
}

/**
 * 是否需要重新烘焙：页面干净（无元素、底图未调）时保存直接沿用原图，
 * 不重压缩、不重传 —— 原图画质和 URL 都不动。
 */
export function needsBake(p: EditorPage): boolean {
  return !p.bgUrl || p.elements.length > 0 || p.bgOpacity !== 100 || p.bgBlur > 0;
}

/** 判断 sizeTable 元素（类型收窄用） */
export const isSizeTable = (e: EditorPage['elements'][number]): e is SizeTableElement => e.kind === 'sizeTable';
