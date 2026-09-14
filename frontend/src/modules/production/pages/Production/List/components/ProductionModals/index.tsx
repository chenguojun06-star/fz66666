import React from 'react';
import LabelPrintModal from '../LabelPrintModal';
import SubProcessRemapModal from '../SubProcessRemapModal';
import SyncProcessPriceModal from '@/modules/basic/pages/TemplateCenter/components/SyncProcessPriceModal';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import TransferOrderModal from '../../TransferOrderModal';
import ProcessDetailModal from '@/components/production/ProcessDetailModal';
import NodeDetailModal from '@/components/common/NodeDetailModal';
import { ProductionOrder } from '@/types/production';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import type { FormInstance } from 'antd/es/form';
import QuickEditModalSection from './QuickEditModalSection';
import OrderConfirmModals from './OrderConfirmModals';
import StylePrintModalSection from './StylePrintModalSection';
import RemarkExceptionModal from './RemarkExceptionModal';
import InspectDrawer from './InspectDrawer';

interface ProductionModalsProps {
  quickEditModal: {
    visible: boolean;
    data: ProductionOrder | null;
    close: () => void;
    open: (record: ProductionOrder) => void;
  };
  quickEditSaving: boolean;
  onQuickEditSave: (values: Record<string, unknown>, form: FormInstance, record: ProductionOrder | null, close: () => void) => Promise<void>;
  remarkPopoverId: string | null;
  setRemarkPopoverId: (id: string | null) => void;
  remarkText: string;
  setRemarkText: (text: string) => void;
  remarkSaving: boolean;
  handleRemarkSave: (id: string) => void;
  processDetailVisible: boolean;
  closeProcessDetail: () => void;
  processDetailRecord: ProductionOrder | null;
  processDetailType: string;
  procurementStatus: any;
  processStatus: any;
  fetchProductionList: () => Promise<void>;
  nodeDetailVisible: boolean;
  closeNodeDetail: () => void;
  nodeDetailOrder: ProductionOrder | null;
  nodeDetailType: string;
  nodeDetailName: string;
  nodeDetailStats: any;
  nodeDetailUnitPrice: number;
  nodeDetailProcessList: any[];
  transferModalVisible: boolean;
  transferRecord: ProductionOrder | null;
  transferType: 'user' | 'factory';
  setTransferType: React.Dispatch<React.SetStateAction<'user' | 'factory'>>;
  transferUserId: string;
  setTransferUserId: (id: string) => void;
  transferMessage: string;
  setTransferMessage: (msg: string) => void;
  transferUsers: any[];
  transferSearching: boolean;
  transferFactoryId: string;
  setTransferFactoryId: (id: string) => void;
  transferFactoryMessage: string;
  setTransferFactoryMessage: (msg: string) => void;
  transferFactories: any[];
  transferFactorySearching: boolean;
  transferSubmitting: boolean;
  transferBundles: any[];
  transferBundlesLoading: boolean;
  transferSelectedBundleIds: string[];
  setTransferSelectedBundleIds: (ids: string[]) => void;
  transferProcesses: any[];
  transferProcessesLoading: boolean;
  transferSelectedProcessCodes: string[];
  setTransferSelectedProcessCodes: (codes: string[]) => void;
  searchTransferUsers: (keyword: string) => void;
  searchTransferFactories: (keyword: string) => void;
  submitTransfer: () => void;
  closeTransferModal: () => void;
  shareOrderDialog: React.ReactNode;
  remarkTarget: { open: boolean; orderNo: string; defaultRole?: string; merchandiser?: string };
  setRemarkTarget: (target: { open: boolean; orderNo: string; defaultRole?: string; merchandiser?: string }) => void;
  isSupervisorOrAbove: boolean;
  isFactoryAccount: boolean;
  user: any;
  labelPrintOpen: boolean;
  closeLabelPrint: () => void;
  labelPrintOrder: ProductionOrder | null;
  labelPrintStyle: any;
  remapVisible: boolean;
  remapRecord: ProductionOrder | null;
  remapParentNodes: any[];
  remapConfig: any;
  remapSaving: boolean;
  saveRemap: (config: any) => Promise<void>;
  closeRemap: () => void;
  printModalVisible: boolean;
  setPrintModalVisible: (visible: boolean) => void;
  printingRecord: ProductionOrder | null;
  setPrintingRecord: (record: ProductionOrder | null) => void;
  pendingCloseOrder: any;
  closeOrderLoading: boolean;
  confirmCloseOrder: (reason: string) => void;
  cancelCloseOrder: () => void;
  pendingScrapOrder: any;
  scrapOrderLoading: boolean;
  confirmScrapOrder: (reason: string) => void;
  cancelScrapOrder: () => void;
  workflowEditorVisible: boolean;
  workflowEditorStyleNo?: string;
  closeWorkflowEditor: () => void;
  onWorkflowSaved: () => void;
  onOpenInspectDrawer?: (orderId: string) => void;
  inspectDrawerVisible: boolean;
  inspectDrawerOrderId: string;
  closeInspectDrawer: () => void;
  customFields: FieldConfigItem[];
  fieldConfigs: FieldConfigItem[];
}

const ProductionModals: React.FC<ProductionModalsProps> = ({
  quickEditModal,
  quickEditSaving,
  onQuickEditSave,
  remarkPopoverId,
  setRemarkPopoverId,
  remarkText,
  setRemarkText,
  remarkSaving,
  handleRemarkSave,
  processDetailVisible,
  closeProcessDetail,
  processDetailRecord,
  processDetailType,
  procurementStatus,
  processStatus,
  fetchProductionList,
  nodeDetailVisible,
  closeNodeDetail,
  nodeDetailOrder,
  nodeDetailType,
  nodeDetailName,
  nodeDetailStats,
  nodeDetailUnitPrice,
  nodeDetailProcessList,
  transferModalVisible,
  transferRecord,
  transferType,
  setTransferType,
  transferUserId,
  setTransferUserId,
  transferMessage,
  setTransferMessage,
  transferUsers,
  transferSearching,
  transferFactoryId,
  setTransferFactoryId,
  transferFactoryMessage,
  setTransferFactoryMessage,
  transferFactories,
  transferFactorySearching,
  transferSubmitting,
  transferBundles,
  transferBundlesLoading,
  transferSelectedBundleIds,
  setTransferSelectedBundleIds,
  transferProcesses,
  transferProcessesLoading,
  transferSelectedProcessCodes,
  setTransferSelectedProcessCodes,
  searchTransferUsers,
  searchTransferFactories,
  submitTransfer,
  closeTransferModal,
  shareOrderDialog,
  remarkTarget,
  setRemarkTarget,
  isSupervisorOrAbove,
  isFactoryAccount,
  user,
  labelPrintOpen,
  closeLabelPrint,
  labelPrintOrder,
  labelPrintStyle,
  remapVisible,
  remapRecord,
  remapParentNodes,
  remapConfig,
  remapSaving,
  saveRemap,
  closeRemap,
  printModalVisible,
  setPrintModalVisible,
  printingRecord,
  setPrintingRecord,
  pendingCloseOrder,
  closeOrderLoading,
  confirmCloseOrder,
  cancelCloseOrder,
  pendingScrapOrder,
  scrapOrderLoading,
  confirmScrapOrder,
  cancelScrapOrder,
  workflowEditorVisible,
  workflowEditorStyleNo,
  closeWorkflowEditor,
  onWorkflowSaved,
  onOpenInspectDrawer,
  inspectDrawerVisible,
  inspectDrawerOrderId,
  closeInspectDrawer,
  customFields,
  fieldConfigs: _fieldConfigs,
}) => {
  return (
  <>
    <QuickEditModalSection
      quickEditModal={quickEditModal}
      quickEditSaving={quickEditSaving}
      onQuickEditSave={onQuickEditSave}
      customFields={customFields}
    />

    <RemarkExceptionModal
      visible={remarkPopoverId !== null}
      remarkText={remarkText}
      setRemarkText={setRemarkText}
      remarkSaving={remarkSaving}
      onCancel={() => { setRemarkPopoverId(null); setRemarkText(''); }}
      onOk={() => { if (remarkPopoverId) handleRemarkSave(remarkPopoverId); }}
    />

    <ProcessDetailModal
      visible={processDetailVisible}
      onClose={closeProcessDetail}
      record={processDetailRecord}
      processType={processDetailType}
      procurementStatus={procurementStatus}
      processStatus={processStatus}
      onDataChanged={() => { void fetchProductionList(); }}
    />

    <NodeDetailModal
      visible={nodeDetailVisible}
      onClose={closeNodeDetail}
      orderId={nodeDetailOrder?.id}
      orderNo={nodeDetailOrder?.orderNo}
      styleNo={nodeDetailOrder?.styleNo}
      nodeType={nodeDetailType}
      nodeName={nodeDetailName}
      stats={nodeDetailStats}
      unitPrice={nodeDetailUnitPrice}
      processList={nodeDetailProcessList}
      onSaved={() => { void fetchProductionList(); }}
      onOpenInspectDrawer={onOpenInspectDrawer}
      factoryType={nodeDetailOrder?.factoryType}
    />

    <InspectDrawer
      visible={inspectDrawerVisible}
      orderId={inspectDrawerOrderId}
      onClose={closeInspectDrawer}
    />

    <TransferOrderModal
      transferModalVisible={transferModalVisible}
      transferRecord={transferRecord}
      transferType={transferType}
      setTransferType={setTransferType}
      transferUserId={transferUserId}
      setTransferUserId={setTransferUserId}
      transferMessage={transferMessage}
      setTransferMessage={setTransferMessage}
      transferUsers={transferUsers}
      transferSearching={transferSearching}
      transferFactoryId={transferFactoryId}
      setTransferFactoryId={setTransferFactoryId}
      transferFactoryMessage={transferFactoryMessage}
      setTransferFactoryMessage={setTransferFactoryMessage}
      transferFactories={transferFactories}
      transferFactorySearching={transferFactorySearching}
      transferSubmitting={transferSubmitting}
      transferBundles={transferBundles}
      transferBundlesLoading={transferBundlesLoading}
      transferSelectedBundleIds={transferSelectedBundleIds}
      setTransferSelectedBundleIds={setTransferSelectedBundleIds}
      transferProcesses={transferProcesses}
      transferProcessesLoading={transferProcessesLoading}
      transferSelectedProcessCodes={transferSelectedProcessCodes}
      setTransferSelectedProcessCodes={setTransferSelectedProcessCodes}
      searchTransferUsers={searchTransferUsers}
      searchTransferFactories={searchTransferFactories}
      submitTransfer={submitTransfer}
      closeTransferModal={closeTransferModal}
    />

    {shareOrderDialog}

    <RemarkTimelineModal
      open={remarkTarget.open}
      onClose={() => setRemarkTarget({ open: false, orderNo: '' })}
      targetType="order"
      targetNo={remarkTarget.orderNo}
      defaultRole={remarkTarget.defaultRole}
      canAddRemark={isSupervisorOrAbove || isFactoryAccount || (!!user?.username && user.username === remarkTarget.merchandiser)}
    />

    <LabelPrintModal
      open={labelPrintOpen}
      onClose={closeLabelPrint}
      order={labelPrintOrder}
      styleInfo={labelPrintStyle}
    />

    <SubProcessRemapModal
      visible={remapVisible}
      record={remapRecord}
      parentNodes={remapParentNodes}
      config={remapConfig}
      saving={remapSaving}
      onSave={saveRemap}
      onClose={closeRemap}
      isFactoryAccount={isFactoryAccount}
    />

    <SyncProcessPriceModal
      open={workflowEditorVisible}
      onCancel={closeWorkflowEditor}
      onSynced={onWorkflowSaved}
      styleNo={workflowEditorStyleNo}
    />

    <StylePrintModalSection
      printModalVisible={printModalVisible}
      setPrintModalVisible={setPrintModalVisible}
      printingRecord={printingRecord}
      setPrintingRecord={setPrintingRecord}
    />

    <OrderConfirmModals
      pendingCloseOrder={pendingCloseOrder}
      closeOrderLoading={closeOrderLoading}
      confirmCloseOrder={confirmCloseOrder}
      cancelCloseOrder={cancelCloseOrder}
      pendingScrapOrder={pendingScrapOrder}
      scrapOrderLoading={scrapOrderLoading}
      confirmScrapOrder={confirmScrapOrder}
      cancelScrapOrder={cancelScrapOrder}
    />
  </>
  );
};
export default ProductionModals;
