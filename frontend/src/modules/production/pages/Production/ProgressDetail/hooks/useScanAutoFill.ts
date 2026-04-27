import { useEffect, useRef } from 'react';
import { Form } from 'antd';
import { ProductionOrder, CuttingBundle } from '@/types/production';
import { ProgressNode } from '../types';
import { getCurrentWorkflowNodeForOrder, defaultNodes } from '../progressCalculator';
import { fetchCuttingBundles as fetchCuttingBundlesHelper } from '../helpers/fetchers';

type UseScanAutoFillOptions = {
  scanOpen: boolean;
  activeOrder: ProductionOrder | null;
  activeOrderProductionProgress: number | undefined;
  progressNodesByStyleNo: Record<string, ProgressNode[]>;
  nodes: ProgressNode[];
  scanForm: ReturnType<typeof Form.useForm>[0];
  cuttingBundles: CuttingBundle[];
  cuttingBundlesLoading: boolean;
  setCuttingBundles: React.Dispatch<React.SetStateAction<CuttingBundle[]>>;
  setCuttingBundlesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  fetchCuttingBundles: (order: ProductionOrder) => void;
};

export const useScanAutoFill = (options: UseScanAutoFillOptions) => {
  const {
    scanOpen,
    activeOrder,
    activeOrderProductionProgress,
    progressNodesByStyleNo,
    nodes,
    scanForm,
    cuttingBundles,
    cuttingBundlesLoading,
    fetchCuttingBundles,
  } = options;

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
  }, [scanOpen, activeOrder?.id, cuttingBundles.length, cuttingBundlesLoading]);

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
  }, [scanOpen, activeOrder?.id, activeOrderProductionProgress, nodes, scanForm]);
};
