import { buildPrintHeader } from '@/utils/safePrint';
import { formatMoney } from '@/utils/format';
import { SOURCE_TYPE_TEXT } from '../components/counterpartyConstants';

/** 打印端独立的状态文案（打印窗口无 CSS 变量，也不能依赖组件） */
const STATUS_TEXT: Record<string, string> = {
  PENDING: '待确认',
  CONFIRMED: '已确认',
  SETTLING: '结算中',
  SETTLED: '已结清',
  CANCELLED: '已取消',
};

export interface StatementBillRow {
  billNo?: string;
  sourceType?: string;
  sourceNo?: string;
  orderNo?: string;
  styleNo?: string;
  amount?: number;
  settledAmount?: number;
  status?: string;
  settlementMonth?: string;
  createTime?: string;
  remark?: string;
}

/** D-474：对账单可勾选的列（打印时想隐藏某列就勾掉） */
export const STATEMENT_COLUMNS = [
  { key: 'billNo', label: '账单编号' },
  { key: 'source', label: '来源模块' },
  { key: 'sourceNo', label: '来源单号' },
  { key: 'month', label: '结算月' },
  { key: 'amount', label: '金额' },
  { key: 'settled', label: '已结清' },
  { key: 'unpaid', label: '未结清' },
  { key: 'status', label: '状态' },
];

export interface CounterpartyStatementParams {
  /** 打印时显示哪些列（不传=全部显示） */
  columns?: string[];
  counterpartyName?: string;
  /** 类型文案（员工/工厂/供应商/客户） */
  counterpartyTypeText?: string;
  /** 对账期间，如 2026-09；为空表示全部 */
  monthLabel?: string;
  rows: StatementBillRow[];
  totalAmount: number;
  settledAmount: number;
  unpaidAmount: number;
  printedBy?: string;
  tenantName?: string;
}

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const num = (v?: number): number => Number(v ?? 0);

/**
 * D-474 往来对账单打印 HTML。
 *
 * 用途：一个往来对象（员工/工厂/布行/客户）一张，打印或导出后发给对方对账确认。
 * 内容：对象信息 + 账单明细（含来源模块、金额、已付、未付）+ 合计 + 对方签字栏。
 */
/** 单个对象的对账单主体（不含 html/head 外壳，便于多对象拼接） */
const buildStatementBody = (p: CounterpartyStatementParams, isLast: boolean): string => {
  const rows = p.rows ?? [];
  // D-474：列显示控制（打印时可勾掉不想出现的列）
  const show = (key: string): boolean => !p.columns || p.columns.includes(key);
  // 序号 + 非金额列（合计行 colspan 用）
  const headColCount = 1 + ['billNo', 'source', 'sourceNo', 'month'].filter(show).length;
  const amountColCount = ['amount', 'settled', 'unpaid'].filter(show).length + (show('status') ? 1 : 0);
  const totalColCount = headColCount + amountColCount;
  const rowsHtml = rows
    .map((b, idx) => {
      const amount = num(b.amount);
      const settled = num(b.settledAmount);
      const rest = amount - settled;
      const negCls = amount < 0 ? ' neg' : '';
      const unpaidCls = rest > 0 ? ' unpaid' : '';
      const sourceText = SOURCE_TYPE_TEXT[b.sourceType ?? ''] ?? b.sourceType ?? '-';
      const statusText = STATUS_TEXT[b.status ?? ''] ?? b.status ?? '-';
      return `
      <tr>
        <td class="c">${idx + 1}</td>
        ${show('billNo') ? `<td>${esc(b.billNo)}</td>` : ''}
        ${show('source') ? `<td>${esc(sourceText)}</td>` : ''}
        ${show('sourceNo') ? `<td>${esc(b.sourceNo || b.orderNo || '-')}</td>` : ''}
        ${show('month') ? `<td>${esc(b.settlementMonth || '-')}</td>` : ''}
        ${show('amount') ? `<td class="r${negCls}">${formatMoney(amount)}</td>` : ''}
        ${show('settled') ? `<td class="r">${formatMoney(settled)}</td>` : ''}
        ${show('unpaid') ? `<td class="r${unpaidCls}">${formatMoney(rest)}</td>` : ''}
        ${show('status') ? `<td class="c">${esc(statusText)}</td>` : ''}
      </tr>`;
    })
    .join('');

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const printTime = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
    + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());

  return `<div class="statement-page" style="${isLast ? '' : 'page-break-after: always;'}">
${buildPrintHeader(p.tenantName, '往来对账单')}
<head>
<meta charset="utf-8" />
<title>往来对账单 - ${esc(p.counterpartyName)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: "Microsoft YaHei", SimSun, sans-serif; color: #000; font-size: 12px; margin: 0; padding: 12px; }
  h1 { font-size: 18px; text-align: center; margin: 0 0 4px; }
  .sub { text-align: center; color: #555; font-size: 12px; margin-bottom: 12px; }
  .info { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .info td { border: 1px solid #333; padding: 5px 8px; font-size: 12px; }
  .info td.k { background: #f2f2f2; width: 90px; font-weight: 600; }
  table.bills { width: 100%; border-collapse: collapse; }
  table.bills th, table.bills td { border: 1px solid #333; padding: 4px 6px; font-size: 11px; }
  table.bills th { background: #f2f2f2; font-weight: 600; text-align: center; }
  td.c { text-align: center; }
  td.r { text-align: right; }
  td.neg { color: #c00000; }
  td.unpaid { color: #c00000; font-weight: 600; }
  tfoot td { font-weight: 700; background: #fafafa; }
  .sign { margin-top: 22px; width: 100%; }
  .sign td { font-size: 12px; padding: 6px 4px; border: none; }
  .line { display: inline-block; min-width: 160px; border-bottom: 1px solid #333; }
  .print-btn { position: fixed; right: 16px; top: 16px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
  @media print { .print-btn { display: none; } }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">打印</button>
${buildPrintHeader(p.tenantName, '往来对账单')}
<div class="sub">对账期间：${esc(p.monthLabel || '全部')}</div>

<table class="info">
  <tr>
    <td class="k">往来对象</td><td>${esc(p.counterpartyName)}</td>
    <td class="k">对象类型</td><td>${esc(p.counterpartyTypeText || '-')}</td>
    <td class="k">打印时间</td><td>${esc(printTime)}</td>
  </tr>
</table>

<table class="bills">
  <thead>
    <tr>
      <th style="width:36px">序号</th>
      <th>账单编号</th>
      <th style="width:96px">来源模块</th>
      <th style="width:110px">来源单号</th>
      <th style="width:64px">结算月</th>
      <th style="width:84px">金额</th>
      <th style="width:84px">已付</th>
      <th style="width:84px">未付</th>
      <th style="width:64px">状态</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml || `<tr><td colspan="${totalColCount}" class="c">暂无账单明细</td></tr>`}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="${headColCount}" class="c">合计（${rows.length} 笔）</td>
      ${show('amount') ? `<td class="r">${formatMoney(p.totalAmount)}</td>` : ''}
      ${show('settled') ? `<td class="r">${formatMoney(p.settledAmount)}</td>` : ''}
      ${show('unpaid') ? `<td class="r unpaid">${formatMoney(p.unpaidAmount)}</td>` : ''}
      ${show('status') ? '<td></td>' : ''}
    </tr>
  </tfoot>
</table>

<table class="sign">
  <tr>
    <td>制表：${esc(p.printedBy || '-')}</td>
    <td style="text-align:right">对方确认签字：<span class="line">&nbsp;</span></td>
    <td style="text-align:right" width="150">日期：<span class="line">&nbsp;</span></td>
  </tr>
  <tr>
    <td colspan="3" style="color:#555;font-size:11px">
      说明：本对账单由系统自动生成，金额为对应期间内已推送账单的累计；未付金额为本对账单出具时尚未支付的余额。
    </td>
  </tr>
</table>
</div>`;
};

/** D-474：单个对象的对账单（完整 HTML，可直接打印） */
export const buildCounterpartyStatementHtml = (p: CounterpartyStatementParams): string =>
  wrapStatementsHtml([buildStatementBody(p, true)], `往来对账单 - ${p.counterpartyName || ''}`);

/**
 * D-474：批量打印——多个对象各出一页对账单，连续打印后按对象分开，
 * 适合月底给所有工厂/员工一次性出单（每页底部都有对方签字栏）。
 */
export const buildMultiCounterpartyStatementHtml = (
  list: CounterpartyStatementParams[],
  title: string = '往来对账单',
): string => {
  const bodies = list.map((p, i) => buildStatementBody(p, i === list.length - 1)).join('\n');
  return wrapStatementsHtml(bodies ? [bodies] : [], title);
};

function wrapStatementsHtml(parts: string[], title: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: "Microsoft YaHei", SimSun, sans-serif; color: #000; font-size: 12px; margin: 0; padding: 12px; }
  h1 { font-size: 18px; text-align: center; margin: 0 0 4px; }
  .sub { text-align: center; color: #555; font-size: 12px; margin-bottom: 12px; }
  .info { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .info td { border: 1px solid #333; padding: 5px 8px; font-size: 12px; }
  .info td.k { background: #f2f2f2; width: 90px; font-weight: 600; }
  table.bills { width: 100%; border-collapse: collapse; }
  table.bills th, table.bills td { border: 1px solid #333; padding: 4px 6px; font-size: 11px; }
  table.bills th { background: #f2f2f2; font-weight: 600; text-align: center; }
  td.c { text-align: center; }
  td.r { text-align: right; }
  td.neg { color: #c00000; }
  td.unpaid { color: #c00000; font-weight: 600; }
  tfoot td { font-weight: 700; background: #fafafa; }
  .sign { margin-top: 22px; width: 100%; }
  .sign td { font-size: 12px; padding: 6px 4px; border: none; }
  .line { display: inline-block; min-width: 160px; border-bottom: 1px solid #333; }
  .print-btn { position: fixed; right: 16px; top: 16px; padding: 6px 14px; font-size: 13px; cursor: pointer; }
  @media print { .print-btn { display: none; } }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">打印</button>
${parts.join('\n')}
</body>
</html>`;
}
