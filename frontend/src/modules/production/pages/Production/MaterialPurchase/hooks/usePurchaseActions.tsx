/**
 * usePurchaseActions — 采购操作组合 Hook
 * 组合 6 个子 hook，保持原返回值结构完全不变
 *
 * 子 hook 拆分（同目录）：
 *   - usePurchaseReturnConfirmActions  回料确认 + 批量回料
 *   - usePurchaseReturnResetActions    退回（主管级别及以上）
 *   - usePurchaseQuickEditActions      快速编辑（备注 + 预计到货日期）
 *   - usePurchaseReceiveActions        领取/采购/采购全部/智能领取成功回调
 *   - usePurchaseConfirmCompleteActions 确认完成（批量）
 *   - usePurchaseExport                采购列表导出 Excel
 *
 * 纯函数与 API 调用：purchaseActionsHelpers.ts
 *   - postReturnConfirm / postReturnConfirmReset / postConfirmComplete / normalizeStatus
 */
import { useMemo } from 'react';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { normalizeStatus } from './purchaseActionsHelpers';
import { usePurchaseReturnConfirmActions } from './usePurchaseReturnConfirmActions';
import { usePurchaseReturnResetActions } from './usePurchaseReturnResetActions';
import { usePurchaseQuickEditActions } from './usePurchaseQuickEditActions';
import { usePurchaseReceiveActions } from './usePurchaseReceiveActions';
import { usePurchaseConfirmCompleteActions } from './usePurchaseConfirmCompleteActions';
import { usePurchaseExport } from './usePurchaseExport';

interface UsePurchaseActionsOptions {
  message: any;
  messageApi: any;
  user: any;
  isSupervisorOrAbove: boolean;
  currentPurchase: MaterialPurchaseType | null;
  fetchMaterialPurchaseList: () => Promise<void>;
  loadDetailByOrderNo: (orderNo: string) => Promise<void>;
  loadDetailByStyleNo: (styleNo: string, purchaseNo?: string) => Promise<void>;
  ensureOrderUnlocked: (orderKey: any) => Promise<boolean>;
  detailPurchases: MaterialPurchaseType[];
  purchaseList: MaterialPurchaseType[];
  setSubmitLoading: (v: boolean) => void;
  visible: boolean;
  dialogMode: 'view' | 'create' | 'preview';
}

export function usePurchaseActions({
  message,
  messageApi,
  user,
  isSupervisorOrAbove,
  currentPurchase,
  fetchMaterialPurchaseList,
  loadDetailByOrderNo,
  loadDetailByStyleNo,
  ensureOrderUnlocked,
  detailPurchases,
  purchaseList,
  setSubmitLoading,
  visible,
  dialogMode,
}: UsePurchaseActionsOptions) {
  // 回料确认 + 批量回料（先调用，因为 receive actions 依赖 openReturnConfirm）
  const {
    returnConfirmModal,
    returnConfirmForm,
    returnConfirmSubmitting,
    returnEvidenceFiles,
    setReturnEvidenceFiles,
    returnEvidenceRecognizing,
    recognizeReturnEvidence,
    openReturnConfirm,
    submitReturnConfirm,
    handleBatchReturn,
  } = usePurchaseReturnConfirmActions({
    message,
    user,
    currentPurchase,
    fetchMaterialPurchaseList,
    loadDetailByOrderNo,
    ensureOrderUnlocked,
    detailPurchases,
    visible,
    dialogMode,
  });

  // 退回（主管级别及以上）
  const {
    returnResetModal,
    returnResetForm,
    returnResetSubmitting,
    openReturnReset,
    submitReturnReset,
  } = usePurchaseReturnResetActions({
    message,
    isSupervisorOrAbove,
    currentPurchase,
    fetchMaterialPurchaseList,
    loadDetailByOrderNo,
    ensureOrderUnlocked,
    visible,
    dialogMode,
  });

  // 快速编辑
  const {
    quickEditModal,
    quickEditSaving,
    openQuickEditSafe,
    handleQuickEditSave,
  } = usePurchaseQuickEditActions({
    messageApi,
    fetchMaterialPurchaseList,
    ensureOrderUnlocked,
  });

  // 领取/采购/采购全部/智能领取成功回调
  const {
    receivePurchaseTask,
    confirmReturnPurchaseTask,
    handleReceiveAll,
    handleSmartReceiveSuccess,
  } = usePurchaseReceiveActions({
    message,
    user,
    currentPurchase,
    detailPurchases,
    fetchMaterialPurchaseList,
    loadDetailByOrderNo,
    loadDetailByStyleNo,
    setSubmitLoading,
    ensureOrderUnlocked,
    openReturnConfirm,
  });

  // 确认完成（批量）
  const {
    confirmComplete,
    confirmCompleteSubmitting,
  } = usePurchaseConfirmCompleteActions({
    message,
    detailPurchases,
    fetchMaterialPurchaseList,
    loadDetailByOrderNo,
    loadDetailByStyleNo,
    ensureOrderUnlocked,
  });

  // 导出
  const { handleExport } = usePurchaseExport({ message, purchaseList });

  const isSamplePurchaseView = useMemo(() => {
    // P1-4 修复：去掉 !orderNo || orderNo === '-' 启发式判断，仅按 sourceType 判断
    const sourceType = String(currentPurchase?.sourceType || '').trim();
    return sourceType === 'sample' || sourceType === 'batch';
  }, [currentPurchase?.sourceType]);

  return {
    returnConfirmModal, returnConfirmForm, returnConfirmSubmitting,
    returnEvidenceFiles, setReturnEvidenceFiles, returnEvidenceRecognizing, recognizeReturnEvidence,
    returnResetModal, returnResetForm, returnResetSubmitting,
    quickEditModal, quickEditSaving,
    openReturnConfirm, submitReturnConfirm,
    openReturnReset, submitReturnReset,
    receivePurchaseTask, confirmReturnPurchaseTask,
    handleReceiveAll, handleSmartReceiveSuccess, handleBatchReturn,
    openQuickEditSafe, handleQuickEditSave,
    handleExport,
    confirmComplete, confirmCompleteSubmitting,
    isSamplePurchaseView, normalizeStatus,
  };
}
