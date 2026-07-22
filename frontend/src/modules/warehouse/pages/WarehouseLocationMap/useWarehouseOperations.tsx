import { useState } from 'react';
import { App, Form } from 'antd';
import { warehouseLocationMapApi } from '@/services/warehouse/warehouseLocationMapApi';
import { useWarehouseFetch } from './useWarehouseFetch';
import { useWarehouseDelete } from './useWarehouseDelete';
import { useWarehouseInbound } from './useWarehouseInbound';
import { useWarehouseOutbound } from './useWarehouseOutbound';
import {
  buildLocationCreatePayload,
  normalizeZoneName,
  extractErrorMessage,
  isApiSuccess,
} from './utils';

export const useWarehouseOperations = (fetch: ReturnType<typeof useWarehouseFetch>) => {
  const { message } = App.useApp();
  const {
    selectedAreaId,
    selectedArea,
    selectedLocation,
    zones,
    locationItems,
    setAreas,
    setLocations,
    setSelectedAreaId,
    setSelectedLocation,
    setDetailModalOpen,
    loadAreas,
    loadLocations,
    loadOverview,
    handleLocationClick,
  } = fetch;

  const [createAreaModalOpen, setCreateAreaModalOpen] = useState(false);
  const [createAreaForm] = Form.useForm();

  const [createLocationModalOpen, setCreateLocationModalOpen] = useState(false);
  const [createLocationForm] = Form.useForm();

  const [batchInitModalOpen, setBatchInitModalOpen] = useState(false);
  const [batchInitForm] = Form.useForm();

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferTargetLocation, setTransferTargetLocation] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());
  const [printModalOpen, setPrintModalOpen] = useState(false);

  const { confirmDeleteArea, confirmDeleteLocation } = useWarehouseDelete({
    selectedAreaId,
    selectedLocation,
    setSelectedAreaId,
    setLocations,
    setSelectedLocation,
    setDetailModalOpen,
    setTransferModalOpen,
    setTransferTargetLocation,
    loadAreas,
    loadLocations,
    loadOverview,
  });

  const {
    inboundModalOpen,
    inboundForm,
    inboundLoading,
    setInboundModalOpen,
    handleOpenInbound,
    handleDoInbound,
  } = useWarehouseInbound({
    selectedLocation,
    handleLocationClick,
    selectedAreaId,
    loadLocations,
    loadOverview,
  });

  const {
    outboundModalOpen,
    outboundLoading,
    outboundItems,
    outboundCustomerName,
    outboundCustomerPhone,
    outboundShippingAddress,
    outstockType,
    outboundRemark,
    setOutboundModalOpen,
    setOutboundItems,
    setOutboundCustomerName,
    setOutboundCustomerPhone,
    setOutboundShippingAddress,
    setOutstockType,
    setOutboundRemark,
    handleOpenOutbound,
    handleDoOutbound,
  } = useWarehouseOutbound({
    locationItems,
    selectedLocation,
    handleLocationClick,
    selectedAreaId,
    loadLocations,
    loadOverview,
  });

  const handleToggleArea = async (areaId: string, checked: boolean) => {
    const newStatus = checked ? 'ACTIVE' : 'DISABLED';
    try {
      await warehouseLocationMapApi.updateAreaStatus(areaId, newStatus);
      setAreas(prev => prev.map(a => a.id === areaId ? { ...a, status: newStatus } : a));
      message.success(checked ? '已启用' : '已停用');
    } catch {
      message.error('操作失败');
    }
  };

  const handleCreateArea = async () => {
    try {
      const values = await createAreaForm.validateFields();
      await warehouseLocationMapApi.quickCreateArea(values.areaName, values.warehouseType);
      message.success('仓库创建成功');
      setCreateAreaModalOpen(false);
      createAreaForm.resetFields();
      loadAreas();
      loadOverview();
    } catch {
      message.error('创建失败');
    }
  };

  const handleCreateLocation = async () => {
    try {
      const values = await createLocationForm.validateFields();
      const zoneName = normalizeZoneName(values.zoneName);
      if (!zoneName) {
        message.error('请输入库区名称');
        return;
      }
      const existingZoneCodes = zones.map(z => z.code);
      const payload = buildLocationCreatePayload({
        zoneName,
        zoneCode: values.zoneCode,
        rackNum: String(values.rackNum || '01'),
        levelNum: values.levelNum || 1,
        positionNum: values.positionNum || 1,
        capacity: values.capacity,
        warehouseType: selectedArea?.warehouseType,
        areaId: selectedAreaId,
        existingZoneCodes,
      });
      await warehouseLocationMapApi.createLocation(payload);
      message.success('库位创建成功');
      setCreateLocationModalOpen(false);
      createLocationForm.resetFields();
      loadLocations(selectedAreaId);
    } catch {
      message.error('创建失败');
    }
  };

  const handleBatchInit = async () => {
    try {
      const values = await batchInitForm.validateFields();
      const zoneName = values.zoneName.trim();
      const rackCount = values.rackCount || 2;
      const levelCount = values.levelCount || 3;
      const positionCount = values.positionCount || 2;
      await warehouseLocationMapApi.batchInitLocations({
        warehouseType: selectedArea?.warehouseType,
        areaId: selectedAreaId,
        zoneNames: [zoneName],
        racksPerZone: rackCount,
        levelsPerRack: levelCount,
        positionsPerLevel: positionCount,
      });
      message.success('批量初始化成功');
      setBatchInitModalOpen(false);
      batchInitForm.resetFields();
      loadLocations(selectedAreaId);
      loadOverview();
    } catch {
      message.error('批量初始化失败');
    }
  };

  const handleTransfer = async () => {
    if (!selectedLocation || !transferTargetLocation) {
      message.error('请选择目标库位');
      return;
    }
    setTransferLoading(true);
    try {
      const res = await warehouseLocationMapApi.transferLocation(
        selectedLocation.locationCode,
        transferTargetLocation,
        selectedLocation.warehouseType,
      );
      if (!isApiSuccess(res)) {
        message.error(res?.data?.message || '转移失败');
        return;
      }
      const data = res?.data?.data || res?.data;
      message.success(`已从 ${data?.fromLocationCode || selectedLocation.locationCode} 转移 ${data?.transferredCount || 0} 条记录到 ${data?.toLocationCode || transferTargetLocation}`);
      setTransferModalOpen(false);
      setTransferTargetLocation('');
      setDetailModalOpen(false);
      setSelectedLocation(null);
      loadLocations(selectedAreaId);
      loadOverview();
    } catch (err: any) {
      message.error(extractErrorMessage(err) || '转移失败');
    } finally {
      setTransferLoading(false);
    }
  };

  return {
    handleToggleArea,
    confirmDeleteArea,
    confirmDeleteLocation,
    handleCreateArea,
    handleCreateLocation,
    handleBatchInit,
    handleTransfer,
    handleOpenInbound,
    handleDoInbound,
    handleOpenOutbound,
    handleDoOutbound,
    createAreaModalOpen,
    createAreaForm,
    createLocationModalOpen,
    createLocationForm,
    batchInitModalOpen,
    batchInitForm,
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
    selectMode,
    selectedLocationIds,
    printModalOpen,
    setCreateAreaModalOpen,
    setCreateLocationModalOpen,
    setBatchInitModalOpen,
    setTransferModalOpen,
    setTransferTargetLocation,
    setInboundModalOpen,
    setOutboundModalOpen,
    setOutboundItems,
    setOutboundCustomerName,
    setOutboundCustomerPhone,
    setOutboundShippingAddress,
    setOutstockType,
    setOutboundRemark,
    setSelectMode,
    setSelectedLocationIds,
    setPrintModalOpen,
  };
};
