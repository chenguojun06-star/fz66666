import { useMemo } from 'react';
import type { CuttingBundle, ProductionOrder, ScanRecord } from '@/types/production';
import type { ProgressNode } from '../types';
import { clampPercent, getRecordStageName, stageNameMatches } from '../utils';

type NodeStatsResult = {
  statsByName: Record<string, { done: number; total: number; remaining: number; percent: number }>;
  totalQty: number;
};

type UseNodeStatsParams = {
  scanHistory: ScanRecord[];
  activeOrder: ProductionOrder | null;
  cuttingBundles: CuttingBundle[];
  nodes: ProgressNode[];
};

export const useNodeStats = ({ scanHistory, activeOrder, cuttingBundles, nodes }: UseNodeStatsParams): NodeStatsResult => {
  return useMemo(() => {
    const oid = String(activeOrder?.id || '').trim();
    const ono = String(activeOrder?.orderNo || '').trim();
    const bundlesForOrder = (cuttingBundles || []).filter(
      (b) => String((b as any)?.productionOrderId || '').trim() === oid || String((b as any)?.productionOrderNo || '').trim() === ono
    );
    const bundlesTotalQty = bundlesForOrder.reduce((acc, b) => acc + (Number((b as any)?.quantity) || 0), 0);
    const totalQty = bundlesTotalQty > 0 ? bundlesTotalQty : (Number((activeOrder as any)?.orderQuantity) || 0);
    const records = (scanHistory || []).filter((r) => {
      const record = r as unknown as any;
      if (String(record?.scanResult || '').trim() !== 'success') return false;
      const q = Number(record?.quantity) || 0;
      return q > 0;
    });

    const statsByName: Record<string, { done: number; total: number; remaining: number; percent: number }> = {};
    const total = Math.max(0, totalQty);

    for (const n of nodes || []) {
      const nodeName = String((n as any)?.name || '').trim();
      if (!nodeName) continue;
      const doneFromScans = records
        .filter((r) => stageNameMatches(nodeName, getRecordStageName(r as unknown as any)))
        .reduce((acc, r) => acc + (Number((r as unknown as any)?.quantity) || 0), 0);

      let done = doneFromScans;
      if (nodeName.includes('裁剪') && bundlesTotalQty > 0) {
        done = Math.max(done, bundlesTotalQty);
      }

      const safeDone = Math.max(0, Math.min(done, total));
      const remaining = Math.max(0, total - safeDone);
      const percent = total ? clampPercent((safeDone / total) * 100) : 0;
      statsByName[nodeName] = { done: safeDone, total, remaining, percent };
    }

    return { statsByName, totalQty: total };
  }, [scanHistory, activeOrder?.id, activeOrder?.orderNo, activeOrder?.orderQuantity, cuttingBundles, nodes]);
};
