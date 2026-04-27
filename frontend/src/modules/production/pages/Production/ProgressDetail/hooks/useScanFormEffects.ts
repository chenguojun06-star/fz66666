import { useEffect, useRef } from 'react';
import type { ProductionOrder } from '@/types/production';
import { getCurrentWorkflowNodeForOrder, defaultNodes } from '../utils';
import type { ProgressNode } from '../types';

type UseScanFormEffectsParams = {
  scanOpen: boolean;
  activeOrder: ProductionOrder | null;
  progressNodesByStyleNo: Record<string, ProgressNode[]>;
  nodes: ProgressNode[];
  scanForm: any;
  cuttingBundlesLoading: boolean;
  cuttingBundles: any[];
  fetchCuttingBundles: (order: ProductionOrder) => void;
};

export const useScanFormEffects = ({
  scanOpen, activeOrder, progressNodesByStyleNo, nodes, scanForm,
  cuttingBundlesLoading, cuttingBundles, fetchCuttingBundles,
}: UseScanFormEffectsParams) => {
  const scanBundlesFetchOnceRef = useRef<string>('');

  useEffect(() => {
    if (!scanOpen) {
      scanBundlesFetchOnceRef.current = '';
      return;
    }
    if (!activeOrder?.id) return;
    if (cuttingBundlesLoading) return;
    if (cuttingBundles.length) {
      scanBundlesFetchOnceRef.current = '';
      return;
    }
    if (scanBundlesFetchOnceRef.current === activeOrder.id) return;
    scanBundlesFetchOnceRef.current = activeOrder.id;
    void fetchCuttingBundles(activeOrder);
  }, [scanOpen, activeOrder?.id, cuttingBundles.length, cuttingBundlesLoading, fetchCuttingBundles]);

  useEffect(() => {
    if (!scanOpen) return;
    if (!activeOrder?.id) return;
    const currentNode = getCurrentWorkflowNodeForOrder(activeOrder, progressNodesByStyleNo, nodes, defaultNodes);
    const name = String(currentNode?.name || '').trim();
    const code = String(currentNode?.id || '').trim();
    const p = Number(currentNode?.unitPrice);
    scanForm.setFieldsValue({
      progressStage: name || undefined,
      processCode: code || '',
      unitPrice: Number.isFinite(p) && p >= 0 ? p : undefined,
    });
  }, [scanOpen, activeOrder?.id, activeOrder?.productionProgress, nodes, scanForm, progressNodesByStyleNo]);
};
