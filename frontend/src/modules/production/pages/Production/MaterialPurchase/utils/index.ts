import { UploadFile } from 'antd/es/upload/interface';
import { MaterialPurchase as MaterialPurchaseType, ProductionOrder } from '@/types/production';
import { getMaterialTypeCategory, getMaterialTypeLabel } from '@/utils/materialType';
import { formatDateTime } from '@/utils/datetime';
import { sortSizeNames } from '@/utils/api';
import { MATERIAL_PURCHASE_STATUS, MATERIAL_TYPES } from '@/constants/business';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

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

const MATERIAL_QUANTITY_PRECISION = 4;

export const normalizeMaterialQuantity = (value: unknown, precision = MATERIAL_QUANTITY_PRECISION) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** precision;
  const rounded = Math.round((n + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
};

export const subtractMaterialQuantity = (
  total: unknown,
  arrived: unknown,
  precision = MATERIAL_QUANTITY_PRECISION
) => {
  const diff = normalizeMaterialQuantity(Number(total || 0) - Number(arrived || 0), precision);
  return diff > 0 ? diff : 0;
};

export const formatMaterialQuantity = (value: unknown, precision = MATERIAL_QUANTITY_PRECISION) => {
  const normalized = normalizeMaterialQuantity(value, precision);
  const text = normalized.toFixed(precision).replace(/\.0+$|(?<=\.\d*?)0+$/g, '');
  return text === '-0' ? '0' : text;
};

export const formatMaterialQuantityWithUnit = (value: unknown, unit?: unknown, precision = MATERIAL_QUANTITY_PRECISION) => {
  const quantityText = formatMaterialQuantity(value, precision);
  const unitText = String(unit || '').trim();
  return unitText ? `${quantityText} ${unitText}` : quantityText;
};

const normalizeUnit = (value: unknown) => String(value || '').trim().toLowerCase();
const isMeterUnit = (value: unknown) => {
  const unit = normalizeUnit(value);
  return unit === '米' || unit === 'm' || unit === 'meter' || unit === 'meters';
};
const isKilogramUnit = (value: unknown) => {
  const unit = normalizeUnit(value);
  return unit === 'kg' || unit === '公斤' || unit === '千克' || unit === 'kilogram' || unit === 'kilograms';
};

export const computeReferenceKilograms = (
  quantity: unknown,
  conversionRate: unknown,
  unit?: unknown,
  precision = MATERIAL_QUANTITY_PRECISION,
) => {
  const normalizedQuantity = normalizeMaterialQuantity(quantity, precision);
  const rate = Number(conversionRate);
  if (isKilogramUnit(unit)) return normalizedQuantity;
  if (isMeterUnit(unit)) {
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return normalizeMaterialQuantity(normalizedQuantity / rate, precision);
  }
  return null;
};

export const formatReferenceKilograms = (
  quantity: unknown,
  conversionRate: unknown,
  unit?: unknown,
  precision = MATERIAL_QUANTITY_PRECISION,
) => {
  const kilograms = computeReferenceKilograms(quantity, conversionRate, unit, precision);
  if (kilograms == null) return '-';
  return `${formatMaterialQuantity(kilograms, precision)} 公斤`;
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
    [MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM]: { text: '待确认完成', color: 'cyan' },
    [MATERIAL_PURCHASE_STATUS.COMPLETED]: { text: '全部到货', color: 'success' },
    [MATERIAL_PURCHASE_STATUS.CANCELLED]: { text: '已取消', color: 'error' },
    [MATERIAL_PURCHASE_STATUS.WAREHOUSE_PENDING]: { text: '待仓库出库', color: 'blue' },
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
    const sizeOrder = detailSizePairs.length
      ? detailSizePairs.map((item) => String(item.size || '').trim()).filter(Boolean)
      : sortSizeNames(Array.from(new Set(detailOrderLines.map((item) => String(item.size || '').trim()).filter(Boolean))));
    if (!sizeOrder.length) {
      return '<div class="size-empty">-</div>';
    }

    const rowMap = new Map<string, Map<string, number>>();
    detailOrderLines.forEach((line) => {
      const color = String(line.color || '').trim() || colorText || '未设色';
      const size = String(line.size || '').trim();
      const qty = Number(line.quantity || 0) || 0;
      if (!size) return;
      const sizeMap = rowMap.get(color) || new Map<string, number>();
      sizeMap.set(size, (sizeMap.get(size) || 0) + qty);
      rowMap.set(color, sizeMap);
    });

    const matrixRows = rowMap.size
      ? Array.from(rowMap.entries()).map(([color, sizeMap]) => {
          const cells = sizeOrder.map((size) => `<td>${escapeHtml(sizeMap.get(size) || 0)}</td>`).join('');
          const rowTotal = Array.from(sizeMap.values()).reduce((sum, value) => sum + value, 0);
          return `<tr><th class="row-head">${escapeHtml(color)}</th>${cells}<th class="total-cell">${escapeHtml(rowTotal)}</th></tr>`;
        }).join('')
      : '';

    const headCells = sizeOrder.map((size) => `<th>${escapeHtml(size)}</th>`).join('');
    const qtyCells = sizeOrder.map((size) => {
      const pair = detailSizePairs.find((item) => String(item.size || '').trim() === size);
      return `<td>${escapeHtml(pair?.quantity || 0)}</td>`;
    }).join('');
    return `
        <table class="size-table">
          <tr>
            <th class="row-head">颜色</th>
            ${headCells}
            <th class="total-cell">合计</th>
          </tr>
          ${matrixRows || `<tr><th class="row-head">${escapeHtml(colorText || '-')}</th>${qtyCells}<th class="total-cell">${escapeHtml(totalOrderQty)}</th></tr>`}
          <tr>
            <th class="row-head">码数合计</th>
            ${qtyCells}
            <th class="total-cell">总下单数：${escapeHtml(totalOrderQty)}</th>
          </tr>
        </table>
      `;
  };

  const buildRows = (list: readonly MaterialPurchaseType[]) => {
    const rows = list.map((r) => {
      const typeLabel = getMaterialTypeLabel(r?.materialType);
      const purchaseQty = normalizeMaterialQuantity(r?.purchaseQuantity);
      const arrivedQty = normalizeMaterialQuantity(r?.arrivedQuantity);
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
  const styleImageUrl = getFullAuthedFileUrl(detailOrder?.styleCover);

  return `
      <!doctype html>
      <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(purchaseNo || orderNo || '采购单')}</title>
        <style>
          body{font-family:'Microsoft YaHei','微软雅黑','PingFang SC','Heiti SC',Arial,serif;margin:20px;color:#111}
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
          .cover-img{width:80px;height:80px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb;display:block}
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
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
            ${styleImageUrl ? `<img class="cover-img" src="${styleImageUrl}" alt="款式图" />` : ''}
            <div class="actions no-print">
              <button class="ant-btn ant-btn-default" onclick="window.print()">打印</button>
              <button class="ant-btn ant-btn-primary" onclick="window.close()">关闭</button>
            </div>
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
