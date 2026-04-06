import React from 'react';
import { Input } from 'antd';
import type { FormInstance } from 'antd';
import type { ProductionOrder } from '@/types/production';
import { parseProductionOrderLines } from '@/utils/api';
import type { ShippableInfo } from '@/services/production/factoryShipmentApi';
import type { LabelPrintStyleInfo } from '../hooks/useLabelPrint';
import ScanConfirmModal from './ScanConfirmModal';
import FactoryShipModal from './FactoryShipModal';
import QuickEditModal from '@/components/common/QuickEditModal';
import LabelPrintModal from '../../List/components/LabelPrintModal';
import StylePrintModal from '@/components/common/StylePrintModal';
import NodeDetailModal from '@/components/common/NodeDetailModal';
import RejectReasonModal from '@/components/common/RejectReasonModal';

export interface ProgressModalsProps {
  /* ScanConfirm */
  scanConfirmState: { visible: boolean; loading: boolean; remain: number; detail: any };
  closeScanConfirm: () => void;
  submitConfirmedScan: () => void;
  /* FactoryShip */
  shipModalOpen: boolean;
  shipModalOrder: ProductionOrder | null;
  shippableInfo: ShippableInfo | null;
  shipForm: FormInstance;
  shipLoading: boolean;
  handleShipSubmit: () => void;
  setShipModalOpen: (open: boolean) => void;
  /* Share dialog (ReactNode from useShareOrderDialog) */
  shareOrderDialog: React.ReactNode;

  /* QuickEdit */
  quickEditVisible: boolean;
  quickEditSaving: boolean;
  quickEditRecord: ProductionOrder | null;
  handleQuickEditSave: (values: { remarks: string; expectedShipDate: string | null; urgencyLevel: string }) => Promise<void>;
  setQuickEditVisible: (visible: boolean) => void;
  setQuickEditRecord: (record: ProductionOrder | null) => void;
  /* LabelPrint */
  labelPrintOpen: boolean;
  closeLabelPrint: () => void;
  labelPrintOrder: ProductionOrder | null;
  labelPrintStyle: LabelPrintStyleInfo | null;
  /* StylePrint */
  printModalVisible: boolean;
  closePrintModal: () => void;
  printingRecord: ProductionOrder | null;
  /* NodeDetail */
  nodeDetailVisible: boolean;
  closeNodeDetail: () => void;
  nodeDetailOrder: ProductionOrder | null;
  nodeDetailType: string;
  nodeDetailName: string;
  nodeDetailStats?: { done: number; total: number; percent: number; remaining: number };
  nodeDetailUnitPrice?: number;
  nodeDetailProcessList: Array<{ id?: string; processCode?: string; code?: string; name: string; unitPrice?: number }>;
  fetchOrders: () => void;
  /* CloseOrder / Reject */
  pendingCloseOrder: {
    order: ProductionOrder;
    orderId: string;
    orderNo: string;
    orderQty: number;
    cuttingQty: number;
    minRequired: number;
    warehousingQualified: number;
  } | null;
  closeOrderLoading: boolean;
  confirmCloseOrder: (reason?: string) => void;
  cancelCloseOrder: () => void;
}

const ProgressModals: React.FC<ProgressModalsProps> = (props) => {
  const {
    scanConfirmState, closeScanConfirm, submitConfirmedScan,
    shipModalOpen, shipModalOrder, shippableInfo, shipForm, shipLoading, handleShipSubmit, setShipModalOpen,
    shareOrderDialog,

    quickEditVisible, quickEditSaving, quickEditRecord, handleQuickEditSave, setQuickEditVisible, setQuickEditRecord,
    labelPrintOpen, closeLabelPrint, labelPrintOrder, labelPrintStyle,
    printModalVisible, closePrintModal, printingRecord,
    nodeDetailVisible, closeNodeDetail, nodeDetailOrder, nodeDetailType, nodeDetailName,
    nodeDetailStats, nodeDetailUnitPrice, nodeDetailProcessList, fetchOrders,
    pendingCloseOrder, closeOrderLoading, confirmCloseOrder, cancelCloseOrder,
  } = props;

  return (
    <>
      <ScanConfirmModal
        open={scanConfirmState.visible}
        loading={scanConfirmState.loading}
        remain={scanConfirmState.remain}
        detail={scanConfirmState.detail}
        onCancel={() => closeScanConfirm()}
        onSubmit={submitConfirmedScan}
      />

      <FactoryShipModal
        open={shipModalOpen}
        orderNo={shipModalOrder?.orderNo}
        shippableInfo={shippableInfo}
        form={shipForm}
        loading={shipLoading}
        onSubmit={handleShipSubmit}
        onCancel={() => setShipModalOpen(false)}
      />

      {shareOrderDialog}



      <QuickEditModal
        visible={quickEditVisible}
        loading={quickEditSaving}
        initialValues={{
          remarks: quickEditRecord?.remarks as string,
          expectedShipDate: quickEditRecord?.expectedShipDate as string,
        }}
        onSave={handleQuickEditSave}
        onCancel={() => {
          setQuickEditVisible(false);
          setQuickEditRecord(null);
        }}
      />

      <LabelPrintModal
        open={labelPrintOpen}
        onClose={closeLabelPrint}
        order={labelPrintOrder}
        styleInfo={labelPrintStyle}
      />

      <StylePrintModal
        visible={printModalVisible}
        onClose={closePrintModal}
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

      <NodeDetailModal
        visible={nodeDetailVisible}
        onClose={closeNodeDetail}
        orderId={nodeDetailOrder?.id}
        orderNo={nodeDetailOrder?.orderNo}
        nodeType={nodeDetailType}
        nodeName={nodeDetailName}
        stats={nodeDetailStats}
        unitPrice={nodeDetailUnitPrice}
        processList={nodeDetailProcessList}
        onSaved={() => { void fetchOrders(); }}
      />

      <RejectReasonModal
        open={pendingCloseOrder !== null}
        title={`确认关单：${pendingCloseOrder?.orderNo || ''}`}
        description={pendingCloseOrder ? (
          <div>
            <div>订单数量：{pendingCloseOrder.orderQty}</div>
            <div>关单阈值（裁剪数90%）：{pendingCloseOrder.minRequired}</div>
            <div>当前裁剪数：{pendingCloseOrder.cuttingQty}</div>
            <div>当前合格入库：{pendingCloseOrder.warehousingQualified}</div>
            <div style={{ marginTop: 8 }}>关单后订单状态将变为"已完成"，并自动生成对账记录。</div>
          </div>
        ) : undefined}
        fieldLabel="关闭原因（可选，将记录到操作日志）"
        required={false}
        okDanger={false}
        okText="确认关单"
        loading={closeOrderLoading}
        onOk={confirmCloseOrder}
        onCancel={cancelCloseOrder}
      />
    </>
  );
};

export default ProgressModals;
