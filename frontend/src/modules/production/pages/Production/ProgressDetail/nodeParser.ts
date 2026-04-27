import { ProductionOrder } from '@/types/production';
import { ProgressNode } from './types';
import { normalizeStageKey, canonicalStageKey, isCuttingStageKey, isSecondaryProcessSubNode, resolveDynamicParent } from './stageResolver';

export const defaultNodes: ProgressNode[] = [
  { id: 'cutting', name: '裁剪', unitPrice: 0 },
  { id: 'production', name: '生产', unitPrice: 0 },
  { id: 'quality', name: '质检', unitPrice: 0 },
  { id: 'packaging', name: '包装', unitPrice: 0 },
];

export const stripWarehousingNode = (list: ProgressNode[]) => {
  return (Array.isArray(list) ? list : []).filter((n) => {
    const id = String((n as any)?.id || '').trim().toLowerCase();
    const name = String((n as any)?.name || '').trim();
    return !(id === 'shipment' || name === '出货' || name === '发货' || name === '发运');
  });
};

export const parseProgressNodes = (raw: string): ProgressNode[] => {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  try {
    const obj = JSON.parse(text);
    let itemsRaw = (obj as any)?.nodes;
    if (!Array.isArray(itemsRaw)) {
      itemsRaw = (obj as any)?.steps;
    }
    if (!Array.isArray(itemsRaw)) return [];

    const normalized: ProgressNode[] = itemsRaw
      .map((n: any) => {
        const name = String(n?.name || n?.processName || '').trim();
        const p = Number(n?.unitPrice);
        const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
        const id = String(n?.id || n?.processCode || name || '');
        const progressStage = String(n?.progressStage || '').trim() || undefined;
        return { id, name, unitPrice, progressStage };
      })
      .filter((n: ProgressNode) => n.name);
    return stripWarehousingNode(normalized);
  } catch {
    return [];
  }
};

export const parseWorkflowNodesFromOrder = (order: ProductionOrder | null): ProgressNode[] => {
  const raw = String((order as any)?.progressWorkflowJson ?? '').trim();
  if (!raw) return [];
  return parseProgressNodes(raw);
};

type SubProcessRemapItem = {
  id?: string;
  name?: string;
  originalName?: string;
  [k: string]: unknown;
};

type SubProcessRemapStage = {
  enabled?: boolean;
  subProcesses?: SubProcessRemapItem[];
  [k: string]: unknown;
};

type SubProcessRemap = Record<string, SubProcessRemapStage>;

const stageKeyToParent = (stageKey: string) => {
  const map: Record<string, string> = {
    procurement: '采购',
    cutting: '裁剪',
    secondaryProcess: '二次工艺',
    carSewing: '车缝',
    tailProcess: '尾部',
    warehousing: '入库',
  };
  return map[String(stageKey || '').trim()] || '';
};

const parseSubProcessRemap = (order: ProductionOrder | null): SubProcessRemap => {
  const raw = String((order as any)?.nodeOperations || '').trim();
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    const remap = obj?.subProcessRemap;
    if (!remap || typeof remap !== 'object') return {};
    return remap as SubProcessRemap;
  } catch {
    return {};
  }
};

const applySubProcessRemapToNodes = (nodes: ProgressNode[], order: ProductionOrder | null): ProgressNode[] => {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  const remap = parseSubProcessRemap(order);
  const stageKeys = Object.keys(remap);
  if (stageKeys.length === 0) return nodes;

  const working = [...nodes];
  for (const stageKey of stageKeys) {
    const cfg = remap[stageKey];
    if (!cfg || cfg.enabled !== true || !Array.isArray(cfg.subProcesses)) {
      continue;
    }
    const parent = stageKeyToParent(stageKey);
    if (!parent) continue;

    const parentCanonical = canonicalStageKey(parent);
    const matchedRows: ProgressNode[] = [];
    let insertAt = -1;

    for (let i = 0; i < working.length; i += 1) {
      const row = working[i];
      const rowParent = String(row.progressStage || row.name || '').trim();
      if (canonicalStageKey(rowParent) === parentCanonical) {
        if (insertAt < 0) insertAt = i;
        matchedRows.push(row);
      }
    }

    const byName = new Map<string, ProgressNode>();
    matchedRows.forEach((row) => {
      const key = String(row.name || '').trim();
      if (key && !byName.has(key)) {
        byName.set(key, row);
      }
    });

    for (let i = working.length - 1; i >= 0; i -= 1) {
      const row = working[i];
      const rowParent = String(row.progressStage || row.name || '').trim();
      if (canonicalStageKey(rowParent) === parentCanonical) {
        working.splice(i, 1);
      }
    }

    if (insertAt < 0) insertAt = working.length;

    const rebuilt: ProgressNode[] = cfg.subProcesses
      .map((sp, idx) => {
        const name = String(sp?.name || '').trim();
        if (!name) return null;
        const base = byName.get(name);
        return {
          id: String(base?.id || `${stageKey}-${idx + 1}`),
          name,
          unitPrice: Number(base?.unitPrice) || 0,
          progressStage: parent,
        } as ProgressNode;
      })
      .filter((x): x is ProgressNode => Boolean(x));

    if (rebuilt.length > 0) {
      working.splice(insertAt, 0, ...rebuilt);
    }
  }

  return working;
};

export const resolveNodesForOrder = (
  order: ProductionOrder | null,
  progressNodesByStyleNo: Record<string, ProgressNode[]>,
  fallbackNodes: ProgressNode[],
): ProgressNode[] => {
  const orderNodes = parseWorkflowNodesFromOrder(order);
  if (orderNodes.length) {
    const styleNo = String((order as any)?.styleNo || '').trim();
    const styleNodes = styleNo && progressNodesByStyleNo[styleNo] ? progressNodesByStyleNo[styleNo] : [];
    if (styleNodes.length > 0) {
      const priceMap = new Map<string, number>();
      const stageMap = new Map<string, string>();
      const orderMap = new Map<string, number>();
      styleNodes.forEach((sn, i) => {
        const price = Number(sn.unitPrice) || 0;
        if (price > 0) priceMap.set(sn.name, price);
        if (sn.progressStage) stageMap.set(sn.name, sn.progressStage);
        orderMap.set(sn.name, i);
      });
      const merged = orderNodes.map(n => ({
        ...n,
        unitPrice: priceMap.get(n.name) ?? (Number(n.unitPrice) || 0),
        progressStage: n.progressStage || stageMap.get(n.name) || undefined,
      })).sort((a, b) => {
        const ia = orderMap.has(a.name) ? orderMap.get(a.name)! : 999;
        const ib = orderMap.has(b.name) ? orderMap.get(b.name)! : 999;
        return ia - ib;
      });
      return applySubProcessRemapToNodes(merged, order);
    }
    return applySubProcessRemapToNodes(orderNodes, order);
  }
  const sn = String((order as any)?.styleNo || '').trim();
  if (sn && progressNodesByStyleNo[sn]?.length) {
    return applySubProcessRemapToNodes(
      progressNodesByStyleNo[sn].filter(n => (Number(n.unitPrice) || 0) > 0),
      order,
    );
  }
  return applySubProcessRemapToNodes(fallbackNodes?.length ? fallbackNodes : defaultNodes, order);
};

export const collapseSecondaryProcessNodes = (nodes: ProgressNode[]): ProgressNode[] => {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes;

  const secondarySubs: ProgressNode[] = [];
  const nonSecondary: ProgressNode[] = [];
  for (const n of nodes) {
    const name = String(n.name || '').trim();
    if (isSecondaryProcessSubNode(name, (n as any).progressStage)) {
      secondarySubs.push(n);
    } else {
      nonSecondary.push(n);
    }
  }

  if (secondarySubs.length <= 1) return nodes;

  const parentNode: ProgressNode = {
    id: 'secondaryProcess',
    name: '二次工艺',
    unitPrice: 0,
    progressStage: '二次工艺',
  };

  let insertAt = nonSecondary.findIndex(n => {
    const nn = String(n.name || '').trim();
    return isCuttingStageKey(nn);
  });
  if (insertAt >= 0) {
    insertAt += 1;
  } else {
    insertAt = 0;
  }

  const result = [...nonSecondary];
  result.splice(insertAt, 0, parentNode);
  return result;
};

export const resolveNodesForListOrder = (
  order: ProductionOrder | null,
  progressNodesByStyleNo: Record<string, ProgressNode[]>,
  fallbackNodes: ProgressNode[],
): ProgressNode[] => {
  const orderNodes = parseWorkflowNodesFromOrder(order);
  if (orderNodes.length) {
    const sn = String((order as any)?.styleNo || '').trim();
    const styleNodes = sn && progressNodesByStyleNo[sn] ? progressNodesByStyleNo[sn] : [];
    if (styleNodes.length > 0) {
      const priceMap = new Map<string, number>();
      const stageMap = new Map<string, string>();
      const orderMap = new Map<string, number>();
      styleNodes.forEach((n, i) => {
        const price = Number(n.unitPrice) || 0;
        if (price > 0) priceMap.set(n.name, price);
        if (n.progressStage) stageMap.set(n.name, n.progressStage);
        orderMap.set(n.name, i);
      });
      const merged = orderNodes.map(n => ({
        ...n,
        unitPrice: priceMap.get(n.name) ?? (Number(n.unitPrice) || 0),
        progressStage: n.progressStage || stageMap.get(n.name) || undefined,
      })).sort((a, b) => {
        const ia = orderMap.has(a.name) ? orderMap.get(a.name)! : 999;
        const ib = orderMap.has(b.name) ? orderMap.get(b.name)! : 999;
        return ia - ib;
      });
      return collapseSecondaryProcessNodes(applySubProcessRemapToNodes(merged, order));
    }
    return collapseSecondaryProcessNodes(applySubProcessRemapToNodes(orderNodes, order));
  }
  const sn = String((order as any)?.styleNo || '').trim();
  if (sn && progressNodesByStyleNo[sn]?.length) {
    return collapseSecondaryProcessNodes(applySubProcessRemapToNodes(progressNodesByStyleNo[sn], order));
  }
  return collapseSecondaryProcessNodes(applySubProcessRemapToNodes(fallbackNodes?.length ? fallbackNodes : defaultNodes, order));
};

export const getProcessesByNodeFromOrder = (
  order: ProductionOrder | null,
  templateNodes?: ProgressNode[],
): Record<string, { name: string; unitPrice?: number; processCode?: string }[]> => {
  const templatePriceMap = new Map<string, number>();
  if (templateNodes?.length) {
    templateNodes.forEach(n => {
      const price = Number(n.unitPrice) || 0;
      if (price > 0) templatePriceMap.set(n.name, price);
    });
  }

  const raw = String((order as any)?.progressWorkflowJson ?? '').trim();
  if (raw) {
    try {
      const obj = JSON.parse(raw);
      const nodes = Array.isArray(obj?.nodes) ? obj.nodes : [];
      const byNode: Record<string, { name: string; unitPrice?: number; processCode?: string }[]> = {};
      if (nodes.length && nodes[0]?.name) {
        for (const item of nodes) {
          const n = String(item?.name || item?.processName || '').trim();
          if (!n) continue;
          const rawStage = String(item?.progressStage || '').trim();
          const stage = (rawStage && rawStage !== n) ? rawStage : (resolveDynamicParent(n) || rawStage || n);
          const storedPrice = Number(item?.unitPrice) || 0;
          const price = templatePriceMap.get(n) ?? storedPrice;
          const processCode = String(item?.id || item?.processCode || '').trim() || undefined;
          if (!byNode[stage]) byNode[stage] = [];
          byNode[stage].push({ name: n, unitPrice: price, processCode });
        }
        if (Object.keys(byNode).length > 0) return byNode;
      }
      const processesByNode = obj?.processesByNode || {};
      const result: Record<string, { name: string; unitPrice?: number; processCode?: string }[]> = {};
      for (const k of Object.keys(processesByNode || {})) {
        const arr = Array.isArray(processesByNode[k]) ? processesByNode[k] : [];
        result[k] = arr
          .map((p: any) => {
            const name = String(p?.name || p?.processName || '').trim();
            const storedPrice = Number(p?.unitPrice) || 0;
            const processCode = String(p?.id || p?.processCode || '').trim() || undefined;
            return { name, unitPrice: templatePriceMap.get(name) ?? storedPrice, processCode };
          })
          .filter((x) => x.name);
      }
      if (Object.keys(result).length > 0) return result;
    } catch {
      // fall through
    }
  }

  const unitPrices = (order as any)?.progressNodeUnitPrices;
  if (Array.isArray(unitPrices) && unitPrices.length > 0) {
    const byNode: Record<string, { name: string; unitPrice?: number; processCode?: string }[]> = {};
    for (let idx = 0; idx < unitPrices.length; idx++) {
      const item = unitPrices[idx];
      const n = String(item?.name || item?.processName || '').trim();
      if (!n) continue;
      const rawStage = String(item?.progressStage || '').trim();
      const stage = (rawStage && rawStage !== n) ? rawStage : (resolveDynamicParent(n) || rawStage || n);
      const storedPrice = Number(item?.unitPrice) || Number(item?.price) || 0;
      const price = templatePriceMap.get(n) ?? storedPrice;
      const processCode = String(item?.id || item?.processId || item?.processCode || '').trim() || undefined;
      if (!byNode[stage]) byNode[stage] = [];
      byNode[stage].push({ name: n, unitPrice: price, processCode });
    }
    if (Object.keys(byNode).length > 0) return byNode;
  }

  return {};
};
