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
        <td>${esc(item.progressStage || item.processName)}</td>
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
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: "Microsoft YaHei", "PingFang SC", "SimSun", sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; line-height: 1.6; margin: 0; padding: 16px; }
    .title { text-align: center; font-size: 24px; font-weight: 700; letter-spacing: 6px; margin: 4px 0 2px; color: #1a1a1a; }
    .subtitle { text-align: center; font-size: 12px; color: #666; margin-bottom: 14px; }
    .info-bar { display: flex; justify-content: space-between; padding: 8px 4px; border-top: 2px solid #1a1a1a; border-bottom: 1px solid #999; margin-bottom: 16px; font-size: 12px; }
    .info-item { color: #333; }
    .info-item b { font-weight: 700; }
    .section { margin-bottom: 18px; page-break-inside: avoid; }
    .section-title { font-size: 13px; font-weight: 700; margin-bottom: 6px; color: #1a1a1a; }
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    th, td { border: 1px solid #333; padding: 5px 8px; vertical-align: middle; word-break: break-all; }
    th { background: #f0f0f0; font-weight: 700; text-align: center; }
    .c { text-align: center; }
    .r { text-align: right; }
    .b { font-weight: 700; }
    .totals-row td { background: #f7f7f7; font-weight: 700; }
    .summary-table { width: 60%; margin: 0 auto; }
    .summary-table td { padding: 6px 10px; }
    .summary-table .label { font-weight: 600; width: 40%; }
    .summary-table .highlight td { background: #fdf6ec; font-size: 13px; }
    .summary-table .highlight .value { color: #c2410c; font-size: 15px; }
    .footer { margin-top: 28px; text-align: center; font-size: 10.5px; color: #888; padding-top: 12px; border-top: 1px solid #ccc; }
    .print-btn-bar { position: fixed; top: 10px; right: 10px; z-index: 999; }
    .print-btn { padding: 8px 18px; background: #1a1a1a; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    @media print {
      .print-btn-bar { display: none; }
      body { padding: 0; }
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
      <thead>
        <tr>
          <th style="width:36px">序号</th>
          <th style="width:64px">物料类型</th>
          <th style="width:100px">物料编码</th>
          <th>物料名称</th>
          <th style="width:80px">规格/幅宽</th>
          <th style="width:44px">单位</th>
          <th style="width:60px">用量</th>
          <th style="width:76px">开发采购用量</th>
          <th style="width:60px">损耗率%</th>
          <th style="width:70px">单价</th>
          <th style="width:80px">总价</th>
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
    <table style="width:70%">
      <thead>
        <tr>
          <th style="width:48px">序号</th>
          <th>进度阶段</th>
          <th style="width:90px">倍率</th>
          <th style="width:100px">工序合计</th>
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
    <table style="width:60%">
      <thead>
        <tr>
          <th style="width:48px">序号</th>
          <th>工艺名称</th>
          <th style="width:110px">单价</th>
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
