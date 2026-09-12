import { formatDateTimeSecond } from '@/utils/datetime';
import dayjs from 'dayjs';
import { safePrint } from '@/utils/safePrint';

export interface OutstockPrintData {
  outstockNo?: string;
  customerName?: string;
  customerPhone?: string;
  createTime?: string;
  creatorName?: string;
  styleNo?: string;
  styleName?: string;
  color?: string;
  size?: string;
  outstockQuantity?: number;
  salesPrice?: number;
  totalAmount?: number;
  trackingNo?: string;
  expressCompany?: string;
}

export function printOutstockRecord(record: OutstockPrintData): void {
  const printContent = `
    <html><head><title>出库单 - ${record.outstockNo || ''}</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "'Segoe UI'", Roboto, "'Helvetica Neue'", Arial, "'Noto Sans'", "'Microsoft YaHei'", "'PingFang SC'", serif; padding: 20px; }
      .header { text-align: center; margin-bottom: 20px; }
      .header h2 { margin: 0; }
      .info-row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin: 15px 0; }
      th, td { border: 1px solid var(--color-gray-800); padding: 8px; text-align: center; font-size: 13px; }
      th { background: var(--color-border-light); }
      .footer { margin-top: 20px; font-size: 12px; color: var(--color-gray-dark); }
    </style></head><body>
    <div class="header"><h2>出库单</h2><p>单号：${record.outstockNo || '-'}</p></div>
    <div class="info-row"><span>客户：${record.customerName || '-'}</span><span>电话：${record.customerPhone || '-'}</span></div>
    <div class="info-row"><span>日期：${record.createTime ? dayjs(record.createTime).format('YYYY-MM-DD HH:mm') : '-'}</span><span>操作人：${record.creatorName || '-'}</span></div>
    <table><tr><th>款号</th><th>款式名称</th><th>颜色</th><th>尺码</th><th>数量</th><th>单价</th><th>金额</th></tr>
    <tr><td>${record.styleNo || '-'}</td><td>${record.styleName || '-'}</td><td>${record.color || '-'}</td><td>${record.size || '-'}</td>
    <td>${record.outstockQuantity ?? '-'}</td><td>${record.salesPrice != null ? `¥${Number(record.salesPrice).toFixed(2)}` : '-'}</td><td>${record.totalAmount != null ? `¥${record.totalAmount}` : '-'}</td></tr></table>
    <div class="info-row"><span>快递：${record.expressCompany || '-'}</span><span>运单号：${record.trackingNo || '-'}</span></div>
    <div class="footer"><p>打印时间：${formatDateTimeSecond(new Date())}</p></div>
    </body></html>`;
  safePrint(printContent);
}

/**
 * D-363h：按出库单整单打印——一次出库（多码数/多款混合）共用同一出库单号，
 * 打印必须一张纸出完整单，而不是按明细行一张张打。
 */
export function printOutstockRecords(rows: OutstockPrintData[]): void {
  if (!rows || rows.length === 0) return;
  const head = rows[0];
  const totalQty = rows.reduce((sum, r) => sum + (Number(r.outstockQuantity) || 0), 0);
  const totalAmount = rows.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
  const bodyRows = rows.map((r) => `
    <tr>
      <td>${r.styleNo || '-'}</td>
      <td>${r.styleName || '-'}</td>
      <td>${r.color || '-'}</td>
      <td>${r.size || '-'}</td>
      <td>${r.outstockQuantity ?? '-'}</td>
      <td>${r.salesPrice != null ? `¥${Number(r.salesPrice).toFixed(2)}` : '-'}</td>
      <td>${r.totalAmount != null ? `¥${Number(r.totalAmount).toFixed(2)}` : '-'}</td>
    </tr>`).join('');
  const printContent = `
    <html><head><title>出库单 - ${head.outstockNo || ''}</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "'Segoe UI'", Roboto, "'Helvetica Neue'", Arial, "'Noto Sans'", "'Microsoft YaHei'", "'PingFang SC'", serif; padding: 20px; }
      .header { text-align: center; margin-bottom: 20px; }
      .header h2 { margin: 0; }
      .info-row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin: 15px 0; }
      th, td { border: 1px solid var(--color-gray-800); padding: 8px; text-align: center; font-size: 13px; }
      th { background: var(--color-border-light); }
      tr.total td { font-weight: 700; background: var(--color-border-light); }
      .footer { margin-top: 20px; font-size: 12px; color: var(--color-gray-dark); }
    </style></head><body>
    <div class="header"><h2>出库单</h2><p>单号：${head.outstockNo || '-'}</p></div>
    <div class="info-row"><span>客户：${head.customerName || '-'}</span><span>电话：${head.customerPhone || '-'}</span></div>
    <div class="info-row"><span>日期：${head.createTime ? dayjs(head.createTime).format('YYYY-MM-DD HH:mm') : '-'}</span><span>操作人：${head.creatorName || '-'}</span></div>
    <table>
      <tr><th>款号</th><th>款式名称</th><th>颜色</th><th>尺码</th><th>数量</th><th>单价</th><th>金额</th></tr>
      ${bodyRows}
      <tr class="total"><td colspan="4">合计（${rows.length} 项）</td><td>${totalQty}</td><td>-</td><td>¥${totalAmount.toFixed(2)}</td></tr>
    </table>
    <div class="info-row"><span>快递：${head.expressCompany || '-'}</span><span>运单号：${head.trackingNo || '-'}</span></div>
    <div class="footer"><p>打印时间：${formatDateTimeSecond(new Date())}</p></div>
    </body></html>`;
  safePrint(printContent);
}
