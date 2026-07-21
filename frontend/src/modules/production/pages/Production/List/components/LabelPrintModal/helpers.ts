import QRCode from 'qrcode';
import api, { parseProductionOrderLines } from '@/utils/api';
import { safePrint } from '@/utils/safePrint';
import {
  compositionFromSections,
  washTextFromInstructions,
  buildWashLabelMultiPageHtml,
  getDefaultDateText,
  type WashLabelPrintData,
} from '@/utils/washLabelPrintTemplate';
import { parseCareIconCodes, DEFAULT_CARE_ICON_CODES } from '@/utils/careIcons';
import type { ProductionOrder } from '@/types/production';
import type { LabelStyleInfo, SkuRow } from './types';

/** 加载订单的 SKU 行（优先接口，降级到订单明细分组，再降级到单行兜底） */
export async function loadSkuRows(order: ProductionOrder): Promise<SkuRow[]> {
  try {
    const res = await api.get(
      `/production/scan/sku/query?type=list&orderNo=${encodeURIComponent(order.orderNo || '')}`
    );
    const list: any[] = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
    if (list.length > 0) {
      return list.map((item: any) => {
        const color = String(item.color ?? '');
        const size = String(item.size ?? '');
        const quantity = Number(item.quantity ?? 0);
        const sku = String(item.sku ?? item.skuCode ?? `${order.styleNo || ''}${color}${size}`);
        return { key: `${color}__${size}`, color, size, quantity, printCount: quantity, sku, styleImageUrl: order.styleCover || '', styleId: order.styleId || '', styleNo: order.styleNo || '' };
      });
    }
  } catch { /* ignore */ }
  const detailLines = parseProductionOrderLines(order);
  if (detailLines.length > 0) {
    const grouped = new Map<string, SkuRow>();
    detailLines.forEach((item) => {
      const color = String(item.color || '').trim() || String(order.color || '').trim() || '-';
      const size = String(item.size || '').trim() || String(order.size || '').trim() || '-';
      const quantity = Number(item.quantity || 0) || 0;
      const key = `${color}__${size}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.quantity += quantity;
        existing.printCount += quantity;
        return;
      }
      grouped.set(key, {
        key,
        color,
        size,
        quantity,
        printCount: quantity,
        sku: String(item.skuNo || `${order.styleNo || ''}${color}${size}`),
        styleImageUrl: order.styleCover || '',
        styleId: order.styleId || '',
        styleNo: order.styleNo || '',
      });
    });
    return Array.from(grouped.values());
  }
  return [{
    key: `${order.color ?? ''}__${order.size ?? ''}`,
    color: order.color || '-',
    size: order.size || '-',
    quantity: order.orderQuantity || 0,
    printCount: order.orderQuantity || 0,
    sku: `${order.styleNo || ''}${order.color || ''}${order.size || ''}`,
    styleImageUrl: order.styleCover || '',
    styleId: order.styleId || '',
    styleNo: order.styleNo || '',
  }];
}

/** 打印洗水唛：根据选中行生成多页 HTML 并调用 safePrint */
export async function printWashLabels(
  selected: SkuRow[],
  _order: ProductionOrder,
  styleInfo: LabelStyleInfo | null,
  w: number,
  h: number,
): Promise<void> {
  const compositionText = compositionFromSections(styleInfo?.fabricCompositionParts, styleInfo?.fabricComposition);
  const washInstructionsText = washTextFromInstructions(styleInfo?.washInstructions, styleInfo?.fabricCompositionParts);
  const codes = parseCareIconCodes(styleInfo?.careIconCodes);
  const careIconCodes = codes.length > 0 ? codes : [...DEFAULT_CARE_ICON_CODES];
  const manufacturingText = 'MADE IN CHINA';
  const dateText = getDefaultDateText();

  const printData: WashLabelPrintData = {
    width: w,
    height: h,
    compositionText,
    washInstructionsText,
    careIconCodes,
    manufacturingText,
    dateText,
  };

  const pages = selected.flatMap(row =>
    Array.from({ length: Math.max(1, row.printCount) }, () => printData)
  );

  const html = buildWashLabelMultiPageHtml(pages);
  safePrint(html);
}

/** 打印 U 编码标签：每件一张二维码标签 */
export async function printUCodeLabels(
  selected: SkuRow[],
  order: ProductionOrder,
  factoryCode: string,
  w: number,
  h: number,
): Promise<void> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  const styleNo = order.styleNo || '';
  const styleName = order.styleName || '';
  const qrMm = 26;
  const qrPx = 480;
  const fs = h >= 48 ? 6.2 : h >= 38 ? 5.4 : 4.9;

  type PieceEntry = { rowKey: string; color: string; size: string; seq: number; total: number; qrContent: string };
  const pieceList: PieceEntry[] = selected.flatMap(row => {
    const total = Math.max(1, row.printCount);
    return Array.from({ length: total }, (_, i) => ({
      rowKey: row.key,
      color: row.color,
      size: row.size,
      seq: i + 1,
      total,
      qrContent: [styleNo, row.color, row.size].filter(Boolean).join(''),
    }));
  });

  const BATCH_SIZE = 20;
  const qrUrls: string[] = new Array(pieceList.length).fill('');
  for (let i = 0; i < pieceList.length; i += BATCH_SIZE) {
    const batchResults = await Promise.all(
      pieceList.slice(i, i + BATCH_SIZE).map(e =>
        QRCode.toDataURL(e.qrContent, { width: qrPx, margin: 0, errorCorrectionLevel: 'M' }).catch(() => '')
      )
    );
    batchResults.forEach((url, j) => { qrUrls[i + j] = url; });
  }

  const labelsHtml = pieceList.map((entry, idx) => {
    return `<div class="page">
      <div class="label">
        <div class="qr-col">
          <img src="${qrUrls[idx]}" style="width:${qrMm}mm;height:${qrMm}mm;display:block;"/>
        </div>
        <div class="divider"></div>
        <div class="info-col">
          <div class="ucode-row">${entry.qrContent}</div>
          <div class="info-row"><span class="lbl">款号</span><span class="val">${styleNo}</span></div>
          ${styleName ? `<div class="info-row"><span class="lbl">款名</span><span class="val">${styleName}</span></div>` : ''}
          <div class="info-row"><span class="lbl">颜色</span><span class="val">${entry.color || '-'}</span></div>
          <div class="info-row"><span class="lbl">码数</span><span class="val">${entry.size || '-'}</span></div>
          ${factoryCode ? `<div class="info-row"><span class="lbl">GC</span><span class="val">${factoryCode}</span></div>` : ''}
          <div class="date-row">${dateStr}</div>
        </div>
      </div>
    </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
@page { size: ${w}mm ${h}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif; color: #000; background: var(--color-bg-base); -webkit-font-smoothing: antialiased; }
.page { width: ${w}mm; height: ${h}mm; display: flex; align-items: center; justify-content: center; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.label { width: calc(${w}mm - 3mm); height: calc(${h}mm - 3mm); border: 0.8pt solid #333; display: flex; flex-direction: row; align-items: stretch; padding: 2mm 3mm; gap: 0; color: #000; }
.qr-col { flex: 0 0 ${qrMm + 1}mm; display: flex; align-items: center; justify-content: center; }
.qr-col img { display: block; object-fit: contain; }
.divider { width: 0; border-right: 0.4pt solid #bbb; margin: 2mm 2mm; flex-shrink: 0; }
.info-col { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; overflow: hidden; padding: 0 0 0 0.5mm; }
.ucode-row { font-size: ${fs + 0.9}pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-bottom: 1mm; border-bottom: 0.5pt solid #bbb; margin-bottom: 1.2mm; letter-spacing: 0.2mm; }
.info-row { font-size: ${fs}pt; display: flex; align-items: baseline; flex-wrap: nowrap; min-width: 0; margin-bottom: 0.7mm; }
.lbl { color: #888; white-space: nowrap; min-width: 8mm; }
.val { font-weight: 600; margin-left: 0.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; color: var(--color-text-primary); }
.date-row { color: #999; font-size: ${fs - 0.4}pt; margin-top: 1.5mm; letter-spacing: 0.2mm; }
</style></head><body>${labelsHtml}</body></html>`;

  safePrint(html);
}
