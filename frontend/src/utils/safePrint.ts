/**
 * 安全打印工具函数
 * 使用隐藏 iframe 打印，避免打开可见的新窗口
 *
 * 关键设计（避免「打印预览空白」铁律）：
 *  1. iframe 给真实尺寸 210mm×297mm（A4），让内部 flex / grid 布局有正确视口；
 *     若给 0×0，flex 子项会塌缩成 0 宽度，文字会渲染但实际占 0 宽度，
 *     Chrome 打印预览只剩"幽灵痕迹"（空表格 + 零散 > 字符）。
 *  2. iframe 用 opacity:0 + pointer-events:none 隐身，不影响打印输出。
 *  3. **必须等所有 <img> 加载完毕**再调用 print()，否则 Chrome 在图片
 *     未 settle 时打印，会得到空白预览（即便 HTML 已写入也一样）。
 *  4. 用 onload + onerror 双保险，再加 4s 兜底超时，防止跨域图片永不 settle。
 */

export function safePrint(htmlContent: string, _title: string = '打印'): boolean {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.cssText =
      'position:fixed;left:0;top:0;width:210mm;height:297mm;border:none;opacity:0;pointer-events:none;overflow:hidden;z-index:-1';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return false; }

    doc.open('text/html', 'replace');
    doc.write(htmlContent);
    doc.close();

    const cleanup = () => {
      try { document.body.removeChild(iframe); } catch { /* already removed */ }
    };

    const doPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('[safePrint] print failed:', e);
      }
      setTimeout(cleanup, 1500);
    };

    // 等所有图片加载完毕（含跨域），最长等 4 秒兜底
    const waitImagesAndPrint = () => {
      const images = Array.from(doc.querySelectorAll<HTMLImageElement>('img'));
      if (images.length === 0) {
        setTimeout(doPrint, 80);
        return;
      }
      let settled = 0;
      let printed = false;
      const onSettled = () => {
        if (printed) return;
        settled++;
        if (settled >= images.length) {
          printed = true;
          setTimeout(doPrint, 80);
        }
      };
      images.forEach((img) => {
        if (img.complete && img.naturalWidth > 0) {
          onSettled();
        } else {
          img.addEventListener('load', onSettled, { once: true });
          img.addEventListener('error', onSettled, { once: true });
        }
      });
      // 兜底超时：最长等 4 秒
      setTimeout(() => {
        if (!printed) {
          printed = true;
          doPrint();
        }
      }, 4000);
    };

    // doc.write 后等一帧让 DOM 解析完毕
    setTimeout(waitImagesAndPrint, 50);
    return true;
  } catch {
    return false;
  }
}
