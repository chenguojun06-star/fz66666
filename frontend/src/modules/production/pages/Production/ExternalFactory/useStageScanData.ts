import { useState, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import { productionScanApi } from '@/services/production/productionApi';
import type { ApiResult } from '@/utils/api';

const _scanCache = new Map<string, { records: Record<string, unknown>[]; ts: number }>();
const _inflight = new Map<string, Promise<Record<string, unknown>[]>>();
const SCAN_CACHE_TTL = 2 * 60 * 1000;

async function loadOrderScans(orderId: string): Promise<Record<string, unknown>[]> {
  const hit = _scanCache.get(orderId);
  if (hit && Date.now() - hit.ts < SCAN_CACHE_TTL) return hit.records;
  if (_inflight.has(orderId)) return _inflight.get(orderId)!;
  const p = (async () => {
    try {
      const res = await productionScanApi.listByOrderId(orderId, { page: 1, pageSize: 500 });
      const r = res as ApiResult<any>;
      const raw = r?.data?.records ?? r?.data ?? [];
      const records: Record<string, unknown>[] = Array.isArray(raw)
        ? raw.filter((r: any) => String(r?.scanResult ?? '') === 'success' && Number(r?.quantity ?? 0) > 0)
        : [];
      _scanCache.set(orderId, { records, ts: Date.now() });
      return records;
    } finally {
      _inflight.delete(orderId);
    }
  })();
  _inflight.set(orderId, p);
  return p;
}

const STAGE_ALIASES: Record<string, string[]> = {
  procurement: ['采购', '备料'],
  cutting:     ['裁剪', '裁断'],
  secondary:   ['二次工艺', '二次', '特种', '印花', '绣花', '洗水'],
  sewing:      ['车缝', '缝制', '制衣'],
  tail:        ['尾部', '尾工', '后整', '套结', '剪线', '锁边', '质检'],
  warehousing: ['入库', '仓库', '验收'],
};

export function stageMatch(progressStage: string, stageKey: string): boolean {
  const s = progressStage.trim();
  return (STAGE_ALIASES[stageKey] ?? []).some(a => s === a || s.includes(a) || a.includes(s));
}

interface SubProcess { name: string; qty: number }
interface ScanStageData {
  loading: boolean;
  subProcesses: SubProcess[];
  totalScanned: number;
  dailyRate7d: number;
  lastScanAt: string;
  workerCount: number;
}

export function useStageScanData(orderId: string, stageKey: string): ScanStageData {
  const [state, setState] = useState<ScanStageData>({
    loading: false, subProcesses: [], totalScanned: 0, dailyRate7d: 0, lastScanAt: '', workerCount: 0,
  });
  const prevKey = useRef('');

  useEffect(() => {
    const key = `${orderId}__${stageKey}`;
    if (!orderId || prevKey.current === key) return;
    prevKey.current = key;
    setState(s => ({ ...s, loading: true }));
    let cancelled = false;
    loadOrderScans(orderId).then(all => {
      if (cancelled) return;
      const stage = all.filter(r => stageMatch(String(r.progressStage ?? ''), stageKey));
      const byProcess: Record<string, number> = {};
      let lastAt = '';
      const sevenAgo = dayjs().subtract(7, 'day');
      let recent7Qty = 0;
      const recentWorkerSet = new Set<string>();
      stage.forEach(r => {
        const pname = String(r.processName ?? '').trim() || '（本工序）';
        byProcess[pname] = (byProcess[pname] ?? 0) + Number(r.quantity ?? 0);
        const t = String(r.scanTime ?? r.createTime ?? '');
        if (t > lastAt) lastAt = t;
        if (t && dayjs(t).isAfter(sevenAgo)) {
          recent7Qty += Number(r.quantity ?? 0);
          const opKey = String(r.operatorId ?? r.operatorName ?? '').trim();
          if (opKey) recentWorkerSet.add(opKey);
        }
      });
      const subProcesses = Object.entries(byProcess)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty);
      const totalScanned = subProcesses.reduce((s, p) => s + p.qty, 0);
      setState({ loading: false, subProcesses, totalScanned, dailyRate7d: recent7Qty / 7, lastScanAt: lastAt, workerCount: recentWorkerSet.size });
    }).catch(() => {
      if (!cancelled) setState(s => ({ ...s, loading: false }));
    });
    return () => {
      cancelled = true;
      prevKey.current = '';
    };
  }, [orderId, stageKey]);

  return state;
}
