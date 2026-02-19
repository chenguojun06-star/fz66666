import React, { useCallback } from 'react';
import type { CuttingBundle, ProductionOrder } from '@/types/production';
import type { ProgressNode } from '../types';
import { getCurrentWorkflowNodeForOrder, isCuttingStageKey } from '../utils';

type UseSubmitScanParams = {
  activeOrder: ProductionOrder | null;
  user: { id?: string; name?: string } | null;
  scanForm: any;
  bundleSelectedQr: string;
  matchedBundle: CuttingBundle | null;
  isBundleCompletedForSelectedNode: (b: CuttingBundle | null | undefined) => boolean;
  setCuttingBundles: React.Dispatch<React.SetStateAction<CuttingBundle[]>>;
  setScanSubmitting: (v: boolean) => void;
  scanSubmittingRef: React.MutableRefObject<boolean>;
  lastFailedRequestRef: React.MutableRefObject<{ key: string; requestId: string } | null>;
  openScanConfirm: (payload: any, detail: any, meta: any) => void;
  progressNodesByStyleNo: Record<string, ProgressNode[]>;
  nodes: ProgressNode[];
  defaultNodes: ProgressNode[];
  productionCuttingApi: { getByCode: (code: string) => Promise<unknown> };
  message: { error: (msg: string) => void };
  generateRequestId: () => string;
};

export const useSubmitScan = ({
  activeOrder,
  user,
  scanForm,
  bundleSelectedQr,
  matchedBundle,
  isBundleCompletedForSelectedNode,
  setCuttingBundles,
  setScanSubmitting,
  scanSubmittingRef,
  lastFailedRequestRef,
  openScanConfirm,
  progressNodesByStyleNo,
  nodes,
  defaultNodes,
  productionCuttingApi,
  message,
  generateRequestId,
}: UseSubmitScanParams) => {
  return useCallback(async () => {
    if (!activeOrder) return;
    if (!user?.id || !user?.name) {
      message.error('未获取到当前登录人员信息');
      return;
    }

    if (scanSubmittingRef.current) return;
    scanSubmittingRef.current = true;
    setScanSubmitting(true);

    let attemptKey = '';
    let attemptRequestId = '';
    let didOpenConfirm = false;
    try {
      const stg = String(scanForm.getFieldValue('progressStage') || '').trim();
      if (!stg) {
        const currentNode = getCurrentWorkflowNodeForOrder(activeOrder, progressNodesByStyleNo, nodes, defaultNodes);
        const name = String(currentNode?.name || '').trim();
        const code = String(currentNode?.id || '').trim();
        const p = Number(currentNode?.unitPrice);
        scanForm.setFieldsValue({
          progressStage: name || undefined,
          processCode: code || '',
          unitPrice: Number.isFinite(p) && p >= 0 ? p : undefined,
        });
      }
      const values = await scanForm.validateFields();
      const scanCode = String(values.scanCode || '').trim();
      if (!scanCode) {
        message.error('请扫码或选择扎号');
        return;
      }
      if (isCuttingStageKey(values.progressStage)) {
        const selectedQr = String(bundleSelectedQr || '').trim();
        if (!selectedQr || selectedQr !== scanCode) {
          message.error('请先在扎号列表选择菲号');
          return;
        }
      }
      let selectedBundle = matchedBundle;
      if (!selectedBundle) {
        const parts = scanCode.split('-').filter(Boolean);
        const looksLikeBundleQr = parts.length >= 6 && /\d+$/.test(parts[parts.length - 1] || '');
        if (looksLikeBundleQr) {
          try {
            const res = await productionCuttingApi.getByCode(scanCode);
            const result = res as any;
            if (result.code !== 200) {
              message.error(String(result.message || '未找到对应的裁剪扎号'));
              return;
            }
            if (result.data) {
              const fetched = result.data as CuttingBundle;
              const fetchedOrderNo = String((fetched as any)?.productionOrderNo || '').trim();
              const fetchedOrderId = String((fetched as any)?.productionOrderId || '').trim();
              const currentOrderNo = String(activeOrder.orderNo || '').trim();
              const currentOrderId = String(activeOrder.id || '').trim();
              const belongsToOrder =
                (fetchedOrderNo && currentOrderNo && fetchedOrderNo === currentOrderNo)
                || (fetchedOrderId && currentOrderId && fetchedOrderId === currentOrderId);
              if (!belongsToOrder) {
                message.error('扎号与当前订单不匹配');
                return;
              }
              selectedBundle = fetched;
              setCuttingBundles((prev) => {
                const next = Array.isArray(prev) ? [...prev] : [];
                const exists = next.some((b) => String((b as any)?.qrCode || '').trim() === String((fetched as any)?.qrCode || '').trim());
                if (!exists) {
                  next.push(fetched);
                  next.sort((a, b) => (Number((a as any)?.bundleNo) || 0) - (Number((b as any)?.bundleNo) || 0));
                }
                return next;
              });
              const fetchedQty = Number((fetched as any)?.quantity);
              const formQty = Number(values.quantity);
              const nextQty = Number.isFinite(fetchedQty) && fetchedQty > 0
                ? fetchedQty
                : (Number.isFinite(formQty) && formQty > 0 ? formQty : undefined);
              scanForm.setFieldsValue({
                color: (fetched as any)?.color || values.color || '',
                size: (fetched as any)?.size || values.size || '',
                quantity: nextQty,
              });
            }
          } catch {
            // Intentionally empty
            // 忽略错误
          }
        }
      }
      if (selectedBundle && isBundleCompletedForSelectedNode(selectedBundle)) {
        message.error('该扎号在当前环节已完成，请选择其他扎号');
        return;
      }

      const bundleQty = Number((selectedBundle as any)?.quantity);
      const formQty = Number(values.quantity);
      const resolvedQty = Number.isFinite(bundleQty) && bundleQty > 0
        ? bundleQty
        : (Number.isFinite(formQty) && formQty > 0 ? formQty : null);
      if (!resolvedQty) {
        message.error('请填写数量');
        return;
      }

      const formUnitPrice = Number(values.unitPrice ?? scanForm.getFieldValue('baseUnitPrice'));
      const resolvedUnitPrice = Number.isFinite(formUnitPrice) && formUnitPrice >= 0 ? formUnitPrice : undefined;

      const bundleInfo = {
        color: selectedBundle?.color || values.color,
        size: selectedBundle?.size || values.size,
        quantity: resolvedQty,
      };

      const payloadBase: unknown = {
        scanType: values.scanType || 'production',
        scanCode: scanCode || undefined,
        orderId: activeOrder.id,
        orderNo: activeOrder.orderNo,
        styleId: activeOrder.styleId,
        styleNo: activeOrder.styleNo,
        processCode: values.processCode,
        progressStage: values.progressStage,
        processName: values.processName,
        unitPrice: resolvedUnitPrice,
        ...bundleInfo,
        operatorId: user.id,
        operatorName: user.name,
      };

      const requestKey = JSON.stringify(payloadBase);
      const requestId = lastFailedRequestRef.current?.key === requestKey
        ? lastFailedRequestRef.current.requestId
        : generateRequestId();
      attemptKey = requestKey;
      attemptRequestId = requestId;
      const payload = { ...(payloadBase as any), requestId };

      const detail = {
        scanCode,
        quantity: resolvedQty,
        progressStage: values.progressStage,
        processName: values.processName,
        unitPrice: resolvedUnitPrice,
        orderNo: activeOrder.orderNo,
        styleNo: activeOrder.styleNo,
        color: values.color,
        size: values.size,
      };

      didOpenConfirm = true;
      openScanConfirm(payload, detail, { attemptKey, attemptRequestId, values });
      return;
    } catch (error) {
      if ((error as any)?.errorFields) {
        const firstError = (error as any).errorFields?.[0];
        message.error(String(firstError?.errors?.[0] || '表单验证失败'));
      } else {
        message.error('系统繁忙');
      }
    } finally {
      if (!didOpenConfirm) {
        setScanSubmitting(false);
        scanSubmittingRef.current = false;
      }
    }
  }, [
    activeOrder,
    user?.id,
    user?.name,
    scanForm,
    bundleSelectedQr,
    matchedBundle,
    isBundleCompletedForSelectedNode,
    setCuttingBundles,
    setScanSubmitting,
    scanSubmittingRef,
    lastFailedRequestRef,
    openScanConfirm,
    progressNodesByStyleNo,
    nodes,
    defaultNodes,
    productionCuttingApi,
    message,
    generateRequestId,
  ]);
};
