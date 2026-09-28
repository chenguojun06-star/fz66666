/**
 * 打印内容区共享样式（D-611）
 *
 * 原先这份 CSS 写死在 StylePrintModal 预览 DOM 里，单一打印靠抓 innerHTML 时顺带带走；
 * 批量打印没有预览 DOM 可抓，必须与预览共用同一份常量，保证「批量 = 单一」样式不漂移。
 * 单一打印路径不变：预览里仍以 <style> 内嵌（跟随 innerHTML 被抓走）。
 */
export const STYLE_PRINT_CONTENT_CSS = `
  .print-section { margin-bottom: 16px; }
  .print-section-title { font-size: 14px; font-weight: 700; background: #f0f0f0; padding: 6px 10px; border-radius: 2px; margin-bottom: 0; border: 1px solid #d9d9d9; border-bottom: none; }
  /* D-514 打印分页：区块（标题+表格）放不下就整体挪到下一页，标题永不与表格分离 */
  .print-sec { margin-bottom: 16px; break-inside: avoid; page-break-inside: avoid; }
  .print-section-title { break-after: avoid; page-break-after: avoid; break-inside: avoid; page-break-inside: avoid; }
  .pt tr { break-inside: avoid; page-break-inside: avoid; }
  .pt thead { display: table-header-group; }
  .ant-table-wrapper tr { break-inside: avoid; page-break-inside: avoid; }
  .ant-table-wrapper thead { display: table-header-group; }
  /* 统一打印表格样式 */
  .pt { width: 100%; border-collapse: collapse; font-size: 13px; }
  /* D-513：原 0.5px + 浅灰，预览和打印都看不清；改为 1px 纯黑，
     与 printTemplate.ts 的 th,td 保持一致（预览所见即打印所得） */
  .pt th, .pt td { border: 1px solid #000; padding: 5px 8px; vertical-align: middle; }
  .pt th { background: var(--color-bg-subtle); font-weight: 600; text-align: center; white-space: nowrap; }
  .pt td { color: var(--color-gray-800); }
  .pt .label-cell { background: var(--color-bg-subtle); font-weight: 500; color: var(--color-gray-800); width: 100px; white-space: nowrap; }
  .pt .total-row td { background: var(--color-bg-subtle); font-weight: 700; }
  .pt .highlight-cell { font-weight: 700; color: var(--color-primary-darker); }
  /* D-514e：打印内所有图片一律完整显示——按原比例缩放，放不下就留白，禁止裁剪成方块 */
  .style-print-content img, .print-sec img, .print-section img { object-fit: contain; max-width: 100%; }
`;
