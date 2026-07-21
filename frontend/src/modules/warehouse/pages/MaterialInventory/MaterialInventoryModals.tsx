import React from 'react';
import MaterialOutboundPrintModal from './components/MaterialOutboundPrintModal';
import OutboundModal from './components/OutboundModal';
import InboundOutboundRecordDrawer from '@/components/common/InboundOutboundRecordDrawer';
import InstructionModal from './components/InstructionModal';
import SafetyStockModal from './components/SafetyStockModal';
import InboundDrawer from './components/InboundDrawer';
import RollLabelModal from './components/RollLabelModal';

import type { useMaterialInventoryData } from './hooks/useMaterialInventoryData';

interface MaterialInventoryModalsProps {
  inventoryData: ReturnType<typeof useMaterialInventoryData>;
}

const MaterialInventoryModals: React.FC<MaterialInventoryModalsProps> = ({
  inventoryData,
}) => {
  const {
    user,
    instructionVisible,
    closeInstruction,
    handleSendInstruction,
    instructionSubmitting,
    instructionForm,
    instructionTarget,
    dbSearchLoading,
    dbMaterialOptions,
    handleMaterialSelect,
    searchMaterialFromDatabase,
    receiverOptions,
    safetyStockVisible,
    setSafetyStockVisible,
    safetyStockSubmitting,
    handleSafetyStockSave,
    safetyStockTarget,
    safetyStockValue,
    setSafetyStockValue,
    detailModal,
    txLoading,
    txList,
    inboundModal,
    inboundForm,
    inboundSubmitting,
    handleInboundConfirm,
    outboundModal,
    outboundForm,
    outboundSubmitting,
    handleOutboundConfirm,
    batchDetails,
    setBatchDetails,
    handleBatchQtyChange,
    factoryOptions,
    outboundOrderOptions,
    handleOutboundOrderInput,
    handleOutboundOrderSelect,
    handleOutboundFactoryInput,
    loadFactoryWorkers,
    loadReceivers,
    autoMatchOutboundContext,
    rollModal,
    rollForm,
    generatingRolls,
    handleGenerateRollLabels,
    printModal,
  } = inventoryData;

  return (
    <>
      {/* 下发采购指令弹窗 */}
      <InstructionModal
        instructionVisible={instructionVisible}
        closeInstruction={closeInstruction}
        handleSendInstruction={handleSendInstruction}
        instructionSubmitting={instructionSubmitting}
        instructionForm={instructionForm}
        instructionTarget={instructionTarget}
        dbSearchLoading={dbSearchLoading}
        dbMaterialOptions={dbMaterialOptions}
        handleMaterialSelect={handleMaterialSelect}
        searchMaterialFromDatabase={searchMaterialFromDatabase}
        receiverOptions={receiverOptions}
      />

      {/* 安全库存编辑弹窗 */}
      <SafetyStockModal
        safetyStockVisible={safetyStockVisible}
        setSafetyStockVisible={setSafetyStockVisible}
        safetyStockSubmitting={safetyStockSubmitting}
        handleSafetyStockSave={handleSafetyStockSave}
        safetyStockTarget={safetyStockTarget}
        safetyStockValue={safetyStockValue}
        setSafetyStockValue={setSafetyStockValue}
      />

      {/* 详情模态框 - 出入库记录 */}
      <InboundOutboundRecordDrawer
        open={detailModal.visible}
        onClose={detailModal.close}
        materialData={detailModal.data}
        records={txList}
        loading={txLoading}
        user={user}
      />

      {/* 入库模态框 */}
      <InboundDrawer
        inboundModal={inboundModal}
        inboundForm={inboundForm}
        inboundSubmitting={inboundSubmitting}
        handleInboundConfirm={handleInboundConfirm}
      />

      {/* 出库模态框 */}
      <OutboundModal
        outboundModal={outboundModal}
        outboundForm={outboundForm}
        handleOutboundConfirm={handleOutboundConfirm}
        batchDetails={batchDetails}
        setBatchDetails={setBatchDetails}
        handleBatchQtyChange={handleBatchQtyChange}
        factoryOptions={factoryOptions}
        outboundOrderOptions={outboundOrderOptions}
        handleOutboundOrderInput={handleOutboundOrderInput}
        handleOutboundOrderSelect={handleOutboundOrderSelect}
        handleOutboundFactoryInput={handleOutboundFactoryInput}
        loadFactoryWorkers={loadFactoryWorkers}
        loadReceivers={loadReceivers}
        receiverOptions={receiverOptions}
        autoMatchOutboundContext={autoMatchOutboundContext}
        outboundSubmitting={outboundSubmitting}
      />

      {/* 料卷/箱标签生成弹窗 */}
      <RollLabelModal
        rollModal={rollModal}
        rollForm={rollForm}
        generatingRolls={generatingRolls}
        handleGenerateRollLabels={handleGenerateRollLabels}
      />

      <MaterialOutboundPrintModal
        open={printModal.visible}
        data={printModal.data}
        onClose={() => printModal.close()}
      />
    </>
  );
};

export default MaterialInventoryModals;
