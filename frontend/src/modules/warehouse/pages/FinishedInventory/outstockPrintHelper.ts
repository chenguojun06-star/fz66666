import dayjs from 'dayjs';

export interface OutstockPrintData {
  outstockNo?: string;
  customerName?: string;
  customerPhone?: string;
  createTime?: string;
  createdByName?: string;
  styleNo?: string;
  styleName?: string;
  color?: string;
  size?: string;
  quantity?: number;
  salesPrice?: number;
  totalAmount?: number;
  trackingNo?: string;
  expressCompany?: string;
}

export function printOutstockRecord(record: OutstockPrintData): void {
  const printContent = `
    <html><head><title>出库单 - ${record.outstockNo || ''}</title>
    <style>
      body { font-family: 'Microsoft YaHei', sans-serif; padding: 20px; }
      .header { text-align: center; margin-bottom: 20px; }
      .header h2 { margin: 0; }
      .info-row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin: 15px 0; }
      th, td { border: 1px solid #333; padding: 8px; text-align: center; font-size: 13px; }
      th { background: #f0f0f0; }
      .footer { margin-top: 20px; font-size: 12px; color: #666; }
    </style></head><body>
    <div class="header"><h2>出库单</h2><p>单号：${record.outstockNo || '-'}</p></div>
    <div class="info-row"><span>客户：${record.customerName || '-'}</span><span>电话：${record.customerPhone || '-'}</span></div>
    <div class="info-row"><span>日期：${record.createTime ? dayjs(record.createTime).format('YYYY-MM-DD HH:mm') : '-'}</span><span>操作人：${record.createdByName || '-'}</span></div>
    <table><tr><th>款号</th><th>款式名称</th><th>颜色</th><th>尺码</th><th>数量</th><th>单价</th><th>金额</th></tr>
    <tr><td>${record.styleNo || '-'}</td><td>${record.styleName || '-'}</td><td>${record.color || '-'}</td><td>${record.size || '-'}</td>
    <td>${record.quantity ?? '-'}</td><td>${record.salesPrice != null ? `¥${record.salesPrice}` : '-'}</td><td>${record.totalAmount != null ? `¥${record.totalAmount}` : '-'}</td></tr></table>
    <div class="info-row"><span>快递：${record.expressCompany || '-'}</span><span>运单号：${record.trackingNo || '-'}</span></div>
    <div class="footer"><p>打印时间：${dayjs().format('YYYY-MM-DD HH:mm:ss')}</p></div>
    </body></html>`;
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  }
}
