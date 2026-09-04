import { buildPrintHeader } from '@/utils/safePrint';
import type { PrintPageData } from './types';

function buildTableRows(sortedBundles: PrintPageData['sortedBundles']): string {
  return sortedBundles.map((bundle) => `
    <tr>
      <td style="text-align: center;">${bundle.styleNo || '-'}</td>
      <td style="text-align: center;">${bundle.size || '-'}</td>
      <td style="text-align: center;">${bundle.bundleNo || '-'}</td>
      <td style="text-align: center;">${bundle.color || '-'}</td>
      <td style="text-align: center;">${bundle.quantity || 0}</td>
    </tr>
  `).join('');
}

/** 下单颜色数量矩阵：行为颜色、列为码数 */
function buildColorSizeMatrixHtml(colorSizeMatrix: PrintPageData['colorSizeMatrix']): string {
  const { colors, sizes, data, colorTotals, sizeTotals, total } = colorSizeMatrix;
  if (!sizes.length || !colors.length) return '';

  const headCells = sizes.map((s) => `<th class="col-qty">${s}</th>`).join('');
  const bodyRows = colors.map((color) => {
    const cells = sizes.map((s) => {
      const qty = data[color]?.[s] || 0;
      return `<td class="cell-qty">${qty || ''}</td>`;
    }).join('');
    return `
      <tr>
        <td class="cell-color">${color}</td>
        ${cells}
        <td class="cell-qty cell-total">${colorTotals[color] || 0}</td>
      </tr>
    `;
  }).join('');

  const totalRow = `
    <tr class="matrix-foot-row">
      <td class="cell-color">合计</td>
      ${sizes.map((s) => `<td class="cell-qty cell-total">${sizeTotals[s] || 0}</td>`).join('')}
      <td class="cell-qty cell-total">${total || 0}</td>
    </tr>
  `;

  return `
    <table class="matrix-table">
      <thead>
        <tr>
          <th class="cell-color">颜色\\码数</th>
          ${headCells}
          <th class="cell-qty">合计</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
        ${totalRow}
      </tbody>
    </table>
  `;
}

function buildSinglePageHtml(pageData: PrintPageData, companyName: string): string {
  const {
    orderNo,
    bedNoDisplay,
    operatorName,
    creatorName,
    expectedShipDate,
    imageUrl,
    totalQuantity,
    sortedBundles,
    printerName,
    printTime,
    colorSizeMatrix,
  } = pageData;

  const tableRows = buildTableRows(sortedBundles);
  const matrixHtml = buildColorSizeMatrixHtml(colorSizeMatrix);
  const factoryName = companyName || '';
  const pageTitle = '裁剪单';
  const headerHtml = buildPrintHeader(factoryName, pageTitle);

  return `
    <div class="cutting-sheet-page">
      ${headerHtml}
      <div class="header-container">
        <div class="header-left">
          ${imageUrl ? `
            <img src="${imageUrl}" alt="款式图" class="style-image" />
          ` : '<div class="no-image">无图片</div>'}
        </div>

        <div class="header-right">
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">订单号：</span>
              <span class="info-value">${orderNo}</span>
            </div>
            <div class="info-item">
              <span class="info-label">床号：</span>
              <span class="info-value">${bedNoDisplay}</span>
            </div>
            ${expectedShipDate ? `
            <div class="info-item">
              <span class="info-label">交期：</span>
              <span class="info-value">${expectedShipDate}</span>
            </div>
            ` : ''}
          </div>
        </div>
      </div>

      ${matrixHtml ? `
      <div class="matrix-block">
        <div class="block-title">下单颜色数量矩阵</div>
        ${matrixHtml}
      </div>
      ` : ''}

      <table class="detail-table">
        <thead>
          <tr>
            <th style="width: 20%;">款号</th>
            <th style="width: 15%;">码数</th>
            <th style="width: 20%;">菲号</th>
            <th style="width: 25%;">颜色</th>
            <th style="width: 20%;">数量</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="text-align: right;">合计：</td>
            <td style="text-align: center;">${totalQuantity}</td>
          </tr>
        </tfoot>
      </table>

      <div class="signature-section">
        <div class="signature-item">
          <span>创建人：</span>
          <span class="signature-value">${creatorName}</span>
        </div>
        <div class="signature-item">
          <span>操作人：</span>
          <span class="signature-value">${operatorName}</span>
        </div>
        <div class="signature-item">
          <span>裁床：</span>
          <span class="signature-line">__________________</span>
        </div>
        <div class="signature-item">
          <span>质检：</span>
          <span class="signature-line">__________________</span>
        </div>
        <div class="signature-item">
          <span>日期：</span>
          <span class="signature-line">__________________</span>
        </div>
      </div>

      <div class="print-footer">
        <span class="footer-item">打印人：${printerName}&nbsp;&nbsp;${printTime}</span>
      </div>
    </div>
  `;
}

const printCss = `
  @page {
    size: A4 {{ORIENTATION}};
    margin: 5mm;
  }
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  html, body {
    font-family: 'Heiti SC', 'Songti SC', 'Hiragino Sans GB', 'STSong', 'Arial Unicode MS', serif;
    font-size: 11px;
    font-weight: normal;
    color: var(--color-black);
    background: white;
  }
  .cutting-sheet-page {
    width: 100%;
    page-break-after: always;
    position: relative;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .cutting-sheet-page:last-child {
    page-break-after: auto;
  }

  .header-container {
    display: flex;
    gap: 16px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--color-black);
  }
  .header-left {
    flex: 0 0 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-zinc-300);
    border-radius: 4px;
    overflow: hidden;
    background: var(--color-bg-container);
  }
  .style-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    max-height: 160px;
  }
  .no-image {
    width: 160px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-gray-label);
    font-size: 11px;
  }
  .header-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 16px;
  }
  .info-item {
    display: flex;
    align-items: center;
    font-size: 12px;
  }
  .info-label {
    color: var(--color-gray-800);
    min-width: 56px;
  }
  .info-value {
    color: var(--color-black);
    flex: 1;
  }

  .matrix-block {
    margin: 8px 0 4px;
  }
  .block-title {
    font-size: 12px;
    margin-bottom: 4px;
  }
  .matrix-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  .matrix-table th,
  .matrix-table td {
    border: 1px solid var(--color-gray-800);
    padding: 4px 6px;
    text-align: center;
  }
  .matrix-table thead th {
    background-color: var(--color-bg-subtle);
    text-align: center;
  }
  .cell-color {
    text-align: left;
  }
  .matrix-foot-row td {
    background-color: var(--color-bg-container);
  }

  .detail-table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 11px;
  }
  .detail-table th,
  .detail-table td {
    border: 1px solid var(--color-gray-800);
    padding: 6px;
    text-align: left;
  }
  .detail-table thead th {
    background-color: var(--color-bg-subtle);
    text-align: center;
  }
  .detail-table tbody tr:nth-child(even) {
    background-color: var(--color-bg-container);
  }
  .detail-table tfoot td {
    background-color: var(--color-border-light);
  }

  .signature-section {
    margin-top: auto;
    padding: 24px 0 8px;
    display: flex;
    justify-content: space-around;
    align-items: center;
  }
  .signature-item {
    font-size: 12px;
  }
  .signature-line {
    display: inline-block;
    min-width: 110px;
    border-bottom: 1px solid var(--color-black);
    margin-left: 8px;
  }
  .signature-value {
    display: inline-block;
    min-width: 80px;
    margin-left: 8px;
    color: var(--color-gray-800);
  }

  .print-footer {
    border-top: 1px solid var(--color-gray-800);
    padding-top: 6px;
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }
  .footer-item {
    display: inline-block;
  }

  @media print {
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

export function buildCuttingSheetPrintHtml(
  pagesData: PrintPageData[],
  companyName: string,
  orientation: 'portrait' | 'landscape'
): string {
  const pagesHtml = pagesData
    .map(pageData => buildSinglePageHtml(pageData, companyName))
    .join('');

  const cssWithOrientation = printCss.replace('{{ORIENTATION}}', orientation);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>裁剪单打印</title>
      <style>${cssWithOrientation}</style>
    </head>
    <body>
      ${pagesHtml}
    </body>
    </html>
  `;
}