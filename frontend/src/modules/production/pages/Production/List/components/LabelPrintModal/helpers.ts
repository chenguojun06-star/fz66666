import QRCode from 'qrcode';
import api, { parseProductionOrderLines } from '@/utils/api';
import { safePrint } from '@/utils/safePrint';
import {
  buildWashLabelMultiPageHtml,
  type WashLabelPrintData,
} from '@/utils/washLabelPrintTemplate';
import type { ProductionOrder } from '@/types/production';
import type { LabelStyleInfo, SkuRow } from './types';
import { todayText, type WashLabelSectionState } from '@/components/common/WashLabelSectionConfigPanel';

/** 加载订单的 商品编码 行（优先接口，降级到订单明细分组，再降级到单行兜底） */
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

/** 打印洗水唛：根据选中行 + 分区配置生成多页 HTML 并调用 safePrint
 *  ★ 分区配置（用户需求）：每个分区由用户决定是否显示，只打印用户输入的内容，
 *    内容从距剪口下方 topOffsetMm 处开始；码数区开启时每页显示该 SKU 行自己的码数。
 */
export async function printWashLabels(
  selected: SkuRow[],
  _order: ProductionOrder,
  _styleInfo: LabelStyleInfo | null,
  w: number,
  h: number,
  sections: WashLabelSectionState,
): Promise<void> {
  const pages: WashLabelPrintData[] = selected.flatMap(row =>
    Array.from({ length: Math.max(1, row.printCount) }, () => ({
      width: w,
      height: h,
      // 只显示用户输入的内容：关闭或清空的分区传空值（模板不渲染）
      compositionText: sections.showComposition ? sections.compositionText : '',
      washInstructionsText: sections.showWash ? sections.washText : '',
      careIconCodes: sections.showWash ? sections.careIconCodes : [],
      manufacturingText: sections.showManufacturing ? sections.manufacturingText : '',
      dateText: sections.showDate ? (sections.dateText || todayText()) : '',
      // 码数区开启时优先取用户输入；批量多码场景每页显示该 SKU 行自己的码数
      sizeText: sections.showSize ? (sections.sizeText.trim() || (row.size || '').trim()) : '',
      styleNo: sections.showStyleNo ? sections.styleNoText : '',
      topOffsetMm: sections.topOffsetMm,
      fontScale: sections.fontScale,
      lineHeightScale: sections.lineHeightScale,
      sectionGapMm: sections.sectionGapMm,
    }))
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
body { font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif; color: var(--color-black); background: var(--color-bg-base); -webkit-font-smoothing: antialiased; }
.page { width: ${w}mm; height: ${h}mm; display: flex; align-items: center; justify-content: center; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.label { width: calc(${w}mm - 3mm); height: calc(${h}mm - 3mm); border: 0.8pt solid var(--color-gray-800); display: flex; flex-direction: row; align-items: stretch; padding: 2mm 3mm; gap: 0; color: var(--color-black); }
.qr-col { flex: 0 0 ${qrMm + 1}mm; display: flex; align-items: center; justify-content: center; }
.qr-col img { display: block; object-fit: contain; }
.divider { width: 0; border-right: 0.4pt solid var(--color-text-quaternary); margin: 2mm 2mm; flex-shrink: 0; }
.info-col { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; overflow: hidden; padding: 0 0 0 0.5mm; }
.ucode-row { font-size: ${fs + 0.9}pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-bottom: 1mm; border-bottom: 0.5pt solid var(--color-text-quaternary); margin-bottom: 1.2mm; letter-spacing: 0.2mm; }
.info-row { font-size: ${fs}pt; display: flex; align-items: baseline; flex-wrap: nowrap; min-width: 0; margin-bottom: 0.7mm; }
.lbl { color: var(--color-text-muted); white-space: nowrap; min-width: 8mm; }
.val { font-weight: 600; margin-left: 0.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; color: var(--color-text-primary); }
.date-row { color: var(--color-gray-label); font-size: ${fs - 0.4}pt; margin-top: 1.5mm; letter-spacing: 0.2mm; }
</style></head><body>${labelsHtml}</body></html>`;

  safePrint(html);
}
