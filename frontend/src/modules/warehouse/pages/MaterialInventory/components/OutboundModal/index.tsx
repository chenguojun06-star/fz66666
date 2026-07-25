import React from 'react';
import { Space, Button, Drawer } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import MaterialInfoCard from '../MaterialInfoCard';
import OutboundForm from './OutboundForm';
import BatchTable from './BatchTable';
import type { MaterialBatchDetail } from '../../hooks/useMaterialInventoryData';

interface OutboundModalProps {
  outboundModal: {
    visible: boolean;
    close: () => void;
    data: any;
  };
  outboundForm: any;
  handleOutboundConfirm: () => void;
  batchDetails: MaterialBatchDetail[];
  setBatchDetails: React.Dispatch<React.SetStateAction<MaterialBatchDetail[]>>;
  handleBatchQtyChange: (_index: number, _val: number | null) => void;
  selectedBatchNos: string[];
  handleBatchSelect: (keys: string[]) => void;
  handleAutoAllocateByFifo: (targetQty: number) => void;
  handleClearBatches: () => void;
  factoryOptions: any[];
  outboundOrderOptions: any[];
  handleOutboundOrderInput: (_value: string) => void;
  handleOutboundOrderSelect: (_value: string) => void;
  handleOutboundFactoryInput: (_value: string) => void;
  loadFactoryWorkers: (_factoryId: string) => void;
  loadReceivers: () => void;
  receiverOptions: any[];
  autoMatchOutboundContext: (_data: any, _context: any) => void;
  outboundSubmitting?: boolean;
}

const OutboundModal: React.FC<OutboundModalProps> = ({
  outboundModal,
  outboundForm,
  handleOutboundConfirm,
  batchDetails,
  setBatchDetails,
  handleBatchQtyChange,
  selectedBatchNos,
  handleBatchSelect,
  handleAutoAllocateByFifo,
  handleClearBatches,
  factoryOptions,
  outboundOrderOptions,
  handleOutboundOrderInput,
  handleOutboundOrderSelect,
  handleOutboundFactoryInput,
  loadFactoryWorkers,
  loadReceivers,
  receiverOptions,
  autoMatchOutboundContext,
  outboundSubmitting,
}) => {
  const handleClose = () => {
    outboundModal.close();
    setBatchDetails([]);
    outboundForm.resetFields();
  };

  return (
    <Drawer
      title={
        <Space>
          <ExportOutlined style={{ color: 'var(--color-primary)' }} />
          <span>物料出库 - 批次明细</span>
        </Space>
      }
      open={outboundModal.visible}
      onClose={handleClose}
      size="large"
      styles={{ wrapper: { width: '60vw' } }}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={handleClose}>取消</Button>
          <Button type="primary" loading={outboundSubmitting} onClick={handleOutboundConfirm} disabled={outboundSubmitting}>确认出库</Button>
        </Space>
      }
    >
      {outboundModal.data && (
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          <MaterialInfoCard
            materialCode={outboundModal.data.materialCode}
            materialName={outboundModal.data.materialName}
            materialType={outboundModal.data.materialType}
            color={outboundModal.data.color}
            unit={outboundModal.data.unit}
            supplierName={outboundModal.data.supplierName}
            specification={outboundModal.data.specification}
            fabricWidth={outboundModal.data.fabricWidth}
            fabricWeight={outboundModal.data.fabricWeight}
            fabricComposition={outboundModal.data.fabricComposition}
            unitPrice={outboundModal.data.unitPrice}
          />

          <OutboundForm
            outboundForm={outboundForm}
            factoryOptions={factoryOptions}
            outboundOrderOptions={outboundOrderOptions}
            handleOutboundOrderInput={handleOutboundOrderInput}
            handleOutboundOrderSelect={handleOutboundOrderSelect}
            handleOutboundFactoryInput={handleOutboundFactoryInput}
            loadFactoryWorkers={loadFactoryWorkers}
            loadReceivers={loadReceivers}
            receiverOptions={receiverOptions}
            autoMatchOutboundContext={autoMatchOutboundContext}
            warehouseLocation={outboundModal.data.warehouseLocation}
            modalData={outboundModal.data}
          />

          <BatchTable
            batchDetails={batchDetails}
            handleBatchQtyChange={handleBatchQtyChange}
            unit={outboundModal.data.unit}
            selectedBatchNos={selectedBatchNos}
            onSelectChange={handleBatchSelect}
            onAutoAllocate={handleAutoAllocateByFifo}
            onClear={handleClearBatches}
          />

          <div style={{
            background: 'var(--color-primary-bg-light, var(--status-processing-bg))',
            border: '1px solid var(--color-primary-border, var(--status-processing-border))',
            padding: '8px 12px',
            fontSize: "var(--font-size-sm)",
            color: 'var(--color-primary)'
          }}>
             请先勾选要出库的批次，再输入出库数量；或直接输入目标总量后点击"按FIFO分配"自动按入库日期从早到晚分配。
          </div>
        </Space>
      )}
    </Drawer>
  );
};

export default OutboundModal;
