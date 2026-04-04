/**
 * 安全打印工具函数
 * 使用隐藏 iframe 打印，不弹出新标签页，完整保留 <style> 和 <img> 的渲染效果
 */

/**
 * 安全打印 HTML 内容（iframe 模式，不弹新标签页）
 *
 * 原 window.open('', '_blank') 方案已废弃：
 *  - 会被浏览器弹窗拦截
 *  - sanitizeHtml 在 div 内处理完整 HTML 文档会丢失 <head><style> 结构
 *
 * 新方案：隐藏 iframe，写入完整 HTML，等图片加载完毕后调用 print()
 *
 * @param htmlContent 完整的 HTML 文档字符串（含 <!doctype> 和 <style>）
 * @param _title 兼容保留参数，title 已内嵌在 htmlContent 的 <title> 中
 * @returns 是否成功提交打印（true 表示已触发，不代表用户点了确认）
 */
export function safePrint(htmlContent: string, _title: string = '打印'): boolean {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    const images = Array.from(doc.querySelectorAll<HTMLImageElement>('img'));

    const doPrint = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      iframe.contentWindow?.addEventListener('afterprint', () => {
        try { document.body.removeChild(iframe); } catch { /* already removed */ }
      });
    };

    if (images.length === 0) {
      // 无图片，延迟一帧确保样式渲染完毕
      setTimeout(doPrint, 100);
    } else {
      let settled = 0;
      const onSettled = () => {
        settled++;
        if (settled >= images.length) doPrint();
      };
      images.forEach((img) => {
        if (img.complete) {
          onSettled();
        } else {
          img.addEventListener('load', onSettled, { once: true });
          img.addEventListener('error', onSettled, { once: true });
        }
      });
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * @deprecated 已废弃，调用 safePrint() 替代。保留仅为兼容旧调用点。
 */
export function createSafePrintWindow(htmlContent: string, title: string = '打印'): Window | null {
  safePrint(htmlContent, title);
  return null;
}

/**
 * @deprecated 配合 createSafePrintWindow() 使用，现已废弃，无需调用。
 */
export function executePrint(_printWindow: Window): void {
  // noop — 打印已全部在 safePrint() 的 iframe 内完成
}

/**
 * 打印 DOM 元素的 innerHTML 内容。
 * 注意：不包含 <head><style>，建议改用 safePrint(completeHtmlString)。
 */
export function printElement(element: HTMLElement, title: string = '打印'): boolean {
  if (!element) return false;
  const wrapped = `<!doctype html><html><head><title>${title}</title></head><body>${element.innerHTML}</body></html>`;
  return safePrint(wrapped, title);
}
