import type { RefObject, MutableRefObject } from 'react';
import type { ProductionOrder, CuttingBundle } from '@/types/production';
import { productionScanApi } from '@/services/production/productionApi';
import { isDuplicateScanMessage } from '@/utils/api';
import { calculateProgressFromBundles, getNodeIndexFromProgress, resolveNodesForOrder, stripWarehousingNode } from '../utils';
import type { ProgressNode } from '../types';
import type { FormInstance } from 'antd';
import type { InputRef } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import { useScanSound } from '@/hooks/useScanSound';

interface UseScanExecutionParams {
  scanConfirmState: {
    payload: any;
    loading: boolean;
    meta?: Record<string, any>;
  };
  closeScanConfirmState: () => void;
  setScanConfirmLoading: (loading: boolean) => void;
  activeOrder: ProductionOrder | null;
  message: MessageInstance;
  submitScanFeedback: (params: { orderId: string; orderNo: string; stageName: string; processName: string }) => void;
  progressNodesByStyleNo: Record<string, ProgressNode[]>;
  nodes: ProgressNode[];
  cuttingBundles: CuttingBundle[];
  updateOrderProgress: (order: ProductionOrder, progress: number) => Promise<void>;
  fetchScanHistory: (order: ProductionOrder, options?: { silent?: boolean }) => Promise<any[]>;
  fetchOrders: () => Promise<void>;
  scanForm: FormInstance;
  scanInputRef: RefObject<InputRef | null>;
  setScanSubmitting: (v: boolean) => void;
  scanSubmittingRef: MutableRefObject<boolean>;
  lastFailedRequestRef: MutableRefObject<{ key: string; requestId: string } | null>;
}

export function useScanExecution({
  scanConfirmState,
  closeScanConfirmState,
  setScanConfirmLoading,
  activeOrder,
  message,
  submitScanFeedback,
  progressNodesByStyleNo,
  nodes,
  cuttingBundles,
  updateOrderProgress,
  fetchScanHistory,
  fetchOrders,
  scanForm,
  scanInputRef,
  setScanSubmitting,
  scanSubmittingRef,
  lastFailedRequestRef,
}: UseScanExecutionParams) {
  // 声音反馈
  const { playSuccess, playError, playDuplicate, playWarning } = useScanSound();

  const closeScanConfirm = (silent?: boolean) => {
    closeScanConfirmState();
    setScanSubmitting(false);
    scanSubmittingRef.current = false;
    if (!silent) {
      message.info('已取消');
    }
  };

  const submitConfirmedScan = async () => {
    if (!scanConfirmState.payload || scanConfirmState.loading) return;
    if (!activeOrder) return;
    setScanConfirmLoading(true);
    const meta = scanConfirmState.meta || {};
    const attemptKey = meta.attemptKey || '';
    const attemptRequestId = meta.attemptRequestId || '';
    const values = meta.values || {};
    try {
      const response = await productionScanApi.execute(scanConfirmState.payload);
      const result = response as Record<string, unknown>;
      if (result.code === 200) {
        lastFailedRequestRef.current = null;
        const serverMsg = String((result?.data as any)?.message || '').trim();
        const exceed = serverMsg.includes('裁剪') && serverMsg.includes('超出');
        if (exceed) {
          playWarning(); // 数量超出警告音
          message.error('数量超出无法入库');
          closeScanConfirm(true);
          return;
        }
        const isDuplicate = isDuplicateScanMessage(serverMsg);
        if (isDuplicate) {
          playDuplicate(); // 重复扫码提示音
          message.info('已处理');
        } else {
          playSuccess(); // 扫码成功提示音
          message.success(serverMsg || '扫码成功');
          submitScanFeedback({
            orderId: String(activeOrder.id || ''),
            orderNo: activeOrder.orderNo,
            stageName: values.progressStage,
            processName: values.processName,
          });
        }
        const effectiveNodes = stripWarehousingNode(resolveNodesForOrder(activeOrder, progressNodesByStyleNo, nodes));
        if (!isDuplicate) {
          const updated = await fetchScanHistory(activeOrder);
          const autoCalculatedProgress = calculateProgressFromBundles(activeOrder, cuttingBundles, updated, effectiveNodes);
          await updateOrderProgress(activeOrder, autoCalculatedProgress);
          const currentIdx = getNodeIndexFromProgress(effectiveNodes, autoCalculatedProgress);
          const nextNode = effectiveNodes[currentIdx];
          if (nextNode) {
            scanForm.setFieldsValue({
              progressStage: String(nextNode.name || '').trim() || undefined,
              processCode: String(nextNode.id || '').trim(),
              unitPrice: Number.isFinite(Number(nextNode.unitPrice)) && Number(nextNode.unitPrice) >= 0 ? Number(nextNode.unitPrice) : undefined,
            });
          }
        } else {
          // 两个独立请求并行化
          await Promise.all([fetchOrders(), fetchScanHistory(activeOrder)]);
        }
        scanForm.setFieldsValue({ scanCode: '', quantity: undefined });
        setTimeout(() => scanInputRef.current?.focus?.(), 0);
      } else {
        const msg = String(result.message || '').trim();
        const exceed = msg.includes('裁剪') && msg.includes('超出');
        if (exceed) {
          playWarning(); // 数量超出警告音
          message.error('数量超出无法入库');
        } else if (msg) {
          playError(); // 扫码失败提示音
          message.error(msg);
        } else {
          playError(); // 系统繁忙提示音
          message.error('系统繁忙');
        }
      }
    } catch (error) {
      const anyErr: any = error;
      const hasStatus = anyErr?.status != null || anyErr?.response?.status != null;
      if (!hasStatus) {
        if (attemptKey && attemptRequestId) {
          lastFailedRequestRef.current = { key: attemptKey, requestId: attemptRequestId };
        }
        playError(); // 连接失败提示音
        message.error('连接失败');
      } else {
        lastFailedRequestRef.current = null;
        console.error('scan_execute_failed', error);
        playError(); // 系统繁忙提示音
        message.error('系统繁忙');
      }
    } finally {
      setScanConfirmLoading(false);
      closeScanConfirm(true);
      setScanSubmitting(false);
      scanSubmittingRef.current = false;
    }
  };

  return { submitConfirmedScan, closeScanConfirm };
}
