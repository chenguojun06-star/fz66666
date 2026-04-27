import React, { useMemo } from 'react';
import { CuttingBundleRow, BatchSelectBundleRow, BundleRepairStats } from '../types';
import { isBundleBlockedForWarehousing, mapBundleStatusText } from '../utils';

export const buildBatchSelectRows = (
  bundles: CuttingBundleRow[],
  qualifiedWarehousedBundleQrSet: Set<string>,
  productionReadyQrSet: Set<string>,
  bundleRepairRemainingByQr: Record<string, number>,
  qrStageHintsMap: Record<string, string[]>,
): BatchSelectBundleRow[] => {
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
        key: qr,
        qr,
        bundleId: String((b as any).id || '').trim() || undefined,
        bundleNo: bundleNo || undefined,
        color: color || undefined,
        size: size || undefined,
        quantity: qty || 0,
        availableQty,
        statusText,
        disabled,
        rawStatus,
        stageHints: qrStageHintsMap[qr] || [],
      };
    })
    .filter(Boolean) as BatchSelectBundleRow[];
};

export const computeBatchSelectedSummary = (
  batchSelectedBundleQrs: string[],
  batchQtyByQr: Record<string, number>,
  bundles: CuttingBundleRow[],
  bundleRepairRemainingByQr: Record<string, number>,
  bundleRepairStatsByQr: Record<string, BundleRepairStats>,
) => {
  const qrs = batchSelectedBundleQrs.map((v) => String(v || '').trim()).filter(Boolean);
  let totalQty = 0;
  let blockedCount = 0;
  let blockedQty = 0;
  let nonBlockedQty = 0;
  let blockedRemainingSum = 0;
  let blockedMissing = 0;
  let repairPoolSum = 0;
  let repairedOutSum = 0;
  let statsMissing = 0;

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
    selectedCount: qrs.length,
    totalQty,
    blockedCount,
    blockedQty,
    nonBlockedQty,
    blockedRemainingSum,
    blockedMissing,
    repairPoolSum,
    repairedOutSum,
    statsMissing,
  };
};
