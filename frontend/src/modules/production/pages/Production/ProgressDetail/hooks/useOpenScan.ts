import React, { useCallback } from 'react';
import type { InputRef } from 'antd';
import type { ProductionOrder } from '@/types/production';
import type { StyleProcess } from '@/types/style';
import type { ProgressNode } from '../types';
import { getCurrentWorkflowNodeForOrder } from '../utils';

type UseOpenScanParams = {
  isOrderFrozenByStatus: (order: ProductionOrder) => boolean;
  message: { error: (msg: string) => void };
  fetchOrderDetail: (orderId: string) => Promise<ProductionOrder | null>;
  setActiveOrder: (order: ProductionOrder | null) => void;
  setNodeWorkflowLocked: (locked: boolean) => void;
  setNodeWorkflowDirty: (dirty: boolean) => void;
  ensureNodesFromTemplateIfNeeded: (order: ProductionOrder) => Promise<void>;
  fetchScanHistory: (order: ProductionOrder) => Promise<any>;
  fetchCuttingBundles: (order: ProductionOrder) => Promise<any>;
  fetchPricingProcesses: (order: ProductionOrder) => Promise<StyleProcess[]>;
  setScanBundlesExpanded: (v: boolean) => void;
  setBundleSelectedQr: (v: string) => void;
  setScanOpen: (v: boolean) => void;
  scanForm: any;
  progressNodesByStyleNo: Record<string, ProgressNode[]>;
  nodes: ProgressNode[];
  defaultNodes: ProgressNode[];
  findPricingProcessForStage: (list: StyleProcess[], stageName: string) => StyleProcess | null;
  scanInputRef: React.RefObject<InputRef>;
};

export const useOpenScan = ({
  isOrderFrozenByStatus,
  message,
  fetchOrderDetail,
  setActiveOrder,
  setNodeWorkflowLocked,
  setNodeWorkflowDirty,
  ensureNodesFromTemplateIfNeeded,
  fetchScanHistory,
  fetchCuttingBundles,
  fetchPricingProcesses,
  setScanBundlesExpanded,
  setBundleSelectedQr,
  setScanOpen,
  scanForm,
  progressNodesByStyleNo,
  nodes,
  defaultNodes,
  findPricingProcessForStage,
  scanInputRef,
}: UseOpenScanParams) => {
  return useCallback(async (order: ProductionOrder) => {
    if (isOrderFrozenByStatus(order)) {
      message.error('订单已完成，无法操作');
      return;
    }
    const detail = order?.id ? await fetchOrderDetail(order.id) : null;
    const effective = detail || order;
    setActiveOrder(effective);
    setNodeWorkflowLocked(Number((effective as any)?.progressWorkflowLocked) === 1);
    setNodeWorkflowDirty(false);
    await ensureNodesFromTemplateIfNeeded(effective);
    await fetchScanHistory(effective);
    await fetchCuttingBundles(effective);
    const procs = await fetchPricingProcesses(effective);
    setScanBundlesExpanded(false);
    setBundleSelectedQr('');
    setScanOpen(true);
    scanForm.resetFields();

    const currentNode = getCurrentWorkflowNodeForOrder(effective, progressNodesByStyleNo, nodes, defaultNodes);
    const currentNodeName = String(currentNode?.name || '').trim();
    const currentNodeCode = String(currentNode?.id || '').trim();
    const currentUnitPrice = Number(currentNode?.unitPrice);
    const baseUnitPrice = Number.isFinite(currentUnitPrice) && currentUnitPrice >= 0 ? currentUnitPrice : undefined;

    scanForm.setFieldsValue({
      scanType: 'production',
      orderNo: effective.orderNo,
      scanCode: '',
      progressStage: currentNodeName || undefined,
      processCode: currentNodeCode || '',
      color: '',
      size: '',
      quantity: undefined,
      baseUnitPrice,
      unitPrice: baseUnitPrice,
    });

    const matched = findPricingProcessForStage(procs, currentNodeName);
    const autoPicked = matched || (procs.length === 1 ? procs[0] : null);
    if (autoPicked) {
      const name = String((autoPicked as any)?.processName || '').trim();
      const price = Number((autoPicked as any)?.price);
      scanForm.setFieldsValue({
        processName: name || undefined,
        unitPrice: Number.isFinite(price) && price >= 0 ? price : baseUnitPrice,
      });
    }
    setTimeout(() => {
      scanInputRef.current?.focus?.();
    }, 0);
  }, [
    isOrderFrozenByStatus,
    message,
    fetchOrderDetail,
    setActiveOrder,
    setNodeWorkflowLocked,
    setNodeWorkflowDirty,
    ensureNodesFromTemplateIfNeeded,
    fetchScanHistory,
    fetchCuttingBundles,
    fetchPricingProcesses,
    setScanBundlesExpanded,
    setBundleSelectedQr,
    setScanOpen,
    scanForm,
    progressNodesByStyleNo,
    nodes,
    defaultNodes,
    findPricingProcessForStage,
    scanInputRef,
  ]);
};
