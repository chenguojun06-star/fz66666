import type { TicketData } from '@/services/ticket/ticketApi';
import { formatMoney } from '@/utils/format';
import { formatDateTime } from '@/utils/datetime';

/**
 * 电子小票打印 HTML 构建器（**全场唯一的小票版式 + 打印通道**）。
 *
 * <p>为什么要有这个文件（2026-10-21 顾客报障）：
 * 打印电子小票一次出 2 张单，且「今日单据打印」与「电子小票」是两种版式。
 * 核实后系统里曾有三套并存实现：
 *   ① `PosTerminal/TicketPrint.tsx` —— 58mm 热敏版式、无二维码、iframe 打印
 *   ② `TicketModal/TicketReceipt.tsx` —— 带二维码版式，但打印走 `window.print()`
 *      + `visibility` 老方案（TicketPrint 的注释里就记载：这方案隐藏元素仍占
 *      布局高度，会把整页带进打印 → 出 2 张纸）
 *   ③ `static/ticket/index.html` —— 手机扫码的 H5 页
 * 本文件把 ①② 的打印内容统一为**一种版式（带二维码）**，并统一走
 * 独立 iframe 文档打印（见 {@link printTicketHtml}）。
 *
 * <p>设计约束：
 * - **纯函数**：输入 TicketData + 二维码 SVG 字符串，输出完整 HTML 文档。
 *   不碰 DOM、不读 window —— 可直接单测（见 ticketPrintHtml.test.ts）。
 * - **不外链资源**：商品图一律不放（避免 OSS 跨域空白/挂图拖慢打印）。
 *   小票是单据不是商品页，图在 H5 页和后台预览里都有。
 * - **一份 HTML 一张票**：调用方只把这一份文档写进 iframe，
 *   页面开几个弹窗、背景多复杂都不影响打印内容。
 */

const PAY_LABEL: Record<string, string> = {
  CASH: '现金',
  WECHAT: '微信',
  ALIPAY: '支付宝',
  CARD: '刷卡',
  CREDIT: '挂账',
  MEMBER_BALANCE: '会员余额',
};

const SOURCE_LABEL: Record<string, string> = {
  POS_SALE: '收银台',
  SHOP_ORDER: '店铺订单',
  OUTSTOCK: '批发出库',
};

const RETURN_POLICY =
  '收到货后请第一时间检查，如有质量问题请第一时间联系我们，超过7天一概不退不换。' +
  '本店货品15天内可调码，不调色不调款，逾期不受理，谢谢！';

const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );

export interface BuildTicketPrintHtmlOptions {
  /**
   * 二维码 SVG 的 outerHTML（调用方从屏幕上已渲染的 QRCodeSVG 取）。
   * 传空字符串则打印件不带二维码 —— 只在预览还没渲染出来时发生，
   * 正常流程取不到时会让收银员看见「无码票」，比静默出一张
   * 不能签收的票更好。
   */
  qrSvg?: string;
  /** 二维码指向的 H5 地址（仅用于 <title> 与兜底文案） */
  h5Url?: string;
}

/** 颜色 × 码数矩阵（保序：按明细出现顺序） */
function matrixHtml(matrix: NonNullable<TicketData['matrix']>): string {
  if (!matrix.length) return '';
  const sizes = Object.keys(matrix[0]?.sizes ?? {});
  if (!sizes.length) return '';
  return (
    '<table class="m"><thead><tr><th>颜色\\码数</th>' +
    sizes.map((s) => `<th>${esc(s)}</th>`).join('') +
    '</tr></thead><tbody>' +
    matrix
      .map(
        (row) =>
          `<tr><td>${esc(row.color)}</td>` +
          sizes.map((s) => `<td>${row.sizes[s] || '-'}</td>`).join('') +
          '</tr>',
      )
      .join('') +
    '</tbody></table>'
  );
}

/**
 * 构建单张电子小票的完整打印文档（A4 纵向，一页设计）。
 *
 * 版式与后台 `TicketReceipt` 预览、H5 手机页保持同一套信息层级：
 * 票号/来源 → 商品明细 → 汇总 → 二维码（扫码签收） → 售后政策。
 */
export function buildTicketPrintHtml(
  ticket: TicketData,
  options: BuildTicketPrintHtmlOptions = {},
): string {
  const { qrSvg = '', h5Url = '' } = options;
  const items = ticket.items ?? [];
  const discount = Number(ticket.discountAmount ?? 0);
  const shipping = Number(ticket.shippingFee ?? 0);
  const total = Number(ticket.totalAmount ?? 0);
  const goods = Number(ticket.goodsAmount ?? 0);
  const receivable = Number(ticket.receivableAmount ?? 0);

  const rows = items
    .map(
      (it) => `<tr>
        <td class="name">${esc(it.styleNo || it.skuCode || '—')}${it.styleName ? `<div class="sub">${esc(it.styleName)}</div>` : ''}${[it.color, it.size].filter(Boolean).length ? `<div class="sub">${esc([it.color, it.size].filter(Boolean).join(' · '))}</div>` : ''}</td>
        <td class="num">${it.quantity ?? 0}</td>
        <td class="amt">${esc(formatMoney(Number(it.amount ?? 0)))}</td>
      </tr>`,
    )
    .join('');

  const payLine =
    ticket.payMethod
      ? `<div class="row"><span>${esc(PAY_LABEL[String(ticket.payMethod)] || ticket.payMethod)}${ticket.payStatus === 'UNPAID' ? '（挂账）' : ''}</span><span>${
          receivable > 0
            ? `已收 ${esc(formatMoney(Number(ticket.receivableReceived ?? 0)))} / ${esc(formatMoney(receivable))}`
            : esc(formatMoney(total))
        }</span></div>`
      : '';

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>电子小票 ${esc(ticket.ticketNo)}</title>
<style>
  @page { margin: 10mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font: 13px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1a1a1a; }
  .ticket { max-width: 460px; margin: 0 auto; }
  .head { text-align: center; padding-bottom: 10px; border-bottom: 1px dashed #999; }
  .head .no { font-size: 17px; font-weight: 600; }
  .head .meta { font-size: 12px; color: #666; margin-top: 4px; }
  .head .meta span + span::before { content: "·"; margin: 0 6px; }
  .sec { padding: 10px 0; border-bottom: 1px dashed #ddd; }
  table.m { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  table.m th, table.m td { border: 1px solid #ddd; padding: 3px 8px; text-align: center; }
  table.m th { background: #fafafa; font-weight: 500; color: #666; }
  table.g { width: 100%; border-collapse: collapse; }
  table.g td { padding: 4px 0; vertical-align: top; }
  table.g td.num { width: 48px; text-align: right; }
  table.g td.amt { width: 90px; text-align: right; font-weight: 500; white-space: nowrap; }
  .sub { font-size: 11px; color: #888; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .row.total { font-weight: 600; }
  .qr { text-align: center; padding-top: 12px; }
  .qr svg { display: inline-block; }
  .qr .tip { font-size: 12px; color: #666; margin-top: 6px; }
  .qr .none { font-size: 12px; color: #c00; }
  .policy { font-size: 11.5px; color: #999; text-align: center; line-height: 1.7; padding-top: 10px; }
  .foot { text-align: center; font-size: 11px; color: #bbb; margin-top: 10px; }
</style></head>
<body>
  <div class="ticket">
    <div class="head">
      <div class="no">${esc(ticket.ticketNo)}</div>
      <div class="meta">
        <span>${esc(SOURCE_LABEL[String(ticket.sourceBizType)] || ticket.sourceBizType)}</span>
        <span>单号 ${esc(ticket.sourceBizNo)}</span>
        <span>${ticket.status === 'SIGNED' ? `已签收${ticket.signedBy ? `（${esc(ticket.signedBy)}）` : ''}` : ticket.status === 'VOID' ? '已作废' : '待签收'}</span>
      </div>
    </div>

    <div class="sec">
      <table class="g"><tbody>${rows}</tbody></table>
      ${matrixHtml(ticket.matrix ?? [])}
    </div>

    <div class="sec">
      <div class="row"><span>销售：${ticket.itemCount ?? 0} 件${discount > 0 ? `&nbsp;&nbsp;折扣 -${esc(formatMoney(discount))}` : ''}</span><span>总额：<b>${esc(formatMoney(total))}</b></span></div>
      ${shipping > 0 ? `<div class="row"><span>运费</span><span>${esc(formatMoney(shipping))}</span></div>` : ''}
      ${payLine}
      <div class="row"><span>开单时间</span><span>${esc(ticket.createTime ? formatDateTime(ticket.createTime) : '-')}</span></div>
      ${ticket.serverName ? `<div class="row"><span>店员</span><span>${esc(ticket.serverName)}</span></div>` : ''}
      ${ticket.customerName ? `<div class="row"><span>客户</span><span>${esc(ticket.customerName)}</span></div>` : ''}
      ${ticket.customerPhone ? `<div class="row"><span>联系电话</span><span>${esc(ticket.customerPhone)}</span></div>` : ''}
      ${ticket.remark ? `<div class="row"><span>备注</span><span>${esc(ticket.remark)}</span></div>` : ''}
    </div>

    <div class="sec qr">
      ${
        qrSvg
          ? `${qrSvg}<div class="tip">手机扫码查看小票${ticket.status === 'SIGNED' ? '' : '，收货后可确认签收'}</div>`
          : '<div class="none">二维码未生成，请关掉弹窗重新打开后再打印</div>'
      }
    </div>

    <div class="policy">
      提醒：${esc(RETURN_POLICY)}
      ${goods > 0 && goods !== total ? `<br>商品 ${esc(formatMoney(goods))}${discount > 0 ? `&nbsp;&nbsp;优惠 ${esc(formatMoney(discount))}` : ''}` : ''}
    </div>
    <div class="foot">小云 · 电子小票${h5Url ? ` · ${esc(h5Url)}` : ''}</div>
  </div>
</body></html>`;
}
