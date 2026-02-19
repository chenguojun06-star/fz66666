import { useEffect, useMemo } from 'react';
import dayjs from 'dayjs';
import { compareSizeAsc } from '@/utils/api';
import type { CuttingBundle, ScanRecord } from '@/types/production';
import { getRecordStageName } from '../utils';

type BundleMeta = { operatorId: string; operatorIds: string[]; operatorName: string; operatorNames: string[]; receiveTime?: string; completeTime?: string };

type UseScanBundlesParams = {
  scanOpen: boolean;
  watchScanCode: unknown;
  watchProgressStage: unknown;
  watchScanType: unknown;
  cuttingBundles: CuttingBundle[];
  scanHistory: ScanRecord[];
  scanForm: any;
  bundleSelectedQr: string;
  setBundleSelectedQr: (qr: string) => void;
};

type UseScanBundlesResult = {
  matchedBundle: CuttingBundle | null;
  bundleDoneByQrForSelectedNode: Record<string, number>;
  bundleMetaByQrForSelectedNode: Record<string, BundleMeta>;
  bundleSummary: { totalQty: number; sizeRows: { size: string; qty: number }[] };
  isBundleCompletedForSelectedNode: (b: CuttingBundle | null | undefined) => boolean;
};

export const useScanBundles = ({
  scanOpen,
  watchScanCode,
  watchProgressStage,
  watchScanType,
  cuttingBundles,
  scanHistory,
  scanForm,
  bundleSelectedQr,
  setBundleSelectedQr,
}: UseScanBundlesParams): UseScanBundlesResult => {
  const matchedBundle = useMemo(() => {
    const code = String(watchScanCode || '').trim();
    if (!code || !cuttingBundles.length) return null;
    return cuttingBundles.find((b) => String(b.qrCode || '').trim() === code) || null;
  }, [watchScanCode, cuttingBundles]);

  useEffect(() => {
    if (!scanOpen) return;
    if (matchedBundle) {
      const matchedQty = Number(matchedBundle?.quantity);
      scanForm.setFieldsValue({
        color: matchedBundle?.color || '',
        size: matchedBundle?.size || '',
        quantity: Number.isFinite(matchedQty) && matchedQty > 0 ? matchedQty : undefined,
      });
      return;
    }
    const code = String(watchScanCode || '').trim();
    if (!code) {
      scanForm.setFieldsValue({ color: '', size: '', quantity: undefined });
      if (bundleSelectedQr) setBundleSelectedQr('');
      return;
    }
    if (bundleSelectedQr && bundleSelectedQr !== code) {
      setBundleSelectedQr('');
    }
  }, [matchedBundle, scanOpen, scanForm, watchScanCode, bundleSelectedQr, setBundleSelectedQr]);

  const bundleDoneByQrForSelectedNode = useMemo(() => {
    const pn = String(watchProgressStage || '').trim();
    const st = String(watchScanType || '').trim();
    if (!pn) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    for (const r of scanHistory) {
      const record = r as unknown as any;
      if (String(record?.scanResult || '').trim() !== 'success') continue;
      if (st && String(record?.scanType || '').trim() !== st) continue;
      if (getRecordStageName(record) !== pn) continue;
      const qr = String(record?.cuttingBundleQrCode || '').trim();
      if (!qr) continue;
      map[qr] = (map[qr] || 0) + (Number(record?.quantity) || 0);
    }
    return map;
  }, [scanHistory, watchProgressStage, watchScanType]);

  const bundleMetaByQrForSelectedNode = useMemo(() => {
    const pn = String(watchProgressStage || '').trim();
    const st = String(watchScanType || '').trim();
    if (!pn) return {} as Record<string, BundleMeta>;

    const qtyByQr: Record<string, number> = {};
    for (const b of cuttingBundles) {
      const bundle = b as unknown as any;
      const qr = String(bundle?.qrCode || '').trim();
      if (!qr) continue;
      qtyByQr[qr] = Number(bundle?.quantity) || 0;
    }

    const grouped: Record<string, ScanRecord[]> = {};
    for (const r of scanHistory) {
      const record = r as unknown as any;
      if (String(record?.scanResult || '').trim() !== 'success') continue;
      if (st && String(record?.scanType || '').trim() !== st) continue;
      if (getRecordStageName(record) !== pn) continue;
      const qr = String(record?.cuttingBundleQrCode || '').trim();
      if (!qr) continue;
      if (!grouped[qr]) grouped[qr] = [];
      grouped[qr].push(r);
    }

    const meta: Record<string, BundleMeta> = {};
    for (const [qr, records] of Object.entries(grouped)) {
      const sorted = [...records].sort((a, b) => {
        const ra = a as unknown as any;
        const rb = b as unknown as any;
        const ta = dayjs(String(ra?.scanTime || '')).valueOf() || 0;
        const tb = dayjs(String(rb?.scanTime || '')).valueOf() || 0;
        return ta - tb;
      });

      const operatorIds: string[] = [];
      const operatorNames: string[] = [];
      const seenIds = new Set<string>();
      const seenNames = new Set<string>();
      for (const r of sorted) {
        const record = r as unknown as any;
        const id = String(record?.operatorId || '').trim();
        const name = String(record?.operatorName || '').trim();
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          operatorIds.push(id);
        }
        if (name && !seenNames.has(name)) {
          seenNames.add(name);
          operatorNames.push(name);
        }
      }

      const firstRecord = sorted[0] as unknown as any;
      const receiveTime = String(firstRecord?.scanTime || '').trim() || undefined;

      const total = Number(qtyByQr[qr]) || 0;
      let cum = 0;
      let completeTime: string | undefined;
      if (total > 0) {
        for (const r of sorted) {
          const record = r as unknown as any;
          cum += Number(record?.quantity) || 0;
          if (!completeTime && cum >= total) {
            completeTime = String(record?.scanTime || '').trim() || undefined;
            break;
          }
        }
      }

      const lastRecord = sorted[sorted.length - 1] as unknown as any;
      const lastOperatorId = String(lastRecord?.operatorId || '').trim();
      const lastOperatorName = String(lastRecord?.operatorName || '').trim();
      meta[qr] = {
        operatorId: lastOperatorId || '-',
        operatorIds,
        operatorName: lastOperatorName || '-',
        operatorNames,
        receiveTime,
        completeTime,
      };
    }
    return meta;
  }, [scanHistory, watchProgressStage, watchScanType, cuttingBundles]);

  const isBundleCompletedForSelectedNode = (b: CuttingBundle | null | undefined) => {
    const pn = String(watchProgressStage || '').trim();
    if (!pn || !b) return false;
    const qr = String(b.qrCode || '').trim();
    if (!qr) return false;
    const done = Number(bundleDoneByQrForSelectedNode[qr]) || 0;
    const total = Number(b.quantity) || 0;
    return total > 0 && done >= total;
  };

  const bundleSummary = useMemo(() => {
    const sizeMap: Record<string, number> = {};
    let totalQty = 0;
    for (const b of cuttingBundles) {
      const size = String(b.size || '').trim() || '-';
      const qty = Number(b.quantity) || 0;
      totalQty += qty;
      sizeMap[size] = (sizeMap[size] || 0) + qty;
    }
    const sizeRows = Object.entries(sizeMap)
      .map(([size, qty]) => ({ size, qty }))
      .sort((a, b) => compareSizeAsc(a.size, b.size));
    return { totalQty, sizeRows };
  }, [cuttingBundles]);

  return {
    matchedBundle,
    bundleDoneByQrForSelectedNode,
    bundleMetaByQrForSelectedNode,
    bundleSummary,
    isBundleCompletedForSelectedNode,
  };
};
