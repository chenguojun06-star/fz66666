import { formatMoney } from '@/utils/format';
import { getMaterialTypeLabel } from '@/utils/materialType';
import type { StyleBom, StyleProcess } from '@/types/style';

export interface BuildQuotationPrintHtmlParams {
  bomList: StyleBom[];
  processList: StyleProcess[];
  secondaryProcessList: any[];
  styleNo?: string;
  materialCost: number;
  processCost: number;
  otherCost: number;
  totalCost: number;
  totalPrice: number;
  profit: number;
  actualProfitRate: string;
}

const esc = (v: any) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * 构建报价单打印 HTML（独立纯函数，便于主组件瘦身）
 */
export const buildQuotationPrintHtml = (params: BuildQuotationPrintHtmlParams): string => {
  const {
    bomList,
    processList,
    secondaryProcessList,
    styleNo,
    materialCost,
    processCost,
    otherCost,
    totalCost,
    totalPrice,
    profit,
    actualProfitRate,
  } = params;

  // BOM表行
  const bomRows =
    bomList.length > 0
      ? bomList
          .map((item: any, idx: number) => {
            const usage = Number(item.usageAmount) || 0;
            const loss = Number(item.lossRate) || 0;
            const unitPrice = Number(item.unitPrice) || 0;
            let rowTotal: number;
            const rawTotal = item.totalPrice;
            const hasTotal =
              rawTotal !== undefined && rawTotal !== null && String(rawTotal).trim() !== '';
            if (hasTotal) {
              const n = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal);
              rowTotal = Number.isFinite(n) ? n : usage * (1 + loss / 100) * unitPrice;
            } else {
              rowTotal = usage * (1 + loss / 100) * unitPrice;
            }
            return `<tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${esc(getMaterialTypeLabel(item.materialType))}</td>
        <td>${esc(item.materialCode)}</td>
        <td>${esc(item.materialName)}</td>
        <td>${esc(item.specification)}</td>
        <td>${esc(item.unit)}</td>
        <td style="text-align:right">${usage.toFixed(2)}</td>
        <td style="text-align:right">${loss.toFixed(1)}%</td>
        <td style="text-align:right">${formatMoney(unitPrice)}</td>
        <td style="text-align:right;font-weight:600">${formatMoney(rowTotal)}</td>
      </tr>`;
          })
          .join('')
      : `<tr><td colspan="10" style="text-align:center;color:#999;padding:16px">暂无物料明细</td></tr>`;

  // 工序表行
  const processRows =
    processList.length > 0
      ? processList
          .map((item: any, idx: number) => {
            const price = (Number(item.price) || 0) * (Number(item.rateMultiplier) || 1);
            return `<tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${esc(item.progressStage || item.processName)}</td>
        <td style="text-align:right">${formatMoney(price)}</td>
      </tr>`;
          })
          .join('')
      : `<tr><td colspan="3" style="text-align:center;color:#999;padding:16px">暂无工序明细</td></tr>`;

  // 二次工艺表行
  const secRows =
    secondaryProcessList.length > 0
      ? secondaryProcessList
          .map((item: any, idx: number) => {
            return `<tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${esc(item.processName)}</td>
        <td style="text-align:right">${formatMoney(Number(item.unitPrice) || 0)}</td>
      </tr>`;
          })
          .join('')
      : `<tr><td colspan="3" style="text-align:center;color:#999;padding:16px">暂无二次工艺明细</td></tr>`;

  void processList.reduce(
    (s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.rateMultiplier) || 1),
    0,
  );
  void secondaryProcessList.reduce((s: number, i: any) => s + (Number(i.unitPrice) || 0), 0);

  const now = new Date();
  const printDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes(),
  ).padStart(2, '0')}`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>报价单 - ${esc(styleNo || '')}</title>
  <style>
    @page { margin: 12mm; }
    body { font-family: system-ui, -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 13px; color: var(--color-text-primary); padding: 24px; background: var(--color-bg-base); line-height: 1.7; }
    .title { text-align: center; font-size: 26px; font-weight: 700; margin-bottom: 6px; letter-spacing: 3px; color: var(--color-text-primary); }
    .subtitle { text-align: center; font-size: 12px; color: #999; margin-bottom: 24px; }
    .info-bar { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f8f9fa; border: 1px solid #e8e8e8; margin-bottom: 24px; font-size: 13px; }
    .info-item { display: flex; gap: 6px; }
    .info-label { color: #666; }
    .info-value { font-weight: 600; }
    .section { margin-bottom: 24px; page-break-inside: avoid; }
    .section-title { font-size: 15px; font-weight: 600; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid var(--color-info); color: var(--color-text-primary); display: flex; align-items: center; gap: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #d0d0d0; padding: 7px 10px; vertical-align: middle; }
    th { background: #f4f6f8; font-weight: 600; color: #262626; text-align: center; }
    tbody tr:hover { background: #fafcff; }
    /* ---- 汇总区 ---- */
    .summary-section { margin-top: 32px; padding: 20px; background: linear-gradient(135deg, #f0f7ff 0%, #e8f4ff 100%); border: 2px solid var(--color-info); border-radius: 8px; page-break-inside: avoid; }
    .summary-title { text-align: center; font-size: 16px; font-weight: 700; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px dashed var(--color-info); color: var(--color-info); letter-spacing: 1px; }
    .summary-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-bottom: 1px solid #d0e8ff; }
    .summary-row:last-child { border-bottom: none; }
    .summary-row-label { color: #444; font-size: 13px; }
    .summary-row-value { font-weight: 700; font-size: 15px; color: var(--color-text-primary); }
    .summary-row.highlight { background: #F6FFED; border-radius: 6px; padding: 12px 16px; margin: 4px 0; }
    .summary-row.highlight .summary-row-value { font-size: 18px; color: #d4380d; }
    .summary-row.profit .summary-row-value { color: var(--color-success); }
    .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #999; padding-top: 16px; border-top: 1px solid #eee; }
    .print-btn-bar { position: fixed; top: 10px; right: 10px; z-index: 999; }
    .print-btn { padding: 8px 16px; background: var(--color-info); color: var(--color-bg-base); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    @media print {
      .no-print { display: none !important; }
      .print-btn-bar { display: none; }
      .summary-section { background: #f8f9fa !important; border-color: #999 !important; }
      .summary-row.highlight { background: #F6FFED !important; }
    }
  </style>
</head>
<body>
  <div class="print-btn-bar no-print">
    <button class="print-btn" onclick="window.print()">🖨️ 打印</button>
  </div>

  <div class="title">报 价 单</div>
  <div class="subtitle">Quotation Sheet</div>

  <div class="info-bar">
    <div class="info-item"><span class="info-label">款号：</span><span class="info-value">${esc(styleNo || '-')}</span></div>
    <div class="info-item"><span class="info-label">打印时间：</span><span class="info-value">${printDate}</span></div>
  </div>

  ${bomList.length > 0 ? `
  <div class="section">
    <div class="section-title">📦 物料明细（BOM）</div>
    <table>
      <thead>
        <tr>
          <th style="width:40px">#</th>
          <th style="width:70px">类型</th>
          <th style="width:100px">物料编码</th>
          <th>物料名称</th>
          <th style="width:90px">规格</th>
          <th style="width:50px">单位</th>
          <th style="width:70px">用量</th>
          <th style="width:60px">损耗</th>
          <th style="width:80px">单价</th>
          <th style="width:90px">金额</th>
        </tr>
      </thead>
      <tbody>
        ${bomRows}
      </tbody>
    </table>
  </div>` : ''}

  ${processList.length > 0 ? `
  <div class="section">
    <div class="section-title">🔧 工序明细</div>
    <table>
      <thead>
        <tr>
          <th style="width:40px">#</th>
          <th>工序名称</th>
          <th style="width:120px">金额</th>
        </tr>
      </thead>
      <tbody>
        ${processRows}
      </tbody>
    </table>
  </div>` : ''}

  ${secondaryProcessList.length > 0 ? `
  <div class="section">
    <div class="section-title">🎨 二次工艺</div>
    <table>
      <thead>
        <tr>
          <th style="width:40px">#</th>
          <th>工艺名称</th>
          <th style="width:120px">单价</th>
        </tr>
      </thead>
      <tbody>
        ${secRows}
      </tbody>
    </table>
  </div>` : ''}

  <div class="summary-section">
    <div class="summary-title">📊 成本与报价汇总</div>
    <div class="summary-row">
      <span class="summary-row-label">💰 物料成本</span>
      <span class="summary-row-value">${formatMoney(materialCost)}</span>
    </div>
    <div class="summary-row">
      <span class="summary-row-label">🔧 工序成本</span>
      <span class="summary-row-value">${formatMoney(processCost)}</span>
    </div>
    <div class="summary-row">
      <span class="summary-row-label">📋 其他成本</span>
      <span class="summary-row-value">${formatMoney(otherCost)}</span>
    </div>
    <div class="summary-row highlight">
      <span class="summary-row-label">🏷️ 单件总成本</span>
      <span class="summary-row-value">${formatMoney(totalCost)}</span>
    </div>
    <div class="summary-row profit">
      <span class="summary-row-label">💵 单件利润</span>
      <span class="summary-row-value">${formatMoney(profit)}</span>
    </div>
    <div class="summary-row highlight">
      <span class="summary-row-label">🏆 单件报价（对外）</span>
      <span class="summary-row-value">${formatMoney(totalPrice)}</span>
    </div>
    <div class="summary-row" style="justify-content: flex-end; margin-top: 8px;">
      <span class="summary-row-label">利润率：</span>
      <span class="summary-row-value profit">${actualProfitRate}%</span>
    </div>
  </div>

  <div class="footer">本报价单由系统自动生成 · 仅供参考 · 最终报价以双方确认为准</div>
</body>
</html>`;
};
