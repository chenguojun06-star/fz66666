import React from 'react';
import { Input } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import QuickEditModal from '@/components/common/QuickEditModal';
import StylePrintModal from '@/components/common/StylePrintModal';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import SmallModal from '@/components/common/SmallModal';
import LabelPrintModal from './LabelPrintModal';
import SubProcessRemapModal from './SubProcessRemapModal';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import TransferOrderModal from '../TransferOrderModal';
import ProcessDetailModal from '@/components/production/ProcessDetailModal';
import NodeDetailModal from '@/components/common/NodeDetailModal';
import { ProductionOrder } from '@/types/production';
import { parseProductionOrderLines } from '@/utils/api';
import { safeString } from '../utils';

interface ProductionModalsProps {
  quickEditModal: {
    visible: boolean;
    data: ProductionOrder | null;
    close: () => void;
    open: (record: ProductionOrder) => void;
  };
  quickEditSaving: boolean;
  onQuickEditSave: (values: any, record: ProductionOrder | null, close: () => void) => void;
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
  fetchProductionList: () => void;
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
  transferType: string;
  setTransferType: (type: string) => void;
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
  saveRemap: () => void;
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
}) => (
  <>
    <QuickEditModal
      visible={quickEditModal.visible}
      loading={quickEditSaving}
      initialValues={{
        remarks: (quickEditModal.data as any)?.remarks,
        expectedShipDate: (quickEditModal.data as any)?.expectedShipDate,
        urgencyLevel: (quickEditModal.data as any)?.urgencyLevel || 'normal',
      }}
      onSave={(values) => onQuickEditSave(values, quickEditModal.data, quickEditModal.close)}
      onCancel={() => { quickEditModal.close(); }}
    />

    <SmallModal
      title={<><ExclamationCircleOutlined style={{ color: '#f59e0b', marginRight: 8 }} />备注异常</>}
      open={remarkPopoverId !== null}
      onCancel={() => { setRemarkPopoverId(null); setRemarkText(''); }}
      onOk={() => { if (remarkPopoverId) handleRemarkSave(remarkPopoverId); }}
      okText="保存"
      cancelText="取消"
      confirmLoading={remarkSaving}
    >
      <Input.TextArea
        id="productionRemark"
        value={remarkText}
        onChange={(e) => setRemarkText(e.target.value)}
        rows={6}
        maxLength={200}
        showCount
        placeholder="请输入异常备注..."
        style={{ marginTop: 8 }}
      />
    </SmallModal>

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

    <StylePrintModal
      visible={printModalVisible}
      onClose={() => { setPrintModalVisible(false); setPrintingRecord(null); }}
      styleId={printingRecord?.styleId}
      orderId={printingRecord?.id}
      orderNo={printingRecord?.orderNo}
      styleNo={printingRecord?.styleNo}
      styleName={printingRecord?.styleName}
      cover={printingRecord?.styleCover}
      color={printingRecord?.color}
      quantity={printingRecord?.orderQuantity}
      category={(printingRecord as any)?.category}
      mode="production"
      extraInfo={{
        '订单号': printingRecord?.orderNo,
        '订单数量': printingRecord?.orderQuantity,
        '加工厂': printingRecord?.factoryName,
        '跟单员': printingRecord?.merchandiser,
        '订单交期': printingRecord?.plannedEndDate,
      }}
      sizeDetails={printingRecord ? parseProductionOrderLines(printingRecord) : []}
    />

    <RejectReasonModal
      open={!!pendingCloseOrder}
      title={pendingCloseOrder?.isSpecial ? '特需关单确认' : `确认关单：${safeString((pendingCloseOrder?.order as any)?.orderNo)}`}
      description={pendingCloseOrder ? (
        <div>
          {pendingCloseOrder.isSpecial && (
            <div style={{ color: '#faad14', marginBottom: 8 }}>
              ⚠️ 该订单未满足关单条件（合格入库 {pendingCloseOrder.warehousingQualified}/{pendingCloseOrder.minRequired}），特需关单不可撤销，请填写原因。
            </div>
          )}
          <div>订单数量：{pendingCloseOrder.orderQty}</div>
          <div>关单阈值（裁剪数90%）：{pendingCloseOrder.minRequired}</div>
          <div>当前裁剪数：{pendingCloseOrder.cuttingQty}</div>
          <div>当前合格入库：{pendingCloseOrder.warehousingQualified}</div>
          <div style={{ marginTop: 8 }}>关单后订单状态将变为"已完成"，并自动生成对账记录。</div>
        </div>
      ) : null}
      fieldLabel={pendingCloseOrder?.isSpecial ? '特需原因' : '关闭原因'}
      placeholder={pendingCloseOrder?.isSpecial ? '请说明特需关单具体原因（必填）' : undefined}
      required={!!pendingCloseOrder?.isSpecial}
      okDanger={false}
      okText={pendingCloseOrder?.isSpecial ? '确认特需关单' : '确认关单'}
      loading={closeOrderLoading}
      onOk={confirmCloseOrder}
      onCancel={cancelCloseOrder}
    />
    <RejectReasonModal
      open={!!pendingScrapOrder}
      title={`确认报废：${safeString((pendingScrapOrder as any)?.orderNo)}`}
      fieldLabel="报废原因"
      required
      okDanger
      okText="确认报废"
      loading={scrapOrderLoading}
      onOk={confirmScrapOrder}
      onCancel={cancelScrapOrder}
    />
  </>
);

export default ProductionModals;
