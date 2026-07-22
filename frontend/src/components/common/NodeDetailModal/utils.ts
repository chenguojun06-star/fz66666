import dayjs from 'dayjs';
import { matchRecordToStage } from '@/utils/productionStage';
import { getMaterialTypeCategory } from '@/utils/materialType';
import type { ScanRecord, BundleRecord, OperatorSummary } from './types';
import type { MaterialPurchase, ProductionOrder } from '@/types/production';

export function normalizeText(input?: string): string {
  const t = String(input || '').trim();
  if (!t) return '';
  try {
    const decoded = decodeURIComponent(escape(t));
    return decoded || t;
  } catch {
    return t;
  }
}

export function formatHistoryTime(value?: string): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-';
}

export function formatScanDetail(record: ScanRecord): string {
  const parts: string[] = [];
  const nodeLabel = normalizeText(record.processName || record.progressStage);
  if (nodeLabel) parts.push(nodeLabel);
  if (typeof record.quantity === 'number') parts.push(`${record.quantity}件`);
  const colorSize = [record.color, record.size].filter(Boolean).join('/');
  if (colorSize) parts.push(colorSize);
  const bundle = record.cuttingBundleNo || record.cuttingBundleQrCode;
  if (bundle) parts.push(`菲号${bundle}`);
  if (record.scanCode) parts.push(`码:${record.scanCode}`);
  return parts.filter(Boolean).join(' · ') || '-';
}

export function extractChildProcessNames(processList: any[]): string[] {
  if (!processList || processList.length === 0) return [];
  const names = processList.map(p => ((p as any).processName || p.name || '').trim()).filter(Boolean);
  return names;
}

export function filterScanRecordsByNode(
  scanRecords: ScanRecord[],
  nodeName: string,
  nodeTypeKey: string,
  childProcessNames: string[]
): ScanRecord[] {
  const nName = normalizeText(nodeName);
  const nKey = String(nodeTypeKey || '').trim();
  if (childProcessNames.length > 0) {
    const matched = scanRecords.filter((r) => {
      if (String((r as any)?.scanResult || '').trim() !== 'success') return false;
      if ((Number((r as any)?.quantity) || 0) <= 0) return false;
      const process = String((r as any)?.processName || '').trim();
      if (process && childProcessNames.some(cp => process === cp)) return true;
      const stage = String((r as any)?.progressStage || '').trim();
      if (stage && childProcessNames.length === 1 && stage === childProcessNames[0]) return true;
      return false;
    });
    return matched;
  }
  const matched = scanRecords.filter((r) => {
    if (String((r as any)?.scanResult || '').trim() !== 'success') return false;
    if ((Number((r as any)?.quantity) || 0) <= 0) return false;
    if (matchRecordToStage(r.progressStage, r.processName, nKey, nName)) return true;
    const stage = (r.progressStage || '').trim();
    const _process = (r.processName || '').trim();
    if (stage && nName && (stage.includes(nName) || nName.includes(stage))) return true;
    return false;
  });
  return matched;
}

export function computeCuttingTotalQty(bundles: BundleRecord[]): number {
  return bundles.reduce((sum, b) => sum + (b.quantity || 0), 0);
}

export function computeCuttingSizeItems(bundles: BundleRecord[]): { size: string; quantity: number }[] {
  const sizeSet = new Set<string>();
  bundles.forEach(b => {
    const size = (b.size || '').trim();
    if (size) sizeSet.add(size);
  });
  const sizes = Array.from(sizeSet);
  const sizeMap: Record<string, number> = {};
  sizes.forEach(s => { sizeMap[s] = 0; });

  bundles.forEach(b => {
    const size = (b.size || '').trim();
    if (size && Object.prototype.hasOwnProperty.call(sizeMap, size)) {
      sizeMap[size] += (b.quantity || 0);
    }
  });

  return sizes
    .map(size => ({ size, quantity: sizeMap[size] }))
    .filter(item => item.quantity > 0);
}

export function computeOperatorSummary(filteredScanRecords: ScanRecord[]): OperatorSummary[] {
  const map = new Map<string, OperatorSummary>();
  filteredScanRecords.forEach(r => {
    const id = r.operatorId || 'unknown';
    const name = r.operatorName || '未知';
    if (!map.has(id)) {
      map.set(id, { operatorId: id, operatorName: name, totalQty: 0, scanCount: 0 });
    }
    const item = map.get(id)!;
    item.totalQty += r.quantity || 0;
    item.scanCount += 1;
    if (!item.lastScanTime || (r.scanTime && r.scanTime > item.lastScanTime)) {
      item.lastScanTime = r.scanTime;
    }
  });
  return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
}

export interface OrderLine {
  color: string;
  size: string;
  quantity: number;
}

export interface ParsedSizeColorMatrix {
  sizes: string[];
  matrixRows: Array<{ color?: string; quantities?: number[] }>;
}

export function parseSizeColorMatrix(
  matrix: Record<string, unknown> | string | undefined
): ParsedSizeColorMatrix {
  let parsed: { sizes?: string[]; matrixRows?: Array<Record<string, unknown>> } | null = null;
  if (matrix && typeof matrix === 'string') {
    try { parsed = JSON.parse(matrix); } catch { /* ignore */ }
  } else if (matrix && typeof matrix === 'object') {
    parsed = matrix as { sizes?: string[]; matrixRows?: Array<Record<string, unknown>> };
  }
  const sizes = Array.isArray(parsed?.sizes) ? (parsed!.sizes as string[]) : [];
  const rows = Array.isArray(parsed?.matrixRows) ? (parsed!.matrixRows as Array<Record<string, unknown>>) : [];
  return { sizes, matrixRows: rows };
}

export function buildOrderDetailsFromMatrix(
  pColor: string,
  pSize: string,
  pQty: number,
  matrix: Record<string, unknown> | string | undefined
): OrderLine[] {
  const orderDetails: OrderLine[] = [];
  if (pColor && pSize) {
    orderDetails.push({ color: pColor, size: pSize, quantity: pQty });
    return orderDetails;
  }
  const { sizes, matrixRows } = parseSizeColorMatrix(matrix);
  matrixRows.forEach((row) => {
    const rowColor = String(row?.color || '').trim();
    const quantities = Array.isArray(row?.quantities) ? (row.quantities as number[]) : [];
    sizes.forEach((sz, idx) => {
      const q = Number(quantities[idx] || 0);
      if (q > 0) {
        orderDetails.push({ color: rowColor, size: String(sz || '').trim(), quantity: q });
      }
    });
  });
  return orderDetails;
}

export function summarizeColorSizeQty(
  orderDetails: OrderLine[],
  pColor: string,
  pSize: string,
  pQty: number
): { color: string; size: string; quantity: number } {
  if (orderDetails.length === 0) return { color: pColor, size: pSize, quantity: pQty };
  let color = pColor;
  let size = pSize;
  let quantity = pQty;
  if (!color) {
    const colors = Array.from(new Set(orderDetails.map(d => d.color).filter(Boolean)));
    color = colors.length === 1 ? colors[0] : (colors.length > 1 ? `${colors.length}色：${colors.join(' / ')}` : '');
  }
  if (!size) {
    const sizes = Array.from(new Set(orderDetails.map(d => d.size).filter(Boolean)));
    size = sizes.length === 1 ? sizes[0] : (sizes.length > 1 ? `${sizes.length}码：${sizes.join(' / ')}` : '');
  }
  if (!quantity) quantity = orderDetails.reduce((s, d) => s + d.quantity, 0);
  return { color, size, quantity };
}

export function buildFakeOrderFromPattern(
  patternData: Record<string, unknown>,
  patternId: string,
  styleNo?: string,
  propColor?: string,
  propQuantity?: number
): ProductionOrder {
  const p = patternData;
  let pColor = String(p.color || propColor || '').trim();
  let pSize = String(p.size || '').trim();
  let pQty = Number(p.quantity || propQuantity || 0);

  const matrix = (p.sizeColorMatrix || p.sizeColorConfig) as Record<string, unknown> | string | undefined;
  const orderDetails = buildOrderDetailsFromMatrix(pColor, pSize, pQty, matrix);
  const summary = summarizeColorSizeQty(orderDetails, pColor, pSize, pQty);
  pColor = summary.color;
  pSize = summary.size;
  pQty = summary.quantity;

  return {
    id: String(p.id || patternId),
    styleNo: String(p.styleNo || styleNo || ''),
    styleName: String(p.styleName || ''),
    styleId: String(p.styleId || ''),
    styleCover: (p.coverImage as string) || null,
    color: pColor,
    size: pSize,
    orderQuantity: pQty,
    orderNo: '',
    orderDetails,
  } as unknown as ProductionOrder;
}

export function extractColorSet(lines: OrderLine[]): Set<string> {
  const colors = new Set<string>();
  lines.forEach(line => {
    const c = String(line?.color || '').trim();
    if (c && c !== '-') colors.add(c);
  });
  return colors;
}

export function extractPurchaseColorSet(purchases: MaterialPurchase[]): Set<string> {
  const colors = new Set<string>();
  purchases.forEach(p => {
    const c = String(p?.color || '').trim();
    if (c && c !== '-') colors.add(c);
  });
  return colors;
}

export function computeMissingColors(
  orderColorSet: Set<string>,
  purchaseColorSet: Set<string>
): string[] {
  if (orderColorSet.size <= 1) return [];
  const missing: string[] = [];
  orderColorSet.forEach(c => {
    if (!purchaseColorSet.has(c)) missing.push(c);
  });
  return missing;
}

export function checkBomIncomplete(purchases: MaterialPurchase[]): boolean {
  if (purchases.length === 0) return true;
  const REQUIRED = ['materialType', 'materialCode', 'materialName', 'unit', 'supplierName'] as (keyof MaterialPurchase)[];
  return purchases.some((item) =>
    REQUIRED.some((field) => {
      const val = item[field];
      return val === undefined || val === null || String(val).trim() === '';
    })
  );
}

export interface MaterialSection {
  key: 'fabric' | 'lining' | 'accessory';
  title: string;
  data: MaterialPurchase[];
}

export function buildMaterialSections(purchases: MaterialPurchase[]): MaterialSection[] {
  const sections = ([
    { key: 'fabric', title: '面料' },
    { key: 'lining', title: '里料' },
    { key: 'accessory', title: '辅料' },
  ] as const).map(sec => {
    const data = purchases.filter(p => getMaterialTypeCategory(p.materialType) === sec.key);
    return { ...sec, data };
  }).filter(x => x.data.length > 0);
  return sections;
}

export function deriveOrderLinesFromOrder(order: ProductionOrder | null): OrderLine[] {
  if (!order) return [];
  const fc = String(order?.color || '').trim();
  const fs = String(order?.size || '').trim();
  const fq = Number(order?.orderQuantity || 0);
  return [(fc || fs || fq) ? { color: fc, size: fs, quantity: fq } : { color: '-', size: '-', quantity: 0 }];
}

export function deriveOrderLinesFromPurchases(purchases: MaterialPurchase[]): OrderLine[] {
  if (purchases.length === 0) return [];
  const colors = new Set<string>();
  const sizes = new Set<string>();
  let totalQty = 0;
  purchases.forEach((p: any) => {
    const c = String(p?.color || '').trim();
    const s = String(p?.size || '').trim();
    if (c && c !== '-') colors.add(c);
    if (s && s !== '-') sizes.add(s);
    if (Number(p?.purchaseQuantity || 0) > 0) totalQty += Number(p?.purchaseQuantity || 0);
  });
  return [{
    color: Array.from(colors).join(',') || '-',
    size: Array.from(sizes).join(',') || '-',
    quantity: totalQty || 0,
  }];
}

export function buildStockMap(materials: any[]): Record<string, number> {
  const map: Record<string, number> = {};
  materials.forEach((m: any) => {
    if (m.purchaseId != null) {
      map[String(m.purchaseId)] = Number(m.availableStock ?? 0);
    }
  });
  return map;
}
