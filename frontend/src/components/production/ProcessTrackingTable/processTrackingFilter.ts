import { stageAliasMap, carSewingKeywords, tailProcessKeywords } from '@/utils/productionStage';

export interface ProcessTrackingRecord {
  id: string;
  bundleNo: string;
  sku?: string;
  color?: string;
  size?: string;
  quantity: number;
  processCode: string;
  processName: string;
  progressStage?: string;
  scanType?: string;
  processOrder: number;
  unitPrice: number;
  scanStatus: 'pending' | 'scanned' | 'reset';
  scanTime?: string;
  operatorName?: string;
  settlementAmount?: number;
  scanRecordId?: string;
  isSettled?: boolean;
  hasNextStageScanned?: boolean;
}

export interface ProcessListItem {
  id?: string;
  processCode?: string;
  code?: string;
  name?: string;
  processName?: string;
}

export interface ProcessTrackingTableProps {
  records: ProcessTrackingRecord[];
  loading?: boolean;
  orderId?: string;
  orderNo?: string;
  nodeType?: string;
  nodeName?: string;
  processType?: string;
  orderStatus?: string;
  onUndoSuccess?: () => void;
  processList?: ProcessListItem[];
}

export function canUndoTracking(record: ProcessTrackingRecord, orderStatus?: string, isAdmin?: boolean): boolean {
  if (record.scanStatus !== 'scanned') return false;
  const scanType = String(record.scanType || '').trim().toLowerCase();
  const processCode = String(record.processCode || '').trim().toLowerCase();
  const processName = String(record.processName || '').trim();
  const isWarehouseRecord = scanType === 'warehouse'
    || processCode.startsWith('warehousing')
    || processCode === 'quality_warehousing'
    || processName === '入库'
    || processName === '质检入库'
    || processName === '次品入库';
  if (isWarehouseRecord) return false;
  if (record.isSettled) return false;
  if (record.hasNextStageScanned) return false;
  if (!record.scanRecordId) return false;
  if (orderStatus) {
    const s = orderStatus.toLowerCase();
    if (s === 'completed' || s === 'cancelled' || s === 'closed') return false;
  }
  const scanTime = record.scanTime;
  if (scanTime) {
    const scanMs = new Date(String(scanTime).replace(' ', 'T')).getTime();
    const limitMs = isAdmin ? 5 * 3600 * 1000 : 30 * 60 * 1000;
    if (!isNaN(scanMs) && Date.now() - scanMs >= limitMs) return false;
  }
  return true;
}

export function isTerminalOrderStatus(orderStatus?: string): boolean {
  const s = String(orderStatus || '').trim().toLowerCase();
  return s === 'completed' || s === 'cancelled' || s === 'closed';
}

export function canManualCompleteTracking(record: ProcessTrackingRecord, orderStatus?: string, orderNo?: string, orderId?: string): boolean {
  if (record.scanStatus === 'scanned') return false;
  if (isTerminalOrderStatus(orderStatus)) return false;
  if (!String(record.processName || '').trim()) return false;
  if (!String(record.bundleNo || '').trim()) return false;
  if (!String(orderNo || '').trim() && !String(orderId || '').trim()) return false;
  return true;
}

const STAGE_KEYWORDS: Record<string, string[]> = {
  ...stageAliasMap,
  carSewing: carSewingKeywords,
  tailProcess: tailProcessKeywords,
};

const CHINESE_TO_ENGLISH_KEY: Record<string, string> = {
  '采购': 'procurement',
  '物料采购': 'procurement',
  '面辅料采购': 'procurement',
  '备料': 'procurement',
  '物料': 'procurement',
  '裁剪': 'cutting',
  '裁床': 'cutting',
  '剪裁': 'cutting',
  '开裁': 'cutting',
  '二次工艺': 'secondaryProcess',
  '二次': 'secondaryProcess',
  '车缝': 'carSewing',
  '缝制': 'carSewing',
  '缝纫': 'carSewing',
  '车工': 'carSewing',
  '整件': 'carSewing',
  '生产': 'carSewing',
  '制作': 'carSewing',
  '尾部': 'tailProcess',
  '后整理': 'tailProcess',
  '后道': 'tailProcess',
  '入库': 'warehousing',
  '仓储': 'warehousing',
  '验收': 'warehousing',
};

const resolveStageKey = (filterType: string): string => {
  if (STAGE_KEYWORDS[filterType]) return filterType;
  const mapped = CHINESE_TO_ENGLISH_KEY[filterType.trim()];
  if (mapped) return mapped;
  for (const [cn, en] of Object.entries(CHINESE_TO_ENGLISH_KEY)) {
    if (filterType.includes(cn) || cn.includes(filterType)) return en;
  }
  return filterType;
};

const TYPE_TO_CODE_PREFIX: Record<string, string[]> = {
  procurement: ['procurement'],
  cutting: ['cutting'],
  sewing: ['sewing'],
  carSewing: ['sewing'],
  ironing: ['ironing', 'pressing'],
  quality: ['quality'],
  packaging: ['packaging'],
  secondaryProcess: ['secondary'],
  warehousing: ['warehousing'],
  tailProcess: ['ironing', 'pressing', 'quality', 'packaging', 'thread'],
};

export const matchesFilter = (record: ProcessTrackingRecord, filterType: string, nodeName?: string, processList?: ProcessListItem[]): boolean => {
  const code = (record.processCode || '').toLowerCase();
  const rawName = record.processName || '';
  const name = rawName === '质检入库' ? '入库' : rawName;
  const progressStage = (record.progressStage || '').trim();
  const resolvedKey = resolveStageKey(filterType);

  if (processList && processList.length > 0) {
    const plCodes = processList
      .map(p => String(p.processCode || p.code || '').trim().toLowerCase())
      .filter(Boolean);
    const plNames = processList
      .map(p => String(p.name || p.processName || '').trim().toLowerCase())
      .filter(Boolean);
    if (plCodes.length > 0 && plCodes.some(c => code && (code === c || code.startsWith(c) || c.includes(code)))) {
      return true;
    }
    if (plNames.length > 0) {
      const recNameLow = name.toLowerCase();
      if (plNames.some(n => n && (recNameLow.includes(n) || n.includes(recNameLow)))) {
        return true;
      }
    }
    return false;
  }

  if (progressStage) {
    const stageKeywords = STAGE_KEYWORDS[resolvedKey];
    if (stageKeywords && stageKeywords.some(kw => progressStage.includes(kw) || kw.includes(progressStage))) {
      return true;
    }
    if (nodeName && (progressStage.includes(nodeName.trim()) || nodeName.trim().includes(progressStage))) {
      return true;
    }
    if (resolvedKey !== filterType) {
      if (progressStage.includes(filterType) || filterType.includes(progressStage)) {
        return true;
      }
    }
  }

  const prefixes = TYPE_TO_CODE_PREFIX[resolvedKey];
  if (prefixes && prefixes.some(p => code.startsWith(p))) {
    return true;
  }

  const keywords = STAGE_KEYWORDS[resolvedKey];
  if (keywords && keywords.some(kw => name.includes(kw))) {
    return true;
  }

  if (nodeName) {
    const trimmed = nodeName.trim();
    if (trimmed && name.includes(trimmed)) {
      return true;
    }
  }

  if (filterType && /[\u4e00-\u9fa5]/.test(filterType) && name.includes(filterType)) {
    return true;
  }

  return false;
};
