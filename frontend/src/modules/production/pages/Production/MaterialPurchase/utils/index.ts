import { UploadFile } from 'antd/es/upload/interface';
import { MaterialPurchase as MaterialPurchaseType, ProductionOrder } from '@/types/production';
import { getMaterialTypeCategory, getMaterialTypeLabel } from '@/utils/materialType';
import { formatDateTime } from '@/utils/datetime';
import { sortSizeNames } from '@/utils/api';
import { MATERIAL_PURCHASE_STATUS, MATERIAL_TYPES } from '@/constants/business';

export const toLocalDateTimeInputValue = (v?: Date) => {
  const d = v || new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

export const toDateTimeLocalValue = (v: unknown) => {
  const s = String(v || '').trim();
  if (!s) return undefined;

  const cleaned = s.replace(' ', 'T').replace(/(\.\d+)?Z$/, '');
  const m = cleaned.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  if (m?.[1]) return m[1];
  return undefined;
};

export const buildImageFileList = (url: any): UploadFile[] => {
  const u = String(url || '').trim();
  if (!u) return [];
  return [{ uid: 'image-1', name: '图片', status: 'done', url: u } as UploadFile];
};

export const escapeHtml = (v: unknown) => {
  const s = String(v ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export const getStatusConfig = (status: MaterialPurchaseType['status']) => {
  // 处理空状态或未定义
  if (!status || String(status).trim() === '') {
    return { text: '待采购', color: 'default' };
  }

  // 标准化状态值为小写（兼容后端可能返回的大写值）
  const normalizedStatus = String(status).toLowerCase().trim();

  const statusMap: Record<string, { text: string; color: string }> = {
    [MATERIAL_PURCHASE_STATUS.PENDING]: { text: '待采购', color: 'default' },
    [MATERIAL_PURCHASE_STATUS.RECEIVED]: { text: '已领取', color: 'processing' },
    [MATERIAL_PURCHASE_STATUS.PARTIAL]: { text: '部分到货', color: 'warning' },
    [MATERIAL_PURCHASE_STATUS.PARTIAL_ARRIVAL]: { text: '部分到货', color: 'warning' },
    [MATERIAL_PURCHASE_STATUS.COMPLETED]: { text: '全部到货', color: 'default' },
    [MATERIAL_PURCHASE_STATUS.CANCELLED]: { text: '已取消', color: 'error' }
  };

  // 检查是否有匹配的状态
  if (statusMap[normalizedStatus]) {
    return statusMap[normalizedStatus];
  }

  // 对于未识别的状态，记录日志并返回待采购
  console.warn(`[MaterialPurchase] 未识别的状态值: "${status}"（已转换为小写: "${normalizedStatus}"），默认显示为待采购`);
  return { text: '待采购', color: 'default' };
};

export const getOrderQtyTotal = (lines: Array<{ color: string; size: string; quantity: number }>) => {
  return lines.reduce((sum, l) => sum + (Number(l?.quantity || 0) || 0), 0);
};

export const buildSizePairs = (lines: Array<{ color: string; size: string; quantity: number }>) => {
  const bySize = new Map<string, number>();
  for (const l of lines) {
    const s = String(l?.size || '').trim();
    const q = Number(l?.quantity || 0) || 0;
    if (!s) continue;
    bySize.set(s, (bySize.get(s) || 0) + q);
  }
  const sizes = sortSizeNames(Array.from(bySize.keys()));
  return sizes.map((s) => ({ size: s, quantity: bySize.get(s) || 0 }));
};

export const buildColorSummary = (lines: Array<{ color: string; size: string; quantity: number }>) => {
  const set = new Set<string>();
  for (const l of lines) {
    const c = String(l?.color || '').trim();
    if (c) set.add(c);
  }
  return Array.from(set.values()).join(' / ');
};

export const buildPurchaseSheetHtml = (
  currentPurchase: MaterialPurchaseType | null,
  detailOrder: ProductionOrder | null,
  detailOrderLines: Array<{ color: string; size: string; quantity: number }>,
  detailPurchases: MaterialPurchaseType[],
  detailSizePairs: Array<{ size: string; quantity: number }>
) => {
  const orderNo = String(currentPurchase?.orderNo || '').trim();
  const purchaseNo = String(currentPurchase?.purchaseNo || '').trim();
  const styleNo = String(currentPurchase?.styleNo || '').trim();
  const styleName = String(currentPurchase?.styleName || '').trim();
  const colorText = String(detailOrder?.color || '').trim() || buildColorSummary(detailOrderLines) || '';
  const totalOrderQty = getOrderQtyTotal(detailOrderLines);

  const group: { fabric: MaterialPurchaseType[]; lining: MaterialPurchaseType[]; accessory: MaterialPurchaseType[] } = {
    fabric: detailPurchases.filter((p) => getMaterialTypeCategory(p.materialType) === MATERIAL_TYPES.FABRIC),
    lining: detailPurchases.filter((p) => getMaterialTypeCategory(p.materialType) === MATERIAL_TYPES.LINING),
    accessory: detailPurchases.filter((p) => getMaterialTypeCategory(p.materialType) === MATERIAL_TYPES.ACCESSORY),
  };

  const buildSizeTable = () => {
    if (!detailSizePairs.length) {
      return '<div class="size-empty">-</div>';
    }
    const headCells = detailSizePairs.map((x) => `<th>${escapeHtml(x.size)}</th>`).join('');
    const qtyCells = detailSizePairs.map((x) => `<td>${escapeHtml(x.quantity)}</td>`).join('');
    return `
        <table class="size-table">
          <tr>
            <th class="row-head">码数</th>
            ${headCells}
            <th class="total-cell"></th>
          </tr>
          <tr>
            <th class="row-head">数量</th>
            ${qtyCells}
            <th class="total-cell">总下单数：${escapeHtml(totalOrderQty)}</th>
          </tr>
        </table>
      `;
  };

  const buildRows = (list: readonly MaterialPurchaseType[]) => {
    const rows = list.map((r) => {
      const typeLabel = getMaterialTypeLabel(r?.materialType);
      const purchaseQty = Number(r?.purchaseQuantity) || 0;
      const arrivedQty = Number(r?.arrivedQuantity) || 0;
      const unitPrice = Number(r?.unitPrice);
      const amountText = Number.isFinite(unitPrice) ? (arrivedQty * unitPrice).toFixed(2) : '-';
      const unitPriceText = Number.isFinite(unitPrice) ? unitPrice.toFixed(2) : '-';
      const statusText = getStatusConfig(r?.status).text;
      const returnTime = Number(r?.returnConfirmed || 0) === 1 ? (formatDateTime(r?.returnConfirmTime) || '-') : '-';
      const returnBy = Number(r?.returnConfirmed || 0) === 1 ? (String(r?.returnConfirmerName || '').trim() || '-') : '-';
      return `
          <tr>
            <td>${escapeHtml(typeLabel)}</td>
            <td>${escapeHtml(r?.materialCode || '')}</td>
            <td>${escapeHtml(r?.materialName || '')}</td>
            <td>${escapeHtml(r?.specifications || '')}</td>
            <td>${escapeHtml(r?.unit || '')}</td>
            <td class="num">${escapeHtml(purchaseQty)}</td>
            <td class="num">${escapeHtml(arrivedQty)}</td>
            <td class="num">${escapeHtml(unitPriceText)}</td>
            <td class="num">${escapeHtml(amountText)}</td>
            <td>${escapeHtml(r?.supplierName || '')}</td>
            <td>${escapeHtml(statusText || '')}</td>
            <td>${escapeHtml(returnTime)}</td>
            <td>${escapeHtml(returnBy)}</td>
          </tr>
        `;
    }).join('');

    return `
        <table class="data-table">
          <thead>
            <tr>
              <th>类型</th>
              <th>物料编码</th>
              <th>物料名称</th>
              <th>规格</th>
              <th>单位</th>
              <th class="num">采购数</th>
              <th class="num">到货数</th>
              <th class="num">单价(元)</th>
              <th class="num">金额(元)</th>
              <th>供应商</th>
              <th>状态</th>
              <th>回料时间</th>
              <th>回料人</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="13" class="empty">-</td></tr>`}
          </tbody>
        </table>
      `;
  };

  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return `
      <!doctype html>
      <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(purchaseNo || orderNo || '采购单')}</title>
        <style>
          body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;margin:20px;color:#111}
          .top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
          .title{font-size:18px;font-weight:700}
          .meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 16px;margin-top:10px}
          .kv{font-size:12px;color:#555}
          .kv b{display:block;color:#111;margin-top:2px;font-size:13px}
          .block{margin-top:14px}
          .size-table{border-collapse:collapse;font-size:12px}
          .size-table th,.size-table td{border:1px solid #d1d5db;padding:6px 8px;white-space:nowrap;vertical-align:middle;text-align:center}
          .size-table .row-head{background:#fafafa}
          .size-table .total-cell{min-width:140px;text-align:center;background:#fafafa}
          .section{margin-top:18px}
          .section h3{margin:0 0 8px 0;font-size:14px}
          .data-table{width:100%;border-collapse:collapse;font-size:12px}
          .data-table th,.data-table td{border:1px solid #d1d5db;padding:6px 8px;vertical-align:middle;text-align:center}
          .data-table th{background:#fafafa;text-align:center}
          .data-table .num{text-align:right;white-space:nowrap}
          .empty{text-align:center;color:#999}
          .actions{display:flex;gap:8px;justify-content:flex-end}
          .ant-btn{font-family:inherit}
          @media print{.no-print{display:none} body{margin:0}}
        </style>
      </head>
      <body>
        <div class="top">
          <div>
            <div class="title">采购单</div>
            <div class="meta">
              <div class="kv">订单号<b>${escapeHtml(orderNo || '-')}</b></div>
              <div class="kv">采购单号<b>${escapeHtml(purchaseNo || '-')}</b></div>
              <div class="kv">款号<b>${escapeHtml(styleNo || '-')}</b></div>
              <div class="kv">款名<b>${escapeHtml(styleName || '-')}</b></div>
              <div class="kv">颜色<b>${escapeHtml(colorText || '-')}</b></div>
              <div class="kv">生成时间<b>${escapeHtml(ts)}</b></div>
            </div>
          </div>
          <div class="actions no-print">
            <button class="ant-btn ant-btn-default" onclick="window.print()">打印</button>
            <button class="ant-btn ant-btn-primary" onclick="window.close()">关闭</button>
          </div>
        </div>

        <div class="block">
          ${buildSizeTable()}
        </div>

        <div class="section">
          <h3>面料</h3>
          ${buildRows(group.fabric)}
        </div>
        <div class="section">
          <h3>里料</h3>
          ${buildRows(group.lining)}
        </div>
        <div class="section">
          <h3>辅料</h3>
          ${buildRows(group.accessory)}
        </div>
      </body>
      </html>
    `;
};
