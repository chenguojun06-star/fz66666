import { useRef, useCallback } from 'react';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';

export interface ProgressNode {
  id: string;
  name: string;
  unitPrice: number;
  progressStage?: string;
}

const globalCache = new Map<string, { nodes: ProgressNode[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;
const pendingRequests = new Map<string, Promise<ProgressNode[]>>();

const stripWarehousingNode = (nodes: ProgressNode[]): ProgressNode[] =>
  nodes.filter(n => !/入库/.test(n.name));

const normalizeNodes = (rows: any[]): ProgressNode[] =>
  rows
    .map((n: any) => {
      const name = String(n?.name || '').trim();
      const id = String(n?.id || name || '').trim() || name;
      const p = Number(n?.unitPrice);
      const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
      const progressStage = String(n?.progressStage || '').trim() || undefined;
      return { id, name, unitPrice, progressStage };
    })
    .filter((n: ProgressNode) => n.name);

const fetchOne = async (styleNo: string): Promise<ProgressNode[]> => {
  const cached = globalCache.get(styleNo);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.nodes;

  const pending = pendingRequests.get(styleNo);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const res = await templateLibraryApi.progressNodeUnitPrices(styleNo);
      const r = res as Record<string, unknown>;
      const rows = Array.isArray(r?.data) ? r.data : [];
      const nodes = stripWarehousingNode(normalizeNodes(rows));
      globalCache.set(styleNo, { nodes, ts: Date.now() });
      return nodes;
    } catch {
      return [];
    } finally {
      pendingRequests.delete(styleNo);
    }
  })();

  pendingRequests.set(styleNo, promise);
  return promise;
};

export const useProgressNodeCache = () => {
  const _loadingRef = useRef(new Set<string>());

  const fetchBatch = useCallback(async (styleNos: string[]): Promise<Record<string, ProgressNode[]>> => {
    const unique = Array.from(new Set(styleNos.map(s => String(s || '').trim()).filter(Boolean)));
    if (!unique.length) return {};

    const toFetch = unique.filter(sn => !globalCache.has(sn) || Date.now() - (globalCache.get(sn)?.ts ?? 0) >= CACHE_TTL);
    const BATCH_SIZE = 5;

    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batch = toFetch.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(sn => fetchOne(sn)));
    }

    const result: Record<string, ProgressNode[]> = {};
    for (const sn of unique) {
      const cached = globalCache.get(sn);
      if (cached?.nodes.length) result[sn] = cached.nodes;
    }
    return result;
  }, []);

  const get = useCallback((styleNo: string): ProgressNode[] | undefined => {
    return globalCache.get(styleNo)?.nodes;
  }, []);

  const invalidate = useCallback((styleNo?: string) => {
    if (styleNo) {
      globalCache.delete(styleNo);
    } else {
      globalCache.clear();
    }
  }, []);

  return { fetchBatch, get, invalidate, fetchOne };
};

export const progressNodeCache = { get: (sn: string) => globalCache.get(sn)?.nodes, invalidate: (sn?: string) => { if (sn) globalCache.delete(sn); else globalCache.clear(); } };
