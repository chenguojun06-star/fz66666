/**
 * 安全打印工具函数
 *
 * 方案：隐藏 iframe + srcdoc 打印，不弹出新标签页
 *
 * 核心修复：
 * 1. font-family 用 serif 做最终回退（macOS sans-serif→Helvetica无中文，serif→宋体有中文）
 * 2. * 通配符确保所有元素都使用支持中文的字体
 * 3. 强制亮色模式 + 黑色文字，修复暗色主题干扰
 * 4. 智能图片等待：dataURL/blob 图片立即打印，外部图片最多等 1.5s
 */

/**
 * 生成打印页面顶部大标题
 * 格式：「工厂名 - 页面标题」，如「东方制衣厂 - 裁剪单」
 * 至少显示工厂名（如果 tenantName 存在）；title 可为空字符串
 *
 * @param tenantName 租户/工厂名称，如「东方制衣厂」
 * @param pageTitle 页面单据标题，如「裁剪单」「生产制单」
 */
export function buildPrintHeader(tenantName?: string, pageTitle?: string): string {
  const factory = tenantName?.trim() || '';
  const title = pageTitle?.trim() || '';
  if (!factory && !title) return '';
  const displayText = title ? (factory ? `${factory} - ${title}` : title) : factory;
  return `<div style="text-align:center;font-size:12px;font-weight:700;color:var(--color-black);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--color-black);">${escapeHtml(displayText)}</div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PRINT_FIX_CSS = `
<style>
  :root {
    color-scheme: light !important;
    /* 打印 iframe 是独立文档，不继承父页面 CSS 变量，必须用具体值（取自 design-system.css :root） */
    /* —— 主色调 —— */
    --color-primary: #2D7FF9;
    --color-info: #722ed1;          /* Ant Design purple/info */
    --color-success: #52c41a;       /* Ant Design 默认 success */
    --color-warning: #faad14;       /* Ant Design 默认 warning */
    --color-danger: #ff4d4f;        /* Ant Design 默认 error */

    /* —— 文字色 —— */
    --color-text-primary: #1a1a1a;
    --color-text-secondary: #6b7280;
    --color-text-tertiary: #9ca3af;
    --color-text-quaternary: #bfbfbf;

    /* —— 背景色 —— */
    --color-bg-base: #ffffff;
    --color-bg-container: #fafafa;
    --color-bg-subtle: #f5f5f5;
    --color-bg-page: #f8fafc;

    /* —— 边框色 —— */
    --color-border: #e5e7eb;
    --color-border-light: #f0f0f0;
    --color-border-antd: #d9d9d9;

    /* —— 状态标签背景色 —— */
    --status-success-bg: #f6ffed;
    --status-processing-bg: #e6f7ff;
    --status-warning-bg: #fffbe6;
    --status-error-bg: #fff2f0;

    /* —— 纯黑 / 灰阶（打印模板高频引用） —— */
    --color-black: #000000;
    --color-gray-label: #999999;    /* 标签灰 */
    --color-gray-dark: #666666;     /* 次级文字 */
    --color-gray-700: #595959;     /* 中深灰 */
    --color-gray-800: #333333;      /* 深灰 */

    /* —— Tailwind 中性色（打印模板引用） —— */
    --color-slate-50: #f8fafc;
    --color-slate-100: #f1f5f9;
    --color-zinc-200: #e4e4e7;
    --color-zinc-300: #d4d4d8;
    --color-zinc-600: #52525b;
    --color-zinc-700: #3f3f46;

    /* —— 其他打印模板引用色 —— */
    --color-blue-100: #dbeafe;
    --color-orange-700: #c2410c;
  }
  html, body { background: var(--color-bg-base) !important; color: var(--color-black) !important; }

  table, thead, tr { break-inside: avoid !important; page-break-inside: avoid !important; }

  * {
    font-family: 'Heiti SC', 'Hiragino Sans GB', 'Arial Unicode MS', 'Songti SC', 'STSong', serif !important;
    color: var(--color-black) !important;
    -webkit-text-fill-color: var(--color-black) !important;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  html, body { background-color: var(--color-bg-base) !important; }
  th { background-color: var(--color-bg-base) !important; }
  img { background: var(--color-bg-base) !important; }
</style>
`;

function ensureCharset(html: string): string {
  if (!html.includes('charset') && !html.includes('Charset')) {
    return html.replace('<head>', '<head><meta charset="UTF-8">');
  }
  return html;
}

function injectFix(html: string): string {
  let fixed = ensureCharset(html);
  // 插入到 <head> 之后（而非 </head> 之前），确保打印模板自身的 CSS 变量和样式优先级更高
  if (fixed.includes('<head>')) {
    fixed = fixed.replace('<head>', `<head>${PRINT_FIX_CSS}`);
  } else {
    fixed = `${PRINT_FIX_CSS}${fixed}`;
  }
  return fixed;
}

function isDataOrBlobUrl(src: string): boolean {
  if (!src) return true;
  return src.startsWith('data:') || src.startsWith('blob:');
}

export function safePrint(htmlContent: string, _title: string = '打印'): boolean {
  try {
    const fixedHtml = injectFix(htmlContent);

    const iframe = document.createElement('iframe');
    iframe.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;width:210mm;height:297mm;border:none;';
    document.body.appendChild(iframe);

    iframe.srcdoc = fixedHtml;

    iframe.onload = () => {
      const doc = iframe.contentDocument;
      if (!doc) {
        try { document.body.removeChild(iframe); } catch { /* */ }
        return;
      }

      const images = Array.from(doc.querySelectorAll<HTMLImageElement>('img'));

      const doPrint = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch { /* */ }
        }, 2000);
      };

      if (images.length === 0) {
        doPrint();
        return;
      }

      const hasExternal = images.some((img) => !isDataOrBlobUrl(img.src));

      if (!hasExternal) {
        doPrint();
        return;
      }

      let settled = 0;
      const onSettled = () => {
        settled++;
        if (settled >= images.length) doPrint();
      };

      images.forEach((img) => {
        if (isDataOrBlobUrl(img.src)) {
          settled++;
        } else if (img.complete) {
          settled++;
        } else {
          img.addEventListener('load', onSettled, { once: true });
          img.addEventListener('error', onSettled, { once: true });
        }
      });

      if (settled >= images.length) {
        doPrint();
      } else {
        setTimeout(() => { if (settled < images.length) doPrint(); }, 1500);
      }
    };

    return true;
  } catch (e) {
    console.error('[safePrint] failed:', e);
    return false;
  }
}
