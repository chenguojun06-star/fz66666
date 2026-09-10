import { formatMoney } from '@/utils/format';
import type { StyleBom } from '@/types/style';

/** 与页面一致的物料类型文案映射（打印端独立，避免引入组件依赖） */
const MATERIAL_TYPE_LABELS: Record<string, string> = {
  fabric: '面料', FABRIC: '面料', lining: '里料', LINING: '里料',
  accessory: '辅料', ACCESSORY: '辅料', other: '其它', OTHER: '其它',
};
const getMaterialTypeLabel = (v: string) => MATERIAL_TYPE_LABELS[v] || v || '-';

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export interface BuildQuotationPrintHtmlParams {
  bomList: StyleBom[];
  processList: any[];
  secondaryProcessList: any[];
  styleNo?: string;
  /** 打印人（当前操作人姓名） */
  printedBy?: string;
  materialCost: number;
  processCost: number;
  otherCost: number;
  totalCost: number;
  totalPrice: number;
  profit: number;
  actualProfitRate: string;
}

/**
 * 报价单打印 HTML —— D-170 重写：
 * 1. 标准打印表格：黑框线、中文列头，列与页面报价单完全一致（物料明细含开发采购用量，
 *    工序明细含倍率，成本核算汇总含目标利润率/预计利润/单件成本/最终报价）
 * 2. 去英文（"Quotation Sheet"）/emoji；具体色值（独立打印窗口无 CSS 变量）
 */
export const buildQuotationPrintHtml = (params: BuildQuotationPrintHtmlParams): string => {
  const {
    bomList,
    processList,
    secondaryProcessList,
    styleNo,
    printedBy,
    materialCost,
    processCost,
    otherCost,
    totalCost,
    totalPrice,
    profit,
    actualProfitRate,
  } = params;

  // 物料明细行（列与页面 QuotationBomSection 一致）
  const bomRows =
    bomList.length > 0
      ? bomList
          .map((item: any, idx: number) => {
            const usage = Number(item.usageAmount) || 0;
            const devUsage = Number(item.devUsageAmount) || 0;
            const loss = Number(item.lossRate) || 0;
            const unitPrice = Number(item.unitPrice) || 0;
            let rowTotal: number;
            const rawTotal = item.totalPrice;
            const hasTotal = rawTotal !== undefined && rawTotal !== null && String(rawTotal).trim() !== '';
            if (hasTotal) {
              const n = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal);
              rowTotal = Number.isFinite(n) ? n : usage * (1 + loss / 100) * unitPrice;
            } else {
              rowTotal = usage * (1 + loss / 100) * unitPrice;
            }
            return `<tr>
        <td class="c">${idx + 1}</td>
        <td>${esc(getMaterialTypeLabel(item.materialType))}</td>
        <td>${esc(item.materialCode)}</td>
        <td>${esc(item.materialName)}</td>
        <td>${esc(item.specification)}</td>
        <td class="c">${esc(item.unit)}</td>
        <td class="r">${usage.toFixed(2)}</td>
        <td class="r">${devUsage > 0 ? devUsage.toFixed(2) : '-'}</td>
        <td class="r">${loss.toFixed(1)}%</td>
        <td class="r">${formatMoney(unitPrice)}</td>
        <td class="r b">${formatMoney(rowTotal)}</td>
      </tr>`;
          })
          .join('') +
        `<tr class="totals-row">
        <td class="c" colspan="10">物料成本</td>
        <td class="r b">${formatMoney(materialCost)}</td>
      </tr>`
      : '';

  // 工序明细行（列与页面 QuotationProcessSection 一致：倍率列）
  const processRows =
    processList.length > 0
      ? processList
          .map((item: any, idx: number) => {
            const rate = Number(item.rateMultiplier) || 1;
            const price = (Number(item.price) || 0) * rate;
            return `<tr>
        <td class="c">${idx + 1}</td>
        <td>${esc(item.processName || item.progressStage)}${item.progressStage && item.processName ? ` <span style="color:#888;font-size:${FS_SMALL - 1}px">(${esc(item.progressStage)})</span>` : ''}</td>
        <td class="c">${rate.toFixed(1)}</td>
        <td class="r b">${formatMoney(price)}</td>
      </tr>`;
          })
          .join('') +
        `<tr class="totals-row">
        <td class="c" colspan="3">工序小计</td>
        <td class="r b">${formatMoney(processCost)}</td>
      </tr>`
      : '';

  // 二次工艺行
  const secRows =
    secondaryProcessList.length > 0
      ? secondaryProcessList
          .map((item: any, idx: number) => {
            return `<tr>
        <td class="c">${idx + 1}</td>
        <td>${esc(item.processName)}</td>
        <td class="r b">${formatMoney(Number(item.unitPrice) || 0)}</td>
      </tr>`;
          })
          .join('')
      : '';

  // D-345 版面自适应：内容越多字号/行距/内边距越小，避免挤爆换页后行列错位
  const totalRows = bomList.length + processList.length + secondaryProcessList.length;
  const dense = totalRows > 24 ? 3 : totalRows > 12 ? 2 : totalRows > 6 ? 1 : 0;
  const FS = [12.5, 11.5, 10.5, 9.5][dense];       // 正文字号 px
  const FS_SMALL = [11, 10, 9.5, 8.5][dense];      // 表内字号 px
  const CELL_PAD = ['5px 8px', '4px 6px', '3px 5px', '2px 4px'][dense];
  const ROW_LH = [1.6, 1.5, 1.4, 1.3][dense];

  const now = new Date();
  const printDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>报价单 - ${esc(styleNo || '')}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: "Microsoft YaHei", "PingFang SC", "SimSun", sans-serif; font-size: ${FS}px; color: #1a1a1a; background: #fff; line-height: ${ROW_LH}; margin: 0; padding: 12px; }
    .title { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 6px; margin: 2px 0 2px; color: #1a1a1a; }
    .subtitle { text-align: center; font-size: ${FS_SMALL}px; color: #999; letter-spacing: 2px; margin-bottom: 10px; }
    /* 信息栏：两列网格，左右各一列，天然对齐不散 */
    .info-bar { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; padding: 6px 2px; border-top: 2px solid #1a1a1a; border-bottom: 1px solid #bbb; margin-bottom: 12px; font-size: ${FS}px; }
    .info-item { color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .info-item b { font-weight: 700; }
    .section { margin-bottom: 14px; }
    .section-title { font-size: ${FS}px; font-weight: 700; margin: 0 0 5px; padding-left: 8px; border-left: 3px solid #1a1a1a; color: #1a1a1a; }
    /* 所有表格统一铺满同一左右边界 + 固定列宽，保证各区块列线上下对齐 */
    table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: ${FS_SMALL}px; }
    th, td { border: 1px solid #333; padding: ${CELL_PAD}; vertical-align: middle; }
    th { background: #f0f0f0; font-weight: 700; text-align: center; white-space: nowrap; }
    td { word-break: normal; overflow-wrap: anywhere; }
    .c { text-align: center; }
    .r { text-align: right; white-space: nowrap; }
    .nw { white-space: nowrap; }
    .b { font-weight: 700; }
    tbody tr { page-break-inside: avoid; }
    .totals-row td { background: #f7f7f7; font-weight: 700; }
    /* 成本汇总：与上方表格同宽同列线（标签列 75% / 数值列 25%） */
    .summary-table td { padding: ${CELL_PAD}; }
    .summary-table .label { font-weight: 600; }
    .summary-table .highlight td { background: #fdf6ec; }
    .summary-table .highlight .value { color: #c2410c; font-size: ${FS + 2}px; font-weight: 700; }
    .footer { margin-top: 18px; text-align: center; font-size: ${FS_SMALL}px; color: #888; padding-top: 8px; border-top: 1px solid #ccc; }
    .print-btn-bar { position: fixed; top: 10px; right: 10px; z-index: 999; }
    .print-btn { padding: 8px 18px; background: #1a1a1a; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    @media print {
      .print-btn-bar { display: none; }
      body { padding: 0; }
      .section { page-break-inside: auto; }
    }
  </style>
</head>
<body>
  <div class="print-btn-bar no-print">
    <button class="print-btn" onclick="window.print()">打印</button>
  </div>

  <div class="title">报 价 单</div>
  <div class="subtitle">QUOTATION</div>

  <div class="info-bar">
    <div class="info-item">款号：<b>${esc(styleNo || '-')}</b></div>
    ${printedBy ? `<div class="info-item">打印人：<b>${esc(printedBy)}</b></div>` : ''}
    <div class="info-item">打印时间：<b>${printDate}</b></div>
  </div>

  ${bomList.length > 0 ? `
  <div class="section">
    <div class="section-title">一、物料明细</div>
    <table>
      <colgroup>
        <col style="width:5%"><col style="width:8%"><col style="width:13%"><col style="width:19%">
        <col style="width:10%"><col style="width:5%"><col style="width:8%"><col style="width:9%">
        <col style="width:7%"><col style="width:8%"><col style="width:8%">
      </colgroup>
      <thead>
        <tr>
          <th>序号</th>
          <th>物料类型</th>
          <th>物料编码</th>
          <th>物料名称</th>
          <th>规格/幅宽</th>
          <th>单位</th>
          <th>用量</th>
          <th>开发用量</th>
          <th>损耗率%</th>
          <th>单价</th>
          <th>总价</th>
        </tr>
      </thead>
      <tbody>
        ${bomRows}
      </tbody>
    </table>
  </div>` : ''}

  ${processList.length > 0 ? `
  <div class="section">
    <div class="section-title">二、工序明细</div>
    <table>
      <colgroup>
        <col style="width:8%"><col style="width:52%"><col style="width:18%"><col style="width:22%">
      </colgroup>
      <thead>
        <tr>
          <th>序号</th>
          <th>工序</th>
          <th>倍率</th>
          <th>工序合计</th>
        </tr>
      </thead>
      <tbody>
        ${processRows}
      </tbody>
    </table>
  </div>` : ''}

  ${secondaryProcessList.length > 0 ? `
  <div class="section">
    <div class="section-title">三、二次工艺</div>
    <table>
      <colgroup>
        <col style="width:8%"><col style="width:70%"><col style="width:22%">
      </colgroup>
      <thead>
        <tr>
          <th>序号</th>
          <th>工艺名称</th>
          <th>单价</th>
        </tr>
      </thead>
      <tbody>
        ${secRows}
      </tbody>
    </table>
  </div>` : ''}

  <div class="section">
    <div class="section-title">四、成本核算汇总</div>
    <table class="summary-table">
      <colgroup><col style="width:75%"><col style="width:25%"></colgroup>
      <tbody>
        <tr><td class="label">物料成本</td><td class="r b">${formatMoney(materialCost)}</td></tr>
        <tr><td class="label">工序小计</td><td class="r b">${formatMoney(processCost)}</td></tr>
        ${otherCost > 0 ? `<tr><td class="label">其他成本</td><td class="r b">${formatMoney(otherCost)}</td></tr>` : ''}
        <tr><td class="label">单件成本</td><td class="r b">${formatMoney(totalCost)}</td></tr>
        <tr><td class="label">预计利润</td><td class="r b">${formatMoney(profit)}</td></tr>
        <tr><td class="label">目标利润率</td><td class="r">${actualProfitRate}%</td></tr>
        <tr class="highlight"><td class="label">最终报价</td><td class="r value b">${formatMoney(totalPrice)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="footer">
    ${printedBy ? `<div style="margin-bottom:4px">打印人：${esc(printedBy)} · 打印时间：${printDate}</div>` : ''}
    本报价单由系统自动生成 · 仅供参考 · 最终报价以双方确认为准
  </div>
</body>
</html>`;
};
