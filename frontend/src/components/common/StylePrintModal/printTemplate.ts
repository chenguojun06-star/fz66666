export interface PrintHtmlParams {
  headerInfo: string;
  printerInfo: string;
  printDate: string;
  styleNo: string;
  bodyHtml: string;
}

export function buildPrintHtml({ headerInfo, printerInfo, printDate, styleNo, bodyHtml }: PrintHtmlParams): string {
  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>打印预览 - ${styleNo}</title>
        <style>
          /* 打印上下文 CSS 变量定义（iframe 不继承主页面变量，必须在此声明） */
          :root {
            --color-bg-base: #ffffff;
            --color-bg-container: #fafafa;
            --color-border: #d9d9d9;
            --color-primary: #1890ff;
            --color-text-secondary: #666666;
            --color-text-tertiary: #999999;
            --color-text-quaternary: #bbbbbb;
            --font-size-xxl: 24px;
            --font-size-xl: 20px;
            --font-size-lg: 16px;
            --font-size-base: 14px;
            --font-size-sm: 13px;
            --font-size-xs: 12px;
          }

          @page {
            margin: 15mm 10mm 12mm 10mm;
            size: A4;
          }

          /* 暗色主题修复：强制黑色文字 + 白色背景 */
          html, body {
            color: #000000 !important;
            
            background: #ffffff !important;
          }
          /* 注意：不要加 * { color: inherit !important }，否则会覆盖业务内联颜色，
             同时和 -webkit-text-fill-color 互相干扰，导致中文文本被某些浏览器视为透明 */

          /* 页眉 - 每页顶部显示 */
          @media print {
            .print-header {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              height: 25px;
              background: #fff;
              border-bottom: 1px solid #e8e8e8;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 10px;
              color: #666;
              padding: 0 5mm;
              z-index: 1000;
            }
            .print-header-left { font-weight: 500; }
            .print-header-right { color: #999; }

            /* 页脚 - 每页底部显示 */
            .print-footer {
              position: fixed;
              bottom: 0;
              left: 0;
              right: 0;
              height: 20px;
              background: #fff;
              border-top: 1px solid #e8e8e8;
              display: flex;
              justify-content: center;
              align-items: center;
              font-size: 9px;
              color: #999;
              z-index: 1000;
            }

            /* 内容区域 */
            .print-body {
              margin-top: 30px;
              margin-bottom: 25px;
            }
          }

          /* 基础样式 */
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "'Segoe UI'", Roboto, "'Helvetica Neue'", Arial, "'Noto Sans'", "'Microsoft YaHei'", "'PingFang SC'", serif;
            font-size: 12px;
            line-height: 1.6;
            color: #333;
            padding: 20px;
            background: #fff;
            -webkit-font-smoothing: antialiased;
          }

          /* 打印内容样式 */
          .print-section {
            margin-bottom: 20px;
            page-break-inside: avoid;
          }
          .print-section-title {
            font-size: 14px;
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #1890ff;
          }

          /* 表格样式 */
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin-bottom: 16px;
          }
          th, td {
            border: 1px solid #d9d9d9;
            padding: 8px 10px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #fafafa;
            font-weight: 600;
            color: #262626;
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
        <!-- 固定页眉 -->
        <div class="print-header">
          <span class="print-header-left">${headerInfo}</span>
          <span class="print-header-right">${printerInfo}  |  打印时间: ${printDate}</span>
        </div>
        <!-- 内容区域 -->
        <div class="print-body">
          ${bodyHtml}
        </div>
        <!-- 固定页脚 -->
        <div class="print-footer">
          打印预览 - ${styleNo}
        </div>
      </body>
      </html>
    `;
}
