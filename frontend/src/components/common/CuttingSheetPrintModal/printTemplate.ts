import { buildPrintHeader } from '@/utils/safePrint';
import type { PrintPageData } from './types';

function buildTableRows(sortedBundles: PrintPageData['sortedBundles']): string {
  return sortedBundles.map((bundle) => `
    <tr>
      <td style="text-align: center;">${bundle.styleNo || '-'}</td>
      <td style="text-align: center; font-weight: 600;">${bundle.size || '-'}</td>
      <td style="text-align: center; font-weight: 600; color: var(--color-primary);">${bundle.bundleNo || '-'}</td>
      <td style="text-align: center;">${bundle.color || '-'}</td>
      <td style="text-align: center; font-weight: 600;">${bundle.quantity || 0}</td>
    </tr>
  `).join('');
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
  } = pageData;

  const tableRows = buildTableRows(sortedBundles);
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
            ${expectedShipDate ? `
            <div class="info-item delivery-date-item">
              <span class="info-label">交期：</span>
              <span class="info-value delivery-date-value">${expectedShipDate}</span>
            </div>
            ` : ''}
            <div class="info-item bed-no-item">
              <span class="info-label">床号：</span>
              <span class="info-value bed-no-value">${bedNoDisplay}</span>
            </div>
          </div>
        </div>
      </div>

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
            <td colspan="4" style="text-align: right; font-weight: 600;">合计：</td>
            <td style="text-align: center; font-weight: 600; font-size: 16px;">${totalQuantity}</td>
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
    font-size: 12px;
    color: #000;
    background: white;
  }
  .cutting-sheet-page {
    width: 100%;
    page-break-after: always;
    position: relative;
  }
  .cutting-sheet-page:last-child {
    page-break-after: auto;
  }

  .header-container {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 2px solid #000;
  }
  .header-left {
    flex: 0 0 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #ddd;
    border-radius: 4px;
    overflow: hidden;
    background: var(--color-bg-container);
  }
  .style-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    max-height: 200px;
  }
  .no-image {
    width: 200px;
    height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #999;
    font-size: 12px;
  }
  .header-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .company-name {
    font-size: 12px;
    font-weight: 700;
    color: #000;
    margin-bottom: 8px;
  }
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 16px;
  }
  .info-item {
    display: flex;
    align-items: center;
    font-size: 13px;
  }
  .info-label {
    font-weight: 600;
    color: #333;
    min-width: 60px;
  }
  .info-value {
    color: #000;
    flex: 1;
  }
  .info-value.highlight {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-primary);
  }
  .bed-no-item {
    grid-column: 1 / -1;
    border: 2px solid var(--color-primary);
    padding: 8px 12px;
    border-radius: 4px;
    background: #f0f7ff;
    margin-top: 4px;
  }
  .bed-no-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--color-primary) !important;
  }
  .delivery-date-item {
    grid-column: 1 / -1;
    border: 2px solid var(--color-warning);
    padding: 8px 12px;
    border-radius: 4px;
    background: #FFF7E6;
    margin-top: 4px;
  }
  .delivery-date-value {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-warning) !important;
  }

  .detail-table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 12px;
  }
  .detail-table th,
  .detail-table td {
    border: 1px solid #333;
    padding: 8px;
    text-align: left;
  }
  .detail-table thead th {
    background-color: var(--color-bg-subtle);
    font-weight: 700;
    text-align: center;
  }
  .detail-table tbody tr:nth-child(even) {
    background-color: var(--color-bg-container);
  }
  .detail-table tfoot td {
    background-color: var(--color-border-light);
    font-weight: 600;
  }

  .signature-section {
    margin-top: 32px;
    display: flex;
    justify-content: space-around;
    align-items: center;
  }
  .signature-item {
    font-size: 13px;
  }
  .signature-line {
    display: inline-block;
    min-width: 120px;
    border-bottom: 1px solid #000;
    margin-left: 8px;
  }
  .signature-value {
    display: inline-block;
    min-width: 80px;
    margin-left: 8px;
    font-weight: 600;
    color: var(--color-primary);
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
