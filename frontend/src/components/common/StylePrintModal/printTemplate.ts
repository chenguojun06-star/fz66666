export interface PrintHtmlParams {
  headerInfo: string;
  printerInfo: string;
  printDate: string;
  styleNo: string;
  bodyHtml: string;
  /** 租户/工厂名称，如「东方制衣厂」 */
  tenantName?: string;
  /** 页面打印标题，如「样衣开发单」 */
  pageTitle?: string;
}

export function buildPrintHtml({
  headerInfo, printerInfo, printDate, styleNo, bodyHtml, tenantName, pageTitle
}: PrintHtmlParams): string {
  const printHeader = (() => {
    const factory = tenantName?.trim() || '';
    const title = pageTitle?.trim() || '';
    if (!factory && !title) return '';
    const displayText = title ? (factory ? `${factory} - ${title}` : title) : factory;
    return `<div style="text-align:center;font-size:22px;font-weight:700;color:#000;margin-bottom:14px;letter-spacing:1px;">${displayText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`;
  })();

  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>打印预览 - ${styleNo}</title>
        <style>
          /* 打印上下文 CSS 变量定义（iframe 不继承主页面变量，必须在此声明） */
          :root {
            --color-bg-base: var(--color-bg-base);
            --color-bg-container: var(--color-bg-container);
            --color-border: var(--color-border-antd);
            --color-primary: var(--color-info);
            --color-text-secondary: #666666;
            --color-text-tertiary: #999999;
            --color-text-quaternary: #bbbbbb;
          }

          @page {
            margin: 5mm 5mm 5mm 5mm;
            size: A4;
          }

          /* 暗色主题修复：强制黑色文字 + 白色背景 */
          html, body {
            color: #000000 !important;
            
            background: var(--color-bg-base) !important;
          }
          /* 注意：不要加 * { color: inherit !important }，否则会覆盖业务内联颜色，
             同时和 -webkit-text-fill-color 互相干扰，导致中文文本被某些浏览器视为透明 */

          /* 页脚 - 屏幕预览 + 打印都需要 */
          .print-footer {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            font-size: 11px;
            color: #999;
            padding: 6px 5mm;
            margin-top: 16px;
            background: var(--color-bg-base);
            border-top: 0.5px solid #d0d0d0;
          }
          .print-footer-right {
            white-space: nowrap;
          }

          /* 打印时页脚固定到每页 */
          @media print {
            .print-footer {
              position: fixed;
              bottom: 0;
              left: 0;
              right: 0;
              margin-top: 0;
              height: 20px;
              padding: 0 5mm;
              z-index: 1000;
            }
            /* 内容区域留出页脚位置 */
            .print-body {
              margin-bottom: 30px;
            }
          }

          /* 基础样式 */
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "'Segoe UI'", Roboto, "'Helvetica Neue'", Arial, "'Noto Sans'", "'Microsoft YaHei'", "'PingFang SC'", serif;
            font-size: 12px;
            line-height: 1.6;
            color: #333;
            padding: 20px;
            background: var(--color-bg-base);
            -webkit-font-smoothing: antialiased;
          }

          /* 打印内容样式 */
          .print-section {
            margin-bottom: 16px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .print-section-title {
            font-size: 12px;
            font-weight: 600;
            color: var(--color-text-primary);
            margin-bottom: 10px;
            padding-bottom: 6px;
            border-bottom: 0.75px solid #ccc;
          }

          /* 表格样式 */
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin-bottom: 16px;
          }
          thead {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          th, td {
            border: 0.5px solid #d0d0d0;
            padding: 5px 7px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #f5f5f5;
            font-weight: 600;
            color: #333;
          }
          tr:nth-child(even) {
            background: #fafafa;
          }

          /* 信息网格 */
          .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px 24px;
            margin-bottom: 16px;
          }
          .info-item {
            display: flex;
            gap: 8px;
          }
          .info-label {
            color: #666;
            min-width: 80px;
          }
          .info-value {
            color: #333;
            font-weight: 500;
          }

          /* 图片样式 */
          .attachment-image {
            max-width: 200px;
            max-height: 200px;
            border: 1px solid #e8e8e8;
            border-radius: 4px;
            margin: 4px;
          }

          /* 二维码样式 */
          .qr-code {
            text-align: center;
            margin: 20px 0;
          }
          .qr-code img {
            width: 120px;
            height: 120px;
          }

          /* 隐藏打印按钮 */
          @media print {
            .no-print {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <!-- 页面顶部大标题 -->
        ${printHeader}
        <!-- 内容区域 -->
        <div class="print-body">
          ${bodyHtml}
        </div>
        <!-- 固定页脚：打印人 + 打印时间 -->
        <div class="print-footer">
          <span class="print-footer-right">${printerInfo}  |  打印时间: ${printDate}</span>
        </div>
      </body>
      </html>
    `;
}
