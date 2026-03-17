import { useMemo, useState } from 'react';
import { message as antdMessage } from 'antd';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import { useViewport } from '@/utils/useViewport';
import { useLocation } from 'react-router-dom';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { ACTIVE_TAB_STORAGE_KEY, type MaterialPurchaseTabKey } from '../types';
import { usePurchaseList } from './usePurchaseList';
import { usePurchaseDetail } from './usePurchaseDetail';
import { usePurchaseDialog } from './usePurchaseDialog';
import { usePurchaseActions } from './usePurchaseActions';
import { useMaterialDatabase } from './useMaterialDatabase';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';

export function useMaterialPurchase() {
  const [messageApi, contextHolder] = antdMessage.useMessage();
  const message = messageApi;
  const location = useLocation();
  const { user } = useAuth();
  const { isMobile, modalWidth } = useViewport();
  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUser(user), [user]);

  // ── 共享状态：弹窗开关 / 当前行 / 模式 ──────────────────────────
  const [visible, setVisible] = useState(false);
  const [currentPurchase, setCurrentPurchase] = useState<MaterialPurchaseType | null>(null);
  const [dialogMode, setDialogMode] = useState<'view' | 'create' | 'preview'>('view');

  // 页签
  const [activeTabKey, setActiveTabKey] = useState<MaterialPurchaseTabKey>(() => {
    if (typeof window === 'undefined') return 'purchase';
    try {
      const cached = sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      if (cached === 'purchase' || cached === 'materialDatabase') return cached as MaterialPurchaseTabKey;
    } catch { /* ignore */ }
    return 'purchase';
  });

  // 智能 / 错误状态
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const showPurchaseAI = useMemo(() => isSmartFeatureEnabled('smart.material.purchase.ai.enabled'), []);

  // 批量领取 loading（传给 usePurchaseActions）
  const [batchSubmitLoading, setBatchSubmitLoading] = useState(false);

  const modalInitialHeight = useMemo(() => Math.round(window.innerHeight * 0.85), []);

  // ── 子 Hook 组合 ─────────────────────────────────────────────────
  const list = usePurchaseList({
    message,
    setSmartError,
    showSmartErrorNotice,
    activeTabKey,
    locationSearch: location.search,
    dialogVisible: visible,
  });

  const detail = usePurchaseDetail({ currentPurchase, visible, dialogMode });

  const dialog = usePurchaseDialog({
    message,
    queryParams: list.queryParams,
    fetchMaterialPurchaseList: list.fetchMaterialPurchaseList,
    ensureOrderUnlocked: list.ensureOrderUnlocked,
    currentPurchase,
    setCurrentPurchase,
    visible,
    setVisible,
    dialogMode,
    setDialogMode,
    detailOrder: detail.detailOrder,
    detailOrderLines: detail.detailOrderLines,
    detailPurchases: detail.detailPurchases,
    detailSizePairs: detail.detailSizePairs,
  });

  const actions = usePurchaseActions({
    message,
    messageApi,
    user,
    isSupervisorOrAbove,
    currentPurchase,
    fetchMaterialPurchaseList: list.fetchMaterialPurchaseList,
    loadDetailByOrderNo: detail.loadDetailByOrderNo,
    loadDetailByStyleNo: detail.loadDetailByStyleNo,
    ensureOrderUnlocked: list.ensureOrderUnlocked,
    detailPurchases: detail.detailPurchases,
    purchaseList: list.purchaseList,
    setSubmitLoading: setBatchSubmitLoading,
    visible,
    dialogMode,
  });

  const db = useMaterialDatabase({
    message,
    activeTabKey,
    setSmartError,
    showSmartErrorNotice,
  });

  // ── 派生 ─────────────────────────────────────────────────────────
  const detailFrozen = useMemo(() => {
    const rec = (detail.detailOrder ?? currentPurchase) as Record<string, unknown> | null;
    const orderNo = String(rec?.orderNo || '').trim();
    if (!orderNo || orderNo === '-') return false;
    return list.isOrderFrozenForRecord(rec);
  }, [detail.detailOrder, currentPurchase, list.isOrderFrozenForRecord]);
  const submitLoading = dialog.submitLoading || batchSubmitLoading;

  void setActiveTabKey; // suppress unused-variable warning (consumed via activeTabKey)

  return {
    contextHolder, message,
    user, isMobile, modalWidth, isSupervisorOrAbove,
    activeTabKey,
    purchaseList: list.purchaseList,
    loading: list.loading,
    total: list.total,
    queryParams: list.queryParams,
    setQueryParams: list.setQueryParams,
    sortField: list.sortField,
    sortOrder: list.sortOrder,
    handleSort: list.handleSort,
    purchaseSortField: list.purchaseSortField,
    purchaseSortOrder: list.purchaseSortOrder,
    handlePurchaseSort: list.handlePurchaseSort,
    sortedPurchaseList: list.sortedPurchaseList,
    purchaseStats: list.purchaseStats,
    activeStatFilter: list.activeStatFilter,
    handleStatClick: list.handleStatClick,
    overdueCount: list.overdueCount,
    smartError, showSmartErrorNotice, showPurchaseAI,
    fetchMaterialPurchaseList: list.fetchMaterialPurchaseList,
    isOrderFrozenForRecord: list.isOrderFrozenForRecord,
    handleExport: actions.handleExport,
    location,
    visible, dialogMode, currentPurchase,
    previewList: dialog.previewList,
    previewOrderId: dialog.previewOrderId,
    form: dialog.form,
    materialDatabaseForm: db.materialDatabaseForm,
    submitLoading, modalInitialHeight,
    detailOrder: detail.detailOrder,
    detailOrderLines: detail.detailOrderLines,
    detailPurchases: detail.detailPurchases,
    detailLoading: detail.detailLoading,
    detailSizePairs: detail.detailSizePairs,
    detailFrozen,
    smartReceiveOpen: actions.smartReceiveOpen,
    smartReceiveOrderNo: actions.smartReceiveOrderNo,
    setSmartReceiveOpen: actions.setSmartReceiveOpen,
    returnConfirmModal: actions.returnConfirmModal,
    returnConfirmForm: actions.returnConfirmForm,
    returnConfirmSubmitting: actions.returnConfirmSubmitting,
    returnEvidenceFiles: actions.returnEvidenceFiles,
    setReturnEvidenceFiles: actions.setReturnEvidenceFiles,
    returnEvidenceRecognizing: actions.returnEvidenceRecognizing,
    recognizeReturnEvidence: actions.recognizeReturnEvidence,
    returnResetModal: actions.returnResetModal,
    returnResetForm: actions.returnResetForm,
    returnResetSubmitting: actions.returnResetSubmitting,
    quickEditModal: actions.quickEditModal,
    quickEditSaving: actions.quickEditSaving,
    openDialog: dialog.openDialog,
    openDialogSafe: dialog.openDialogSafe,
    closeDialog: dialog.closeDialog,
    handleSubmit: dialog.handleSubmit,
    handleSavePreview: dialog.handleSavePreview,
    receivePurchaseTask: actions.receivePurchaseTask,
    confirmReturnPurchaseTask: actions.confirmReturnPurchaseTask,
    openReturnReset: actions.openReturnReset,
    submitReturnConfirm: actions.submitReturnConfirm,
    submitReturnReset: actions.submitReturnReset,
    handleReceiveAll: actions.handleReceiveAll,
    handleSmartReceiveSuccess: actions.handleSmartReceiveSuccess,
    handleBatchReturn: actions.handleBatchReturn,
    openPurchaseSheet: dialog.openPurchaseSheet,
    downloadPurchaseSheet: dialog.downloadPurchaseSheet,
    openQuickEditSafe: actions.openQuickEditSafe,
    handleQuickEditSave: actions.handleQuickEditSave,
    isSamplePurchaseView: actions.isSamplePurchaseView,
    normalizeStatus: actions.normalizeStatus,
    materialDatabaseList: db.materialDatabaseList,
    materialDatabaseLoading: db.materialDatabaseLoading,
    materialDatabaseTotal: db.materialDatabaseTotal,
    materialDatabaseQueryParams: db.materialDatabaseQueryParams,
    setMaterialDatabaseQueryParams: db.setMaterialDatabaseQueryParams,
    materialDatabaseImageFiles: db.materialDatabaseImageFiles,
    setMaterialDatabaseImageFiles: db.setMaterialDatabaseImageFiles,
    materialDatabaseModal: db.materialDatabaseModal,
    fetchMaterialDatabaseList: db.fetchMaterialDatabaseList,
    openMaterialDatabaseDialog: db.openMaterialDatabaseDialog,
  };
}
