// 仓库仓位管理 - 业务逻辑 Hook（主 Hook，组合子 Hook）
import { useWarehouseFetch } from './useWarehouseFetch';
import { useWarehouseOperations } from './useWarehouseOperations';

export const useWarehouseLocationData = () => {
  const fetch = useWarehouseFetch();
  const ops = useWarehouseOperations(fetch);

  // 剔除 fetch 内部 setter（不暴露给外部）
  const {
    areas,
    areasLoading,
    selectedAreaId,
    selectedZoneName,
    locations,
    locationsLoading,
    overview,
    overviewLoading,
    selectedLocation,
    locationItems,
    locationItemsLoading,
    detailModalOpen,
    selectedArea,
    zones,
    filteredLocations,
    areaOverview,
    setSelectedAreaId,
    setSelectedZoneName,
    setSelectedLocation,
    setDetailModalOpen,
    loadAreas,
    loadOverview,
    loadLocations,
    handleLocationClick,
  } = fetch;

  return {
    // 数据状态
    areas,
    areasLoading,
    selectedAreaId,
    selectedZoneName,
    locations,
    locationsLoading,
    overview,
    overviewLoading,
    selectedLocation,
    locationItems,
    locationItemsLoading,
    detailModalOpen,
    selectMode: ops.selectMode,
    selectedLocationIds: ops.selectedLocationIds,
    printModalOpen: ops.printModalOpen,
    transferModalOpen: ops.transferModalOpen,
    transferTargetLocation: ops.transferTargetLocation,
    transferLoading: ops.transferLoading,
    inboundModalOpen: ops.inboundModalOpen,
    inboundForm: ops.inboundForm,
    inboundLoading: ops.inboundLoading,
    outboundModalOpen: ops.outboundModalOpen,
    outboundLoading: ops.outboundLoading,
    outboundItems: ops.outboundItems,
    outboundCustomerName: ops.outboundCustomerName,
    outboundCustomerPhone: ops.outboundCustomerPhone,
    outboundShippingAddress: ops.outboundShippingAddress,
    outstockType: ops.outstockType,
    outboundRemark: ops.outboundRemark,
    createAreaModalOpen: ops.createAreaModalOpen,
    createAreaForm: ops.createAreaForm,
    createLocationModalOpen: ops.createLocationModalOpen,
    createLocationForm: ops.createLocationForm,
    batchInitModalOpen: ops.batchInitModalOpen,
    batchInitForm: ops.batchInitForm,
    // 派生数据
    selectedArea,
    zones,
    filteredLocations,
    areaOverview,
    // 数据加载
    loadAreas,
    loadOverview,
    loadLocations,
    // 仓库区域操作
    setSelectedAreaId,
    setSelectedZoneName,
    handleToggleArea: ops.handleToggleArea,
    confirmDeleteArea: ops.confirmDeleteArea,
    confirmDeleteLocation: ops.confirmDeleteLocation,
    // 库位操作
    handleLocationClick,
    handleCreateArea: ops.handleCreateArea,
    handleCreateLocation: ops.handleCreateLocation,
    handleBatchInit: ops.handleBatchInit,
    handleTransfer: ops.handleTransfer,
    // 入库
    handleOpenInbound: ops.handleOpenInbound,
    handleDoInbound: ops.handleDoInbound,
    setInboundModalOpen: ops.setInboundModalOpen,
    // 出库
    handleOpenOutbound: ops.handleOpenOutbound,
    handleDoOutbound: ops.handleDoOutbound,
    setOutboundModalOpen: ops.setOutboundModalOpen,
    setOutboundItems: ops.setOutboundItems,
    setOutboundCustomerName: ops.setOutboundCustomerName,
    setOutboundCustomerPhone: ops.setOutboundCustomerPhone,
    setOutboundShippingAddress: ops.setOutboundShippingAddress,
    setOutstockType: ops.setOutstockType,
    setOutboundRemark: ops.setOutboundRemark,
    // 弹窗开关
    setCreateAreaModalOpen: ops.setCreateAreaModalOpen,
    setCreateLocationModalOpen: ops.setCreateLocationModalOpen,
    setBatchInitModalOpen: ops.setBatchInitModalOpen,
    setDetailModalOpen,
    setTransferModalOpen: ops.setTransferModalOpen,
    setTransferTargetLocation: ops.setTransferTargetLocation,
    setPrintModalOpen: ops.setPrintModalOpen,
    setSelectMode: ops.setSelectMode,
    setSelectedLocationIds: ops.setSelectedLocationIds,
    setSelectedLocation,
  };
};

export type UseWarehouseLocationData = ReturnType<typeof useWarehouseLocationData>;
