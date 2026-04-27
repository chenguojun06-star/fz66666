import { formatDateTime } from '@/utils/datetime';
import { getMaterialReconStatusConfig } from '@/constants/finance';
import { canViewPrice } from '@/utils/sensitiveDataMask';

export const escapeCsvCell = (value: unknown) => {
  const text = String(value ?? '');
  if (/[\r\n",]/.test(text)) { return `"${text.replace(/"/g, '""')}"`; }
  return text;
};

export const downloadTextFile = (filename: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const fileStamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

export const buildMaterialReconCsv = (rows: any[], user?: any) => {
  const header = ['对账单号', '供应商', '物料编码', '物料名称', '采购单号', '采购类型', '订单号', '款号', '实到数量', '单位', '采购单价', '采购汇总', '采购完成', '采购员', '入库日期', '库区', '状态'];
  const lines = [header.map(escapeCsvCell).join(',')];
  for (const r of rows) {
    const st = getMaterialReconStatusConfig(r?.status);
    const sourceTypeText = r?.sourceType === 'sample' ? '样衣采购' : (r?.sourceType === 'order' ? '大货采购' : '批量采购');
    const quantity = Number(r?.quantity ?? 0) || 0;
    const unitPrice = Number(r?.unitPrice ?? 0) || 0;
    const totalAmount = quantity * unitPrice;
    const row = [
      String(r?.reconciliationNo || '').trim(),
      String(r?.supplierName || '').trim(),
      String(r?.materialCode || '').trim(),
      String(r?.materialName || '').trim(),
      String(r?.purchaseNo || '').trim(),
      sourceTypeText,
      String(r?.orderNo || '').trim(),
      String(r?.styleNo || '').trim(),
      String(quantity),
      String(r?.unit || '').trim(),
      canViewPrice(user) ? unitPrice.toFixed(2) : '***',
      canViewPrice(user) ? totalAmount.toFixed(2) : '***',
      String(formatDateTime(r?.reconciliationDate) || ''),
      String(r?.purchaserName || '').trim(),
      String(formatDateTime(r?.inboundDate) || ''),
      String(r?.warehouseLocation || '').trim(),
      String(st?.text || ''),
    ];
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return `\ufeff${lines.join('\n')}`;
};
