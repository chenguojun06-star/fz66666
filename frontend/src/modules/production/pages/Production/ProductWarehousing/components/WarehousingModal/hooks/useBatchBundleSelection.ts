import React, { useState, useEffect, useMemo } from 'react';
import { Form } from 'antd';
import { ProductWarehousing as WarehousingType } from '@/types/production';
import {
  CuttingBundleRow,
  BatchSelectBundleRow,
  BundleRepairStats,
} from '../../../types';
import {
  isBundleBlockedForWarehousing,
  mapBundleStatusText,
} from '../../../utils';

interface BatchSelectionDeps {
  form: ReturnType<typeof Form.useForm>[0];
  bundles: CuttingBundleRow[];
  qualifiedWarehousedBundleQrs: string[];
  productionReadyQrs: string[];
  bundleRepairStatsByQr: Record<string, BundleRepairStats>;
  bundleRepairRemainingByQr: Record<string, number>;
  qrStageHintsMap: Record<string, string[]>;
  currentWarehousing: WarehousingType | null;
}

export const useBatchBundleSelection = (deps: BatchSelectionDeps) => {
  const {
    form, bundles, qualifiedWarehousedBundleQrs, productionReadyQrs,
    bundleRepairStatsByQr, bundleRepairRemainingByQr, qrStageHintsMap,
    currentWarehousing,
  } = deps;

  const [batchSelectedBundleQrs, setBatchSelectedBundleQrs] = useState<string[]>([]);
  const [batchQtyByQr, setBatchQtyByQr] = useState<Record<string, number>>({});

  const qualifiedWarehousedBundleQrSet = useMemo(() => {
    return new Set(qualifiedWarehousedBundleQrs.map((v) => String(v || '').trim()).filter(Boolean));
  }, [qualifiedWarehousedBundleQrs]);

  const productionReadyQrSet = useMemo(() => {
    return new Set(productionReadyQrs.map((v) => String(v || '').trim()).filter(Boolean));
  }, [productionReadyQrs]);

  const batchSelectRows = useMemo((): BatchSelectBundleRow[] => {
    return bundles
      .map((b) => {
        const qr = String(b.qrCode || '').trim();
        if (!qr) return null;
        const color = String(b.color || '').trim();
        const size = String(b.size || '').trim();
        const qty = Number(b.quantity || 0) || 0;
        const bundleNo = Number(b.bundleNo || 0) || 0;
        const rawStatus = String((b as any)?.status || '').trim();
        const isBlocked = isBundleBlockedForWarehousing(rawStatus);
        const isRepairedWaitingQc = rawStatus === 'repaired_waiting_qc' || rawStatus === '返修待质检' || rawStatus === '返修完成待质检';
        const needsRepairQty = isBlocked || isRepairedWaitingQc;
        const remaining = needsRepairQty ? bundleRepairRemainingByQr[qr] : undefined;
        const availableQty = needsRepairQty
          ? (remaining !== undefined ? Math.max(0, Number(remaining || 0) || 0) : (isRepairedWaitingQc ? qty : 0))
          : qty;
        const isUsed = qualifiedWarehousedBundleQrSet.has(qr);
        const isProductionReady = productionReadyQrSet.size === 0 || productionReadyQrSet.has(qr);
        const disabled = isUsed || !isProductionReady ||
          (isBlocked && !isRepairedWaitingQc && (remaining === undefined || availableQty <= 0)) ||
          (isRepairedWaitingQc && remaining !== undefined && availableQty <= 0);

        let statusText = '';
        if (isUsed) {
          statusText = '已入库';
        } else if (!isProductionReady) {
          statusText = '生产未完成';
        } else if (isRepairedWaitingQc) {
          if (remaining === undefined) statusText = '返修完成待质检（计算中）';
          else statusText = availableQty > 0 ? `返修完成待质检｜可质检${availableQty}` : '返修完成待质检｜无可质检';
        } else if (isBlocked) {
          if (remaining === undefined) statusText = '次品待返修（计算中）';
          else statusText = availableQty > 0 ? `次品待返修｜可入库${availableQty}` : '次品待返修｜无可入库';
        } else if (rawStatus) {
          statusText = mapBundleStatusText(rawStatus);
        } else {
          statusText = '未开始';
        }

        return {
          key: qr, qr,
          bundleId: String((b as any).id || '').trim() || undefined,
          bundleNo: bundleNo || undefined,
          color: color || undefined,
          size: size || undefined,
          quantity: qty || 0,
          availableQty, statusText, disabled, rawStatus,
          stageHints: qrStageHintsMap[qr] || [],
        };
      })
      .filter(Boolean) as BatchSelectBundleRow[];
  }, [bundleRepairRemainingByQr, bundles, productionReadyQrSet, qualifiedWarehousedBundleQrSet, qrStageHintsMap]);

  const batchSelectableQrs = useMemo(() => {
    return batchSelectRows.filter((r) => !r.disabled).map((r) => r.qr);
  }, [batchSelectRows]);

  const handleBatchSelectionChange = (nextKeys: React.Key[], selectedRows: BatchSelectBundleRow[]) => {
    const nextQrs = nextKeys.map((k) => String(k || '').trim()).filter(Boolean);
    setBatchSelectedBundleQrs(nextQrs);
    setBatchQtyByQr((prev) => {
      const next: Record<string, number> = {};
      for (const qr of nextQrs) {
        const keep = Number(prev[qr] || 0) || 0;
        const row = selectedRows.find((r) => r.qr === qr) || batchSelectRows.find((r) => r.qr === qr);
        const maxQty = Math.max(0, Number((row as any)?.availableQty ?? row?.quantity ?? 0) || 0);
        const base = keep > 0 ? keep : maxQty;
        next[qr] = Math.max(0, Math.min(maxQty || base, base));
      }
      return next;
    });
  };

  const batchSelectedSummary = useMemo(() => {
    const qrs = batchSelectedBundleQrs.map((v) => String(v || '').trim()).filter(Boolean);
    let totalQty = 0, blockedCount = 0, blockedQty = 0, nonBlockedQty = 0;
    let blockedRemainingSum = 0, blockedMissing = 0, repairPoolSum = 0, repairedOutSum = 0, statsMissing = 0;

    const bundleByQrForSummary = new Map<string, CuttingBundleRow>();
    for (const b of bundles) {
      const qr = String(b.qrCode || '').trim();
      if (!qr) continue;
      bundleByQrForSummary.set(qr, b);
    }

    for (const qr of qrs) {
      const b = bundleByQrForSummary.get(qr);
      const rawStatus = String((b as any)?.status || '').trim();
      const sLower = rawStatus.toLowerCase();
      const isBlocked = isBundleBlockedForWarehousing(rawStatus);
      const isRepairedWaitingQc2 = sLower === 'repaired_waiting_qc' || rawStatus === '返修待质检' || rawStatus === '返修完成待质检';
      const needsRepairQty = isBlocked || isRepairedWaitingQc2;
      const remaining = needsRepairQty ? bundleRepairRemainingByQr[qr] : undefined;
      const maxQty = needsRepairQty
        ? Math.max(0, Number(remaining === undefined ? 0 : remaining) || 0)
        : Math.max(0, Number(b?.quantity ?? 0) || 0);
      const currentQty = Math.max(0, Math.min(maxQty, Number(batchQtyByQr[qr] || 0) || 0));

      totalQty += currentQty;
      if (needsRepairQty) {
        blockedCount += 1;
        blockedQty += currentQty;
        if (remaining === undefined) blockedMissing += 1;
        else blockedRemainingSum += Math.max(0, Number(remaining || 0) || 0);
        const st = bundleRepairStatsByQr[qr];
        if (!st) statsMissing += 1;
        else {
          repairPoolSum += Math.max(0, Number(st.repairPool || 0) || 0);
          repairedOutSum += Math.max(0, Number(st.repairedOut || 0) || 0);
        }
      } else {
        nonBlockedQty += currentQty;
      }
    }

    return {
      selectedCount: qrs.length, totalQty, blockedCount, blockedQty,
      nonBlockedQty, blockedRemainingSum, blockedMissing,
      repairPoolSum, repairedOutSum, statsMissing,
    };
  }, [batchQtyByQr, batchSelectedBundleQrs, bundles, bundleRepairRemainingByQr, bundleRepairStatsByQr]);

  const batchSelectedHasBlocked = useMemo(() => {
    return batchSelectedSummary.blockedCount > 0;
  }, [batchSelectedSummary.blockedCount]);

  const singleSelectedQr = useMemo(() => {
    if (batchSelectedBundleQrs.length !== 1) return '';
    return String(batchSelectedBundleQrs[0] || '').trim();
  }, [batchSelectedBundleQrs]);

  const singleSelectedBundle = useMemo(() => {
    if (!singleSelectedQr) return null;
    return bundles.find((b) => String(b.qrCode || '').trim() === singleSelectedQr) || null;
  }, [bundles, singleSelectedQr]);

  const isSingleSelectedBundleBlocked = useMemo(() => {
    const rawStatus = String((singleSelectedBundle as any)?.status || '').trim();
    const s = rawStatus.toLowerCase();
    const isRepairQc = s === 'repaired_waiting_qc' || rawStatus === '返修待质检' || rawStatus === '返修完成待质检';
    return Boolean(singleSelectedQr && (isBundleBlockedForWarehousing(rawStatus) || isRepairQc));
  }, [singleSelectedBundle, singleSelectedQr]);

  const singleSelectedBundleRepairStats = useMemo(() => {
    if (!singleSelectedQr) return undefined;
    return bundleRepairStatsByQr[singleSelectedQr];
  }, [bundleRepairStatsByQr, singleSelectedQr]);

  useEffect(() => {
    if (currentWarehousing) return;
    const qrs = batchSelectedBundleQrs.map((v) => String(v || '').trim()).filter(Boolean);
    if (!qrs.length) {
      form.setFieldsValue({
        cuttingBundleQrCode: undefined, cuttingBundleId: undefined,
        cuttingBundleNo: undefined, warehousingQuantity: undefined,
        qualifiedQuantity: undefined, unqualifiedQuantity: 0,
        qualityStatus: 'qualified',
      });
      return;
    }

    if (qrs.length === 1) {
      const qr = qrs[0];
      const b = bundles.find((x) => String(x.qrCode || '').trim() === qr) || null;
      form.setFieldsValue({
        cuttingBundleQrCode: qr,
        cuttingBundleId: b?.id,
        cuttingBundleNo: b?.bundleNo,
      });
    } else {
      form.setFieldsValue({
        cuttingBundleQrCode: undefined,
        cuttingBundleId: undefined,
        cuttingBundleNo: undefined,
      });
    }

    const total = qrs.reduce((sum, qr) => {
      const raw = Number(batchQtyByQr[qr] || 0) || 0;
      const row = batchSelectRows.find((r) => r.qr === qr);
      const cap = row ? Math.max(0, Number(row.availableQty || 0) || 0) : raw;
      return sum + (cap > 0 ? Math.min(raw, cap) : raw);
    }, 0);
    const rawStatus = qrs.length === 1 ? String((bundles.find((x) => String(x.qrCode || '').trim() === qrs[0]) as any)?.status || '').trim() : '';
    const sLower = rawStatus.toLowerCase();
    const isRepairFlow = qrs.length === 1 && (isBundleBlockedForWarehousing(rawStatus) ||
      sLower === 'repaired_waiting_qc' || rawStatus === '返修待质检' || rawStatus === '返修完成待质检');
    const baseUnq = qrs.length === 1 ? Number(form.getFieldValue('unqualifiedQuantity') || 0) || 0 : 0;
    const unq = isRepairFlow ? 0 : (qrs.length === 1 ? Math.max(0, Math.min(total, baseUnq)) : 0);
    const qual = Math.max(0, total - unq);
    form.setFieldsValue({
      warehousingQuantity: total,
      unqualifiedQuantity: unq,
      qualifiedQuantity: qual,
      qualityStatus: unq > 0 ? 'unqualified' : 'qualified',
      ...(isRepairFlow ? { repairRemark: '返修检验合格' } : {}),
    });
  }, [batchQtyByQr, batchSelectedBundleQrs, bundles, currentWarehousing, form, batchSelectRows, bundleRepairRemainingByQr]);

  const handleBatchSelectAll = () => {
    const nextQrs = batchSelectableQrs.slice();
    const selectedRows = nextQrs.map((qr) => batchSelectRows.find((r) => r.qr === qr)).filter(Boolean) as BatchSelectBundleRow[];
    handleBatchSelectionChange(nextQrs, selectedRows);
  };

  const handleBatchSelectInvert = () => {
    const current = new Set(batchSelectedBundleQrs.map((v) => String(v || '').trim()).filter(Boolean));
    const nextQrs = batchSelectableQrs.filter((qr) => !current.has(qr));
    const selectedRows = nextQrs.map((qr) => batchSelectRows.find((r) => r.qr === qr)).filter(Boolean) as BatchSelectBundleRow[];
    handleBatchSelectionChange(nextQrs, selectedRows);
  };

  const handleBatchSelectClear = () => {
    setBatchSelectedBundleQrs([]);
    setBatchQtyByQr({});
  };

  return {
    batchSelectedBundleQrs,
    setBatchSelectedBundleQrs,
    batchQtyByQr,
    setBatchQtyByQr,
    batchSelectRows,
    batchSelectableQrs,
    batchSelectedSummary,
    batchSelectedHasBlocked,
    singleSelectedBundle,
    isSingleSelectedBundleBlocked,
    singleSelectedBundleRepairStats,
    handleBatchSelectionChange,
    handleBatchSelectAll,
    handleBatchSelectInvert,
    handleBatchSelectClear,
  };
};
