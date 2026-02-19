/**
 * 安全打印工具函数
 * 替代 document.write，防止 XSS 攻击
 */

/**
 * 创建安全的打印窗口
 * @param htmlContent HTML 内容（会被转义处理）
 * @param title 窗口标题
 */
export function createSafePrintWindow(htmlContent: string, title: string = '打印'): Window | null {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return null;
  }

  // 使用 DOM API 安全地构建文档
  const doc = printWindow.document;
  doc.open();

  // 创建基础 HTML 结构
  const html = doc.createElement('html');
  const head = doc.createElement('head');
  const body = doc.createElement('body');

  // 设置标题
  const titleElement = doc.createElement('title');
  titleElement.textContent = title;
  head.appendChild(titleElement);

  // 安全地设置 body 内容
  // 使用 textContent 和 innerHTML 的组合来平衡安全性和功能
  // 注意：htmlContent 应该是可信的或由 DOMPurify 净化过的
  body.innerHTML = sanitizeHtml(htmlContent);

  html.appendChild(head);
  html.appendChild(body);

  // 清空文档并添加新结构
  doc.write('<!DOCTYPE html>');
  doc.appendChild(html);
  doc.close();

  return printWindow;
}

/**
 * 执行打印
 * @param printWindow 打印窗口
 */
export function executePrint(printWindow: Window): void {
  // 等待资源加载完成
  printWindow.onload = () => {
    printWindow.print();
    // 可选：打印后关闭窗口
    // printWindow.close();
  };

  // 如果已经加载完成，直接打印
  if (printWindow.document.readyState === 'complete') {
    printWindow.print();
  }
}

/**
 * 安全的 HTML 净化（基础版）
 * 注意：生产环境建议使用 DOMPurify 库
 * @param html HTML 字符串
 * @returns 净化后的 HTML
 */
function sanitizeHtml(html: string): string {
  // 创建临时 div 进行净化
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // 移除危险的标签和属性
  const dangerousTags = ['script', 'iframe', 'object', 'embed', 'form'];
  const dangerousAttrs = ['onerror', 'onload', 'onclick', 'onmouseover', 'javascript:'];

  dangerousTags.forEach(tag => {
    const elements = temp.getElementsByTagName(tag);
    while (elements.length > 0) {
      elements[0].parentNode?.removeChild(elements[0]);
    }
  });

  // 遍历所有元素，移除危险属性
  const allElements = temp.getElementsByTagName('*');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const attrs = Array.from(el.attributes);
    attrs.forEach(attr => {
      const attrName = attr.name.toLowerCase();
      const attrValue = attr.value.toLowerCase();

      // 移除事件处理器和 javascript: 协议
      if (attrName.startsWith('on') || attrValue.startsWith('javascript:')) {
        el.removeAttribute(attr.name);
      }

      // 移除危险属性
      if (dangerousAttrs.some(dangerous => attrName.includes(dangerous))) {
        el.removeAttribute(attr.name);
      }
    });
  }

  return temp.innerHTML;
}

/**
 * 安全打印 HTML 内容
 * @param htmlContent HTML 内容
 * @param title 窗口标题
 * @returns 是否成功
 */
export function safePrint(htmlContent: string, title: string = '打印'): boolean {
  const printWindow = createSafePrintWindow(htmlContent, title);
  if (!printWindow) {
    return false;
  }

  executePrint(printWindow);
  return true;
}

/**
 * 打印元素内容
 * @param element 要打印的 DOM 元素
 * @param title 窗口标题
 * @returns 是否成功
 */
export function printElement(element: HTMLElement, title: string = '打印'): boolean {
  if (!element) {
    return false;
  }

  const htmlContent = element.innerHTML;
  return safePrint(htmlContent, title);
}
