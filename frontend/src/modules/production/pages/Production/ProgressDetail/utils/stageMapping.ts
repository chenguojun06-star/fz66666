import { ProgressNode } from '../types';

let _dynamicParentMapping: Record<string, string> | null = null;

export function setDynamicParentMapping(mapping: Record<string, string>) {
  _dynamicParentMapping = mapping;
}

export function getDynamicParentMapping(): Record<string, string> | null {
  return _dynamicParentMapping;
}

export function resolveDynamicParent(processName: string): string | undefined {
  if (!_dynamicParentMapping || !processName) return undefined;
  const exact = _dynamicParentMapping[processName];
  if (exact) return exact;
  let bestParent: string | undefined;
  let bestLen = 0;
  for (const [keyword, parent] of Object.entries(_dynamicParentMapping)) {
    if (keyword.length > bestLen && processName.includes(keyword)) {
      bestParent = parent;
      bestLen = keyword.length;
    }
  }
  return bestParent;
}

export const defaultNodes: ProgressNode[] = [
  { id: 'cutting', name: '裁剪', unitPrice: 0 },
  { id: 'production', name: '生产', unitPrice: 0 },
  { id: 'quality', name: '质检', unitPrice: 0 },
  { id: 'packaging', name: '包装', unitPrice: 0 },
];

export const getRecordStageName = (r: Record<string, unknown>) => {
  const stage = String(r?.progressStage || '').trim();
  if (stage) return stage;
  return String(r?.processName || '').trim();
};

export const normalizeStageKey = (v: unknown) => String(v || '').trim().replace(/\s+/g, '');

export const isQualityStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  if (n.includes('入库')) return false;
  return n.includes('质检') || n.includes('检验') || n.includes('品检') || n.includes('验货');
};

export const isCuttingStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('裁剪') || n.includes('裁床') || n.includes('剪裁') || n.includes('开裁');
};

export const isProductionStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('生产');
};

export const isSewingStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('车缝') || n.includes('缝制') || n.includes('缝纫') || n.includes('车工') || n.includes('整件');
};

export const isIroningStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('整烫') || n.includes('熨烫') || n.includes('大烫');
};

export const isPackagingStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('包装') || n.includes('后整') || n.includes('打包') || n.includes('装箱');
};

export const isShipmentStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('出货') || n.includes('发货') || n.includes('发运');
};

export const isWarehouseStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('入库') || n.includes('入仓') || n.includes('仓库') || n.includes('仓储');
};

export const isTailStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n === '尾部' || n.includes('尾部') || n.includes('尾工');
};

export const isSecondaryProcessStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return false;
  return n.includes('二次工艺') || n.includes('二次');
};

export const canonicalStageKey = (k: string) => {
  const n = normalizeStageKey(k);
  if (!n) return '';
  const map: Record<string, string> = {
    物料采购: '采购',
    面辅料采购: '采购',
    备料: '采购',
    到料: '采购',
    进料: '采购',
    物料: '采购',
    缝制: '车缝',
    缝纫: '车缝',
    车工: '车缝',
    整件: '车缝',
    生产: '车缝',
    制作: '车缝',
    车间生产: '车缝',
    裁床: '裁剪',
    剪裁: '裁剪',
    开裁: '裁剪',
    裁片: '裁剪',
    裁切: '裁剪',
    二次: '二次工艺',
    后整理: '尾部',
    后道: '尾部',
    仓储: '入库',
    上架: '入库',
    进仓: '入库',
    入仓: '入库',
    验收: '入库',
    成品入库: '入库',
  };
  return normalizeStageKey(map[n] || n);
};

const resolveDerivedParentStage = (rawName: string): string => {
  const normalized = normalizeStageKey(rawName);
  if (!normalized) return '';
  const dynamicParent = resolveDynamicParent(normalized);
  if (dynamicParent) return normalizeStageKey(dynamicParent);
  const canonical = canonicalStageKey(normalized);
  if (canonical === '二次工艺' && normalized !== '二次工艺') {
    return canonical;
  }
  return '';
};

export const stageNameMatches = (a: any, b: any) => {
  const xOrig = normalizeStageKey(a);
  const yOrig = normalizeStageKey(b);
  if (!xOrig || !yOrig) return false;
  if (xOrig === yOrig) return true;

  const xDerivedParent = resolveDerivedParentStage(xOrig);
  const yDerivedParent = resolveDerivedParentStage(yOrig);
  if (xDerivedParent && yDerivedParent && xDerivedParent === yDerivedParent) {
    return false;
  }

  const x = canonicalStageKey(a);
  const y = canonicalStageKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (isCuttingStageKey(x) && isCuttingStageKey(y)) return true;
  if (isQualityStageKey(x) && isQualityStageKey(y)) return true;
  if (isPackagingStageKey(x) && isPackagingStageKey(y)) return true;
  if (isShipmentStageKey(x) && isShipmentStageKey(y)) return true;
  if (isIroningStageKey(x) && isIroningStageKey(y)) return true;
  if (isProductionStageKey(x) && isProductionStageKey(y)) return true;
  if (isSewingStageKey(x) && isSewingStageKey(y)) return true;
  if (isWarehouseStageKey(x) && isWarehouseStageKey(y)) return true;
  if (isSecondaryProcessStageKey(x) && isSecondaryProcessStageKey(y)) return true;
  const tailSubStage = (k: string) =>
    isIroningStageKey(k) || isQualityStageKey(k) || isPackagingStageKey(k);
  if (isTailStageKey(x) && tailSubStage(y)) return true;
  if (isTailStageKey(y) && tailSubStage(x)) return true;

  if (_dynamicParentMapping) {
    const findParent = (name: string): string | null => {
      if (!name) return null;
      const exact = _dynamicParentMapping![name];
      if (exact) return exact;
      for (const [kw, parent] of Object.entries(_dynamicParentMapping!)) {
        if (name.includes(kw)) return parent;
      }
      return null;
    };
    const xParent = findParent(x) || findParent(xOrig);
    const yParent = findParent(y) || findParent(yOrig);
    if (yParent && yParent === x) return true;
    if (xParent && xParent === y) return true;
    if (yParent && yParent === xOrig) return true;
    if (xParent && xParent === yOrig) return true;
  }

  return x.includes(y) || y.includes(x);
};

export const stripWarehousingNode = (list: ProgressNode[]) => {
  return (Array.isArray(list) ? list : []).filter((n) => {
    const id = String((n as any)?.id || '').trim().toLowerCase();
    const name = String((n as any)?.name || '').trim();
    return !(id === 'shipment' || name === '出货' || name === '发货' || name === '发运');
  });
};

export const isSecondaryProcessSubNode = (nodeName: string, progressStage?: string): boolean => {
  const n = normalizeStageKey(nodeName);
  if (!n) return false;
  if (progressStage && normalizeStageKey(progressStage) === '二次工艺') return true;
  const dynamic = resolveDynamicParent(n);
  if (dynamic === '二次工艺') return true;
  const canonical = canonicalStageKey(n);
  if (canonical === '二次工艺') return true;
  return ['绣花', '印花', '水洗', '染色', '压花', '烫钻', '打揽', '烫画', '贴标', '钉珠', '贴绣', '烫金', '数码印', '打孔', '激光', '转印', '植绒', '涂层', '磨毛'].includes(n);
};
