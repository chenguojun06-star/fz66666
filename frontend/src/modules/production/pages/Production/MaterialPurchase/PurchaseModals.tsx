import React from 'react';
import type { FormInstance } from 'antd';
import { PurchaseCartDrawer } from '@/components/common/PurchaseCartDrawer';
import QuickEditModal from '@/components/common/QuickEditModal';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import PurchaseModal from './components/PurchaseModal';
import MaterialQualityIssueModal from './components/MaterialQualityIssueModal';
import OrderPickerModal from './components/OrderPickerModal';
import WarehousePickModal from './components/WarehousePickModal';
import ReturnConfirmModal from './components/ReturnConfirmModal';
import ReturnResetModal from './components/ReturnResetModal';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import type { ProductionOrder } from '@/types/production';

interface QuickEditModalState {
  visible: boolean;
  data: MaterialPurchaseType | null;
  close: () => void;
}

interface ReturnConfirmModalState {
  visible: boolean;
  data: any[] | null;
  close: () => void;
}

interface ReturnResetModalState {
  visible: boolean;
  data: MaterialPurchaseType | null;
  close: () => void;
}

interface PurchaseModalsProps {
  cartDrawerOpen: boolean;
  setCartDrawerOpen: (open: boolean) => void;
  fetchMaterialPurchaseList: () => void;
  reloadCurrentDetail: () => void;

  orderPickerOpen: boolean;
  isMobile: boolean;
  setOrderPickerOpen: (open: boolean) => void;
  handlePickOrder: (order: any) => void;

  visible: boolean;
  dialogMode: 'view' | 'create' | 'preview';
  closeDialog: () => void;
  submitLoading: boolean;
  currentPurchase: MaterialPurchaseType | null;
  detailOrder: ProductionOrder | null;
  detailOrderLines: Array<{ color: string; size: string; quantity: number }>;
  detailPurchases: MaterialPurchaseType[];
  detailLoading: boolean;
  detailSizePairs: Array<{ size: string; quantity: number }>;
  detailFrozen: boolean;
  previewList: MaterialPurchaseType[];
  previewOrderId: string;
  isSupervisorOrAbove: boolean;
  form: FormInstance;
  user: any;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  handleSort: (field: string, order: 'asc' | 'desc') => void;
  receivePurchaseTask: (record: MaterialPurchaseType) => void;
  confirmReturnPurchaseTask: (record: MaterialPurchaseType) => void;
  openReturnReset: (record: MaterialPurchaseType) => void;
  handleQualityIssue: (record: MaterialPurchaseType) => void;
  handleReceiveAll: () => void;
  handleBatchReturn: () => void;
  confirmComplete: () => void;
  confirmCompleteSubmitting: boolean;
  isSamplePurchaseView: boolean;
  openPurchaseSheet: (autoPrint: boolean) => void;
  downloadPurchaseSheet: () => void;
  handleSubmit: () => void;
  handleSavePreview: () => void;
  isOrderFrozenForRecord: (record?: Record<string, unknown> | null) => boolean;
  handleWarehousePickFromDetail: (record: MaterialPurchaseType, pickQty: number) => void;
  handleRefreshAll: () => void;

  warehousePickModalOpen: boolean;
  warehousePickTarget: MaterialPurchaseType | null;
  warehousePickQty: number;
  setWarehousePickModalOpen: (open: boolean) => void;

  qualityIssueOpen: boolean;
  qualityIssuePurchase: MaterialPurchaseType | null;
  setQualityIssueOpen: (open: boolean) => void;
  setQualityIssuePurchase: (purchase: MaterialPurchaseType | null) => void;

  returnConfirmModal: ReturnConfirmModalState;
  returnConfirmForm: FormInstance;
  returnEvidenceFiles: any[];
  setReturnEvidenceFiles: (updater: (prev: any[]) => any[]) => void;
  returnEvidenceRecognizing: boolean;
  recognizeReturnEvidence: (file: File, orderNo?: string) => Promise<Record<string, number>>;
  returnConfirmSubmitting: boolean;
  submitReturnConfirm: () => void;

  returnResetModal: ReturnResetModalState;
  returnResetForm: FormInstance;
  returnResetSubmitting: boolean;
  submitReturnReset: () => void;

  quickEditModal: QuickEditModalState;
  quickEditSaving: boolean;
  handleQuickEditSave: (values: Record<string, unknown>, form: FormInstance) => Promise<void>;

  remarkOpen: boolean;
  setRemarkOpen: (open: boolean) => void;
  remarkOrderNo: string;
}

const PurchaseModals: React.FC<PurchaseModalsProps> = (props) => {
  const {
    cartDrawerOpen, setCartDrawerOpen,
    fetchMaterialPurchaseList, reloadCurrentDetail,
    orderPickerOpen, isMobile, setOrderPickerOpen, handlePickOrder,
    visible, dialogMode, closeDialog, submitLoading,
    currentPurchase, detailOrder, detailOrderLines, detailPurchases,
    detailLoading, detailSizePairs, detailFrozen,
    previewList, previewOrderId,
    isSupervisorOrAbove, form, user,
    sortField, sortOrder, handleSort,
    receivePurchaseTask, confirmReturnPurchaseTask, openReturnReset,
    handleQualityIssue, handleReceiveAll, handleBatchReturn,
    confirmComplete, confirmCompleteSubmitting, isSamplePurchaseView,
    openPurchaseSheet, downloadPurchaseSheet, handleSubmit, handleSavePreview,
    isOrderFrozenForRecord, handleWarehousePickFromDetail, handleRefreshAll,
    warehousePickModalOpen, warehousePickTarget, warehousePickQty, setWarehousePickModalOpen,
    qualityIssueOpen, qualityIssuePurchase, setQualityIssueOpen, setQualityIssuePurchase,
    returnConfirmModal, returnConfirmForm,
    returnEvidenceFiles, setReturnEvidenceFiles,
    returnEvidenceRecognizing, recognizeReturnEvidence,
    returnConfirmSubmitting, submitReturnConfirm,
    returnResetModal, returnResetForm, returnResetSubmitting, submitReturnReset,
    quickEditModal, quickEditSaving, handleQuickEditSave,
    remarkOpen, setRemarkOpen, remarkOrderNo,
  } = props;

  return (
    <>
      <PurchaseCartDrawer
        open={cartDrawerOpen}
        onClose={() => setCartDrawerOpen(false)}
        onConfirmSuccess={() => {
          fetchMaterialPurchaseList();
          reloadCurrentDetail();
        }}
      />

      <OrderPickerModal
        open={orderPickerOpen}
        isMobile={isMobile}
        onClose={() => setOrderPickerOpen(false)}
        onPickOrder={handlePickOrder}
      />

      <PurchaseModal
        visible={visible}
        dialogMode={dialogMode}
        onCancel={closeDialog}
        isMobile={isMobile}
        submitLoading={submitLoading}
        currentPurchase={currentPurchase}
        detailOrder={detailOrder}
        detailOrderLines={detailOrderLines}
        detailPurchases={detailPurchases}
        detailLoading={detailLoading}
        detailSizePairs={detailSizePairs}
        detailFrozen={detailFrozen}
        previewList={previewList}
        previewOrderId={previewOrderId}
        isSupervisorOrAbove={isSupervisorOrAbove}
        form={form}
        user={user}
        sortField={sortField}
        sortOrder={sortOrder}
        onSort={handleSort}
        onReceive={receivePurchaseTask}
        onConfirmReturn={confirmReturnPurchaseTask}
        onReturnReset={openReturnReset}
        onQualityIssue={handleQualityIssue}
        onReceiveAll={handleReceiveAll}
        onBatchReturn={handleBatchReturn}
        onConfirmComplete={confirmComplete}
        confirmCompleteSubmitting={confirmCompleteSubmitting}
        isSamplePurchase={isSamplePurchaseView}
        onGeneratePurchaseSheet={openPurchaseSheet}
        onDownloadPurchaseSheet={downloadPurchaseSheet}
        onSaveCreate={handleSubmit}
        onSavePreview={handleSavePreview}
        isOrderFrozenForRecord={isOrderFrozenForRecord}
        onWarehousePick={handleWarehousePickFromDetail}
        onRefresh={handleRefreshAll}
      />

      <WarehousePickModal
        open={warehousePickModalOpen}
        target={warehousePickTarget}
        pickQty={warehousePickQty}
        isMobile={isMobile}
        user={user}
        onClose={() => setWarehousePickModalOpen(false)}
        onSuccess={() => {
          setWarehousePickModalOpen(false);
          fetchMaterialPurchaseList();
          reloadCurrentDetail();
        }}
      />

      <MaterialQualityIssueModal
        open={qualityIssueOpen}
        purchase={qualityIssuePurchase}
        onChanged={handleRefreshAll}
        onClose={() => {
          setQualityIssueOpen(false);
          setQualityIssuePurchase(null);
        }}
      />

      <ReturnConfirmModal
        open={returnConfirmModal.visible}
        data={returnConfirmModal.data}
        isMobile={isMobile}
        user={user}
        returnConfirmForm={returnConfirmForm}
        returnEvidenceFiles={returnEvidenceFiles}
        setReturnEvidenceFiles={setReturnEvidenceFiles}
        returnEvidenceRecognizing={returnEvidenceRecognizing}
        recognizeReturnEvidence={recognizeReturnEvidence}
        returnConfirmSubmitting={returnConfirmSubmitting}
        submitReturnConfirm={submitReturnConfirm}
        onCancel={() => {
          returnConfirmModal.close();
          returnConfirmForm.resetFields();
        }}
      />

      <ReturnResetModal
        open={returnResetModal.visible}
        isMobile={isMobile}
        returnResetForm={returnResetForm}
        returnResetSubmitting={returnResetSubmitting}
        submitReturnReset={submitReturnReset}
        onCancel={() => {
          returnResetModal.close();
          returnResetForm.resetFields();
        }}
      />

      <QuickEditModal
        visible={quickEditModal.visible}
        loading={quickEditSaving}
        initialValues={{
          remark: quickEditModal.data?.remark,
          expectedShipDate: quickEditModal.data?.expectedShipDate,
        }}
        onSave={handleQuickEditSave}
        onCancel={() => {
          quickEditModal.close();
        }}
      />

      <RemarkTimelineModal
        open={remarkOpen}
        onClose={() => setRemarkOpen(false)}
        targetType="order"
        targetNo={remarkOrderNo}
        canAddRemark={true}
      />
    </>
  );
};

export default PurchaseModals;
