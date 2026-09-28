/**
 * 批量打印合并模板（D-611）
 *
 * 把 N 张单的正文合并成一份 HTML 文档、一次打印：
 * - 每单 = 顶部大标题（工厂名 - 单据类型，与单一打印同一形态）+ 正文 + 打印人/时间页脚
 * - 单与单之间插 page-break 强制分页
 * - 页码由 safePrint 统一注入 @page 边距盒（D-520），counter(pages) 按整份文档计数，
 *   合并后自动得到整批连续页码（第 X 页 / 共 Y 页）
 * - 头部样式复用 buildPrintBaseCss（与单一打印同源），正文区块样式复用 STYLE_PRINT_CONTENT_CSS
 */
import { buildPrintBaseCss } from './printTemplate';
import { STYLE_PRINT_CONTENT_CSS } from './stylePrintContentCss';

const escHtml = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 与 buildPrintHtml 同一规则：按 fontScale 改写内联 font-size 与共享 CSS 里的固定 px 值 */
function scaleFontSize(html: string, fs: number): string {
  if (fs === 1) return html;
  return html.replace(/font-size:\s*([\d.]+)px/gi, (_m, n) => `font-size:${+(parseFloat(n) * fs).toFixed(1)}px`);
}

export interface BatchPrintDocInput {
  /** 款号（<title> 用） */
  styleNo: string;
  /** 单据标题，如「大货生产单」「样衣开发单」（getModePageTitle(mode)） */
  pageTitle: string;
  /** 单据正文 HTML：共享正文组件静态渲染的产物（不含 <style>，样式由本文档统一注入） */
  bodyHtml: string;
  /** 打印人信息，如「打印人: 张三 (zhangsan)」 */
  printerInfo: string;
  /** 打印时间字符串 */
  printDate: string;
}

export function buildBatchPrintHtml({
  docs, tenantName, fontScale = 1,
}: {
  docs: BatchPrintDocInput[];
  tenantName?: string;
  fontScale?: number;
}): string {
  const fs = Number(fontScale) > 0 ? Number(fontScale) : 1;
  const px = (n: number) => `${+(n * fs).toFixed(1)}px`;

  const factory = tenantName?.trim() || '';
  const chunks = docs.map((doc) => {
    const title = doc.pageTitle?.trim() || '';
    const displayText = title ? (factory ? `${factory} - ${title}` : title) : factory;
    const header = displayText
      ? `<div style="text-align:center;font-size:${px(22)};font-weight:700;color:var(--color-black);margin-bottom:14px;letter-spacing:1px;">${escHtml(displayText)}</div>`
      : '';
    return `${header}
        <div class="print-body">
          ${scaleFontSize(doc.bodyHtml, fs)}
        </div>
        <div class="print-footer">
          <span class="print-footer-right">${escHtml(doc.printerInfo)}  |  打印时间: ${escHtml(doc.printDate)}</span>
        </div>`;
  });

  const pageBreak = '<div style="break-after:page;page-break-after:always;"></div>';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>批量打印 - ${escHtml(docs.length)} 单</title>
  <style>${buildPrintBaseCss(fs)}</style>
  <style>${scaleFontSize(STYLE_PRINT_CONTENT_CSS, fs)}</style>
</head>
<body>
  ${chunks.join(`\n  ${pageBreak}\n`)}
</body>
</html>`;
}
