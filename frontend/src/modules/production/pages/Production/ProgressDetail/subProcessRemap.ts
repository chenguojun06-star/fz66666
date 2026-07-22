import { ProductionOrder } from '@/types/production';
import { ProgressNode } from './types';
import { canonicalStageKey } from './stageResolver';

export type SubProcessRemapItem = {
  id?: string;
  name?: string;
  originalName?: string;
  [k: string]: unknown;
};

export type SubProcessRemapStage = {
  enabled?: boolean;
  subProcesses?: SubProcessRemapItem[];
  [k: string]: unknown;
};

export type SubProcessRemap = Record<string, SubProcessRemapStage>;

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

export const parseSubProcessRemap = (order: ProductionOrder | null): SubProcessRemap => {
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

export const applySubProcessRemapToNodes = (nodes: ProgressNode[], order: ProductionOrder | null): ProgressNode[] => {
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
