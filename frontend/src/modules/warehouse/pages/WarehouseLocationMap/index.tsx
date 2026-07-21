// 仓库仓位管理主组件 - 组合 Hook + 子组件
import React from 'react';
import { Empty } from 'antd';
import { useWarehouseLocationData } from './useWarehouseLocationData';
import WarehouseSidebar from './WarehouseSidebar';
import WarehouseStats from './WarehouseStats';
import WarehouseZoneTabs from './WarehouseZoneTabs';
import WarehouseLocationGrid from './WarehouseLocationGrid';
import FormModals from './FormModals';
import LocationDetailDrawer from './LocationDetailDrawer';
import TransferDrawer from './TransferDrawer';
import InboundDrawer from './InboundDrawer';
import OutboundDrawer from './OutboundDrawer';
import LocationLabelPrintModal from './LocationLabelPrintModal';
import './WarehouseLocationMap.css';

const WarehouseLocationMap: React.FC = () => {
  const data = useWarehouseLocationData();
  const {
    // 数据状态
    areas,
    areasLoading,
    selectedAreaId,
    selectedZoneName,
    locations,
    locationsLoading,
    selectedLocation,
    locationItems,
    locationItemsLoading,
    detailModalOpen,
    selectMode,
    selectedLocationIds,
    printModalOpen,
    transferModalOpen,
    transferTargetLocation,
    transferLoading,
    inboundModalOpen,
    inboundForm,
    inboundLoading,
    outboundModalOpen,
    outboundLoading,
    outboundItems,
    outboundCustomerName,
    outboundCustomerPhone,
    outboundShippingAddress,
    outstockType,
    outboundRemark,
    createAreaModalOpen,
    createAreaForm,
    createLocationModalOpen,
    createLocationForm,
    batchInitModalOpen,
    batchInitForm,
    // 派生数据
    selectedArea,
    zones,
    filteredLocations,
    areaOverview,
    overviewLoading,
    // 仓库区域操作
    setSelectedAreaId,
    setSelectedZoneName,
    handleToggleArea,
    confirmDeleteArea,
    confirmDeleteLocation,
    // 库位操作
    handleLocationClick,
    handleCreateArea,
    handleCreateLocation,
    handleBatchInit,
    handleTransfer,
    // 入库
    handleOpenInbound,
    handleDoInbound,
    setInboundModalOpen,
    // 出库
    handleOpenOutbound,
    handleDoOutbound,
    setOutboundModalOpen,
    setOutboundItems,
    setOutboundCustomerName,
    setOutboundCustomerPhone,
    setOutboundShippingAddress,
    setOutstockType,
    setOutboundRemark,
    // 弹窗开关
    setCreateAreaModalOpen,
    setCreateLocationModalOpen,
    setBatchInitModalOpen,
    setDetailModalOpen,
    setTransferModalOpen,
    setTransferTargetLocation,
    setPrintModalOpen,
    setSelectMode,
    setSelectedLocationIds,
  } = data;

  // 勾选模式切换
  const handleToggleSelectMode = () => {
    setSelectMode(!selectMode);
    if (selectMode) {
      setSelectedLocationIds(new Set());
    }
  };

  // 全选/取消全选
  const handleToggleSelectAll = () => {
    const allIds = filteredLocations.map(l => l.id);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedLocationIds.has(id));
    if (allSelected) {
      setSelectedLocationIds(new Set());
    } else {
      setSelectedLocationIds(new Set(allIds));
    }
  };

  // 单项勾选切换
  const handleToggleSelect = (locationId: string) => {
    const newSet = new Set(selectedLocationIds);
    if (selectedLocationIds.has(locationId)) newSet.delete(locationId);
    else newSet.add(locationId);
    setSelectedLocationIds(newSet);
  };

  // 单项 Checkbox 变化
  const handleCheckboxChange = (locationId: string, checked: boolean) => {
    const newSet = new Set(selectedLocationIds);
    if (checked) newSet.add(locationId);
    else newSet.delete(locationId);
    setSelectedLocationIds(newSet);
  };

  // 打开批量初始化弹窗（预设默认值）
  const handleOpenBatchInit = (form: typeof batchInitForm) => {
    form.setFieldsValue({
      rackCount: 2,
      levelCount: 3,
      positionCount: 2,
    });
    setBatchInitModalOpen(true);
  };

  // 打开转移库存抽屉（从详情抽屉触发）
  const handleOpenTransferFromDetail = () => {
    setDetailModalOpen(false);
    setTransferTargetLocation('');
    setTransferModalOpen(true);
  };

  // 关闭弹窗时的清理回调
  const handleCancelCreateArea = () => {
    setCreateAreaModalOpen(false);
    createAreaForm.resetFields();
  };
  const handleCancelCreateLocation = () => {
    setCreateLocationModalOpen(false);
    createLocationForm.resetFields();
  };
  const handleCancelBatchInit = () => {
    setBatchInitModalOpen(false);
    batchInitForm.resetFields();
  };
  const handleCloseInbound = () => {
    setInboundModalOpen(false);
    inboundForm.resetFields();
  };
  const handleCloseTransfer = () => {
    setTransferModalOpen(false);
    setTransferTargetLocation('');
  };

  return (
    <div className="warehouse-location-map">
      <div className="wlm-layout">
        <WarehouseSidebar
          areas={areas}
          areasLoading={areasLoading}
          selectedAreaId={selectedAreaId}
          onSelectArea={setSelectedAreaId}
          onToggleArea={handleToggleArea}
          onDeleteArea={confirmDeleteArea}
          onCreateArea={() => setCreateAreaModalOpen(true)}
        />

        <div className="wlm-main">
          {selectedArea ? (
            <>
              <WarehouseStats
                selectedArea={selectedArea}
                areaOverview={areaOverview}
                overviewLoading={overviewLoading}
                locations={locations}
              />

              <WarehouseZoneTabs
                zones={zones}
                locations={locations}
                selectedZoneName={selectedZoneName}
                onSelectZone={setSelectedZoneName}
                selectMode={selectMode}
                selectedLocationIds={selectedLocationIds}
                filteredLocations={filteredLocations}
                onToggleSelectMode={handleToggleSelectMode}
                onToggleSelectAll={handleToggleSelectAll}
                onOpenPrint={() => setPrintModalOpen(true)}
                onCreateLocation={() => setCreateLocationModalOpen(true)}
                onOpenBatchInit={handleOpenBatchInit}
                batchInitForm={batchInitForm}
              />

              <WarehouseLocationGrid
                filteredLocations={filteredLocations}
                locationsLoading={locationsLoading}
                locations={locations}
                selectMode={selectMode}
                selectedLocationIds={selectedLocationIds}
                onLocationClick={handleLocationClick}
                onToggleSelect={handleToggleSelect}
                onCheckboxChange={handleCheckboxChange}
                onDeleteLocation={confirmDeleteLocation}
              />
            </>
          ) : (
            <Empty description="请选择仓库，或点击左侧新建仓库" style={{ marginTop: 60 }} />
          )}
        </div>
      </div>

      {/* 表单弹窗：新建仓库 / 新增库位 / 批量初始化 */}
      <FormModals
        createAreaModalOpen={createAreaModalOpen}
        createAreaForm={createAreaForm}
        onCreateArea={handleCreateArea}
        onCancelCreateArea={handleCancelCreateArea}
        createLocationModalOpen={createLocationModalOpen}
        createLocationForm={createLocationForm}
        onCreateLocation={handleCreateLocation}
        onCancelCreateLocation={handleCancelCreateLocation}
        selectedArea={selectedArea}
        zones={zones}
        batchInitModalOpen={batchInitModalOpen}
        batchInitForm={batchInitForm}
        onBatchInit={handleBatchInit}
        onCancelBatchInit={handleCancelBatchInit}
      />

      {/* 库位详情抽屉 */}
      <LocationDetailDrawer
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        selectedLocation={selectedLocation}
        locationItems={locationItems}
        locationItemsLoading={locationItemsLoading}
        onOpenInbound={handleOpenInbound}
        onOpenOutbound={handleOpenOutbound}
        onOpenTransfer={handleOpenTransferFromDetail}
      />

      {/* 库存转移抽屉 */}
      <TransferDrawer
        open={transferModalOpen}
        onClose={handleCloseTransfer}
        onConfirm={handleTransfer}
        loading={transferLoading}
        selectedLocation={selectedLocation}
        selectedAreaId={selectedAreaId}
        transferTargetLocation={transferTargetLocation}
        onTargetLocationChange={setTransferTargetLocation}
      />

      {/* 库位贴打印弹窗 */}
      <LocationLabelPrintModal
        open={printModalOpen}
        locations={locations.filter(l => selectedLocationIds.has(l.id))}
        areaName={selectedArea?.areaName || ''}
        onClose={() => setPrintModalOpen(false)}
      />

      {/* 入库抽屉 */}
      <InboundDrawer
        open={inboundModalOpen}
        onClose={handleCloseInbound}
        onConfirm={handleDoInbound}
        loading={inboundLoading}
        selectedLocation={selectedLocation}
        inboundForm={inboundForm}
      />

      {/* 出库抽屉 */}
      <OutboundDrawer
        open={outboundModalOpen}
        onClose={() => setOutboundModalOpen(false)}
        onConfirm={handleDoOutbound}
        loading={outboundLoading}
        selectedLocation={selectedLocation}
        outboundItems={outboundItems}
        onSetOutboundItems={setOutboundItems}
        outstockType={outstockType}
        onOutstockTypeChange={setOutstockType}
        outboundCustomerName={outboundCustomerName}
        onCustomerNameChange={setOutboundCustomerName}
        outboundCustomerPhone={outboundCustomerPhone}
        onCustomerPhoneChange={setOutboundCustomerPhone}
        outboundShippingAddress={outboundShippingAddress}
        onShippingAddressChange={setOutboundShippingAddress}
        outboundRemark={outboundRemark}
        onRemarkChange={setOutboundRemark}
      />
    </div>
  );
};

export default WarehouseLocationMap;
