/**
 * 安全打印工具函数
 * 使用隐藏 iframe 打印，不弹出新标签页
 *
 * 使用 srcdoc 代替 document.write()，确保 UTF-8 编码正确解析中文
 * srcdoc 文档按 HTML5 规范始终以 UTF-8 解析
 */

export function safePrint(htmlContent: string, _title: string = '打印'): boolean {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;width:210mm;height:297mm;border:none;';
    iframe.srcdoc = htmlContent;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      win.focus();
      win.print();
      setTimeout(() => iframe.remove(), 1000);
    };

    return true;
  } catch {
    return false;
  }
}
