/**
 * 安全打印工具函数
 *
 * 方案：隐藏 iframe + srcdoc 打印，不弹出新标签页
 *
 * 核心修复：
 * 1. font-family 用 serif 做最终回退（macOS sans-serif→Helvetica无中文，serif→宋体有中文）
 * 2. * 通配符确保所有元素都使用支持中文的字体
 * 3. 强制亮色模式 + 黑色文字，修复暗色主题干扰
 */

const PRINT_FIX_CSS = `
<style>
  :root { color-scheme: light !important; }
  html, body { background: #fff !important; color: #000 !important; }

  * {
    font-family: 'Heiti SC', 'Hiragino Sans GB', 'Arial Unicode MS', 'Songti SC', 'STSong', serif !important;
    color: #000 !important;
    -webkit-text-fill-color: #000 !important;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  html, body { background-color: #fff !important; }
  th { background-color: #fafafa !important; }
  img { background: #fff !important; }
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
  if (fixed.includes('</head>')) {
    fixed = fixed.replace('</head>', `${PRINT_FIX_CSS}</head>`);
  } else {
    fixed = `${PRINT_FIX_CSS}${fixed}`;
  }
  return fixed;
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
        setTimeout(doPrint, 300);
      } else {
        let settled = 0;
        const onSettled = () => {
          settled++;
          if (settled >= images.length) doPrint();
        };
        images.forEach((img) => {
          if (img.complete) onSettled();
          else {
            img.addEventListener('load', onSettled, { once: true });
            img.addEventListener('error', onSettled, { once: true });
          }
        });
        setTimeout(() => { if (settled < images.length) doPrint(); }, 5000);
      }
    };

    return true;
  } catch (e) {
    console.error('[safePrint] failed:', e);
    return false;
  }
}
