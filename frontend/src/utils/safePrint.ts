/**
 * 安全打印工具函数
 * 使用隐藏 iframe 打印，避免打开可见的新窗口
 */

export function safePrint(htmlContent: string, _title: string = '打印'): boolean {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;left:-9999px;top:-9999px';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return false; }

    doc.open('text/html', 'replace');
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => { document.body.removeChild(iframe); }, 1000);
    }, 500);
    return true;
  } catch {
    return false;
  }
}
