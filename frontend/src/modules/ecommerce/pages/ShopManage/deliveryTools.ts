import dayjs from 'dayjs';
import { exportToExcel } from '@/utils/excelExport';
import type { ShopOrder } from '@/services/shop/shopApi';

/**
 * D-770：店铺订单「导出 Excel」与「打印发货单」。
 *
 * <p>两件事必须区分清楚：
 * <ul>
 *   <li><b>导出</b>：给运营自己看数据、做对账、再导入别处；</li>
 *   <li><b>发货单</b>：给仓库/快递员照着打单，需要的是「一个订单一块」而不是一张流水表。</li>
 * </ul>
 * 两者字段取舍不同，所以没做成同一个功能。
 */

const STATUS_TEXT: Record<string, string> = {
  PENDING_SHIP: '待发货',
  SHIPPED: '已发货',
  CANCELLED: '已取消',
};

const yuan = (v?: number | null) =>
  v == null ? '' : `¥${Number(v).toFixed(2)}`;

const fmtTime = (v?: string | null) =>
  v ? String(v).replace('T', ' ').slice(0, 19) : '';

/**
 * 导出订单（勾选优先，未勾选则导出当前列表全部）。
 *
 * <p>导出的是**订单头**维度；商品明细在详情里，不摊到主表，
 * 因为一行多商品会让 Excel 失去可读性。需要看明细请用「打印发货单」。
 */
export async function exportShopOrders(
  orders: ShopOrder[],
  selectedIds: string[],
  shopName: string,
): Promise<number> {
  const picked = selectedIds.length
    ? orders.filter((o) => selectedIds.includes(o.id))
    : orders;

  if (!picked.length) {
    throw new Error('没有可导出的订单，请先勾选或确认列表不为空');
  }

  const rows = picked.map((o) => ({
    orderNo: o.orderNo,
    status: STATUS_TEXT[o.status] ?? o.status,
    customerName: o.customerName,
    phone: o.phone,
    address: o.address,
    itemCount: o.itemCount,
    goodsAmount: yuan(o.goodsAmount ?? o.totalAmount),
    shippingFee: yuan(o.shippingFee),
    totalAmount: yuan(o.totalAmount),
    expressCompany: o.expressCompany ?? '',
    expressNo: o.expressNo ?? '',
    outstockNo: o.outstockNo ?? '',
    shipTime: fmtTime(o.shipTime),
    createTime: fmtTime((o as { createTime?: string }).createTime),
  }));

  await exportToExcel(
    rows,
    [
      { header: '订单号', key: 'orderNo', width: 22 },
      { header: '状态', key: 'status', width: 10 },
      { header: '收货人', key: 'customerName', width: 12 },
      { header: '手机号', key: 'phone', width: 16 },
      { header: '收货地址', key: 'address', width: 36 },
      { header: '件数', key: 'itemCount', width: 8 },
      { header: '商品金额', key: 'goodsAmount', width: 12 },
      { header: '运费', key: 'shippingFee', width: 10 },
      { header: '实付合计', key: 'totalAmount', width: 12 },
      { header: '快递公司', key: 'expressCompany', width: 14 },
      { header: '快递单号', key: 'expressNo', width: 20 },
      { header: '出库单号', key: 'outstockNo', width: 20 },
      { header: '发货时间', key: 'shipTime', width: 20 },
      { header: '下单时间', key: 'createTime', width: 20 },
    ],
    `店铺订单_${shopName || 'shop'}_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`,
  );

  return rows.length;
}

/**
 * 打印发货单（一个订单一块，A4 纵向自动分页）。
 *
 * <p>用浏览器原生打印窗口而不是转 PDF：
 * 快递员手上通常就是一台打印机，「直接打印」比「先存 PDF 再打开」少两步。
 *
 * <p>刻意包含：收货信息 + 商品明细 + 快递信息 + 店铺信息。
 * 少任何一项仓库都要回头翻系统，实际用起来就会退回手写。
 */
export function printDeliveryNotes(
  orders: ShopOrder[],
  itemsByOrderId: Record<string, Array<{ styleNo?: string; styleName?: string; color?: string; size?: string; quantity?: number }>>,
  shopName: string,
): number {
  const picked = orders.filter((o) => o.status !== 'CANCELLED');
  if (!picked.length) {
    throw new Error('没有可打印的订单（已取消的订单不打印）');
  }

  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) {
    throw new Error('打印窗口被浏览器拦截，请允许弹出窗口后重试');
  }

  const esc = (v: unknown) =>
    String(v ?? '').replace(/[<>&"]/g, (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));

  const blocks = picked.map((o) => {
    const items = itemsByOrderId[o.id] ?? [];
    const rows = items.length
      ? items.map((it) => `
          <tr>
            <td>${esc(it.styleNo)}</td>
            <td>${esc(it.styleName)}</td>
            <td>${esc(it.color)}</td>
            <td>${esc(it.size)}</td>
            <td class="num">${esc(it.quantity)}</td>
          </tr>`).join('')
      : '<tr><td colspan="5" class="muted">（无明细，请在系统中核对）</td></tr>';

    return `
      <section class="note">
        <div class="hd">
          <div class="shop">${esc(shopName || '店铺')}</div>
          <div class="no">发货单 ${esc(o.orderNo)}</div>
        </div>
        <div class="grid">
          <div><b>收货人</b>${esc(o.customerName)} <b>电话</b>${esc(o.phone)}</div>
          <div><b>地址</b>${esc(o.address)}</div>
          <div><b>件数</b>${esc(o.itemCount)} <b>状态</b>${esc(STATUS_TEXT[o.status] ?? o.status)}</div>
          <div><b>快递</b>${esc(o.expressCompany || '—')} <b>单号</b>${esc(o.expressNo || '—')}</div>
        </div>
        <table>
          <thead><tr><th>款号</th><th>品名</th><th>颜色</th><th>尺码</th><th class="num">数量</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="ft">
          <span>合计 ${esc(o.itemCount)} 件 应收 ${esc(yuan(o.totalAmount))}</span>
          <span class="sign">发货人签字：____________  日期：____________</span>
        </div>
      </section>`;
  }).join('');

  win.document.write(`<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>发货单 ${esc(shopName || '')}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: "PingFang SC","Microsoft YaHei",sans-serif; color:#111; margin:0; }
  .note { page-break-after: always; }
  .note:last-child { page-break-after: auto; }
  .hd { display:flex; justify-content:space-between; align-items:baseline;
        border-bottom:2px solid #111; padding-bottom:6px; margin-bottom:10px; }
  .shop { font-size:18px; font-weight:700; }
  .no { font-size:13px; }
  .grid { font-size:12px; line-height:1.9; margin-bottom:10px; }
  .grid b { display:inline-block; min-width:56px; color:#555; font-weight:600; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th,td { border:1px solid #999; padding:6px 8px; }
  th { background:#f2f2f2; text-align:left; }
  td.num, th.num { text-align:right; }
  .muted { color:#888; text-align:center; }
  .ft { display:flex; justify-content:space-between; font-size:12px; margin-top:12px; }
  .sign { color:#444; }
</style></head>
<body>${blocks}</body></html>`);
  win.document.close();
  win.focus();
  // 等布局完成再调打印，避免首屏未渲染完就打印
  win.setTimeout(() => win.print(), 200);
  return picked.length;
}