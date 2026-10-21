import html2canvas from 'html2canvas';
import api from '@/utils/api';
import type { EditorElement, EditorPage } from './types';

/**
 * D-835：页面烘焙导出 —— 把「底图 + 覆盖元素」合成为一张最终图。
 *
 * <p><b>为什么烘焙而不是存元素</b>：竞品同款做法（「保存图片」）。详情保存后
 * 仍是一组图片，C 端、小程序、平台同步的渲染链路零改动；
 * 代价是保存后覆盖元素不可再单独编辑（重新打开编辑器是在合成图上继续叠），
 * 这是「保存图片」语义的固有取舍，竞品一致。
 *
 * <p><b>尺寸模式</b>：origin = 与原图一致（页面坐标系即底图自然尺寸）；
 * w750 = 统一压到 750 宽（html2canvas scale 实现，不用 CSS transform，
 * 避免克隆渲染时的缩放误差）。
 */

export type ExportMode = 'origin' | 'w750';

const px = (n: number) => `${Math.round(n)}px`;

function buildElNode(el: EditorElement): HTMLElement {
  const div = document.createElement('div');
  div.style.cssText = `position:absolute;left:${px(el.x)};top:${px(el.y)};width:${px(el.w)};opacity:${el.opacity / 100};`;
  if (el.kind === 'text') {
    div.style.cssText += [
      `white-space:pre-wrap`,
      `word-break:break-all`,
      `font-size:${px(el.fontSize)}`,
      `line-height:1.5`,
      `color:${el.color}`,
      el.bold ? `font-weight:700` : ``,
      `text-align:${el.align ?? 'center'}`,
    ].filter(Boolean).join(';');
    div.textContent = el.content;
    return div;
  }
  if (el.kind === 'shape') {
    div.style.cssText += `height:${px(el.h)};background:${el.color};`;
    if (el.shape === 'circle') div.style.cssText += `border-radius:50%;`;
    return div;
  }
  // 尺码表
  div.style.cssText += `font-size:${px(el.fontSize)};`;
  const table = document.createElement('table');
  table.style.cssText = `border-collapse:collapse;width:100%;table-layout:fixed;background:#ffffff;`;
  const mkCell = (tag: string, text: string, head: boolean) => {
    const c = document.createElement(tag);
    c.style.cssText = `border:1px solid #c9c9c9;padding:6px 8px;text-align:center;color:#333333;${
      head ? 'background:#f2f2f2;font-weight:600;' : ''
    }`;
    c.textContent = text;
    return c;
  };
  const thead = table.createTHead();
  const hr = thead.insertRow();
  el.cols.forEach((c) => hr.appendChild(mkCell('th', c, true)));
  const tb = table.createTBody();
  el.rows.forEach((row) => {
    const tr = tb.insertRow();
    el.cols.forEach((_, i) => tr.appendChild(mkCell('td', row[i] ?? '', false)));
  });
  div.appendChild(table);
  return div;
}

/** 页面干净时保存直接沿用原图，不重压缩不重传 */
export function needsBake(p: EditorPage): boolean {
  return !p.bgUrl || p.elements.length > 0 || p.bgOpacity !== 100 || p.bgBlur > 0;
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图片合成失败，请重试'))), 'image/jpeg', 0.92);
  });
}

/** 把一页烘成 Blob（jpg，白底） */
export async function bakePage(page: EditorPage, mode: ExportMode): Promise<Blob> {
  const scale = mode === 'w750' ? 750 / page.bgW : 1;
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${px(page.bgW)};height:${px(page.bgH)};overflow:hidden;z-index:-1;background:#ffffff;`;
  const inner = document.createElement('div');
  inner.style.cssText = `position:relative;width:${px(page.bgW)};height:${px(page.bgH)};overflow:hidden;background:#ffffff;`;
  if (page.bgUrl) {
    const img = document.createElement('img');
    img.src = page.bgUrl;
    img.crossOrigin = 'anonymous';
    img.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;object-fit:fill;opacity:${page.bgOpacity / 100};${
      page.bgBlur > 0 ? `filter:blur(${page.bgBlur}px);` : ''
    }`;
    inner.appendChild(img);
    // 等图解码完成再烘，避免偶发空白底图
    await new Promise<void>((resolve) => {
      if (img.complete) return resolve();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // 底图挂了也继续烘（白底 + 元素），不让保存整单失败
    });
  }
  page.elements.forEach((el) => inner.appendChild(buildElNode(el)));
  host.appendChild(inner);
  document.body.appendChild(host);
  try {
    const canvas = await html2canvas(inner, {
      scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: false,
      logging: false,
    });
    return await canvasToBlob(canvas);
  } finally {
    host.remove();
  }
}

export async function uploadBlob(blob: Blob, idx: number): Promise<string> {
  const fd = new FormData();
  fd.append('file', blob, `detail-page-${idx + 1}.jpg`);
  const res = await api.post<{ code: number; data: string; message?: string }>('/common/upload', fd);
  if (res.code !== 200 || !res.data) throw new Error(res.message || '图片上传失败');
  return res.data;
}
