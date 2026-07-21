// 仓库仓位管理 - 操作子 Hook（含 modal.confirm JSX）
import { useState } from 'react';
import { App, Form, Input } from 'antd';
import { warehouseLocationMapApi } from '@/services/warehouse/warehouseLocationMapApi';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import { generateZoneCode } from './helpers';
import {
  buildOutboundItems,
  generateOutboundTraceId,
  validateOutboundSelection,
  getSelectedOutboundItems,
} from './warehouseLocationHelpers';
import type { OutboundItem } from './types';
import { useWarehouseFetch } from './useWarehouseFetch';

export const useWarehouseOperations = (fetch: ReturnType<typeof useWarehouseFetch>) => {
  const { message, modal } = App.useApp();
  const { user } = useUser();
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

  // ===== 新建仓库弹窗 =====
  const [createAreaModalOpen, setCreateAreaModalOpen] = useState(false);
  const [createAreaForm] = Form.useForm();

  // ===== 新增库位弹窗 =====
  const [createLocationModalOpen, setCreateLocationModalOpen] = useState(false);
  const [createLocationForm] = Form.useForm();

  // ===== 批量初始化弹窗 =====
  const [batchInitModalOpen, setBatchInitModalOpen] = useState(false);
  const [batchInitForm] = Form.useForm();

  // ===== 库存转移 =====
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferTargetLocation, setTransferTargetLocation] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  // ===== 勾选模式 =====
  const [selectMode, setSelectMode] = useState(false);
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());
  const [printModalOpen, setPrintModalOpen] = useState(false);

  // ===== 入库弹窗 =====
  const [inboundModalOpen, setInboundModalOpen] = useState(false);
  const [inboundForm] = Form.useForm();
  const [inboundLoading, setInboundLoading] = useState(false);

  // ===== 出库弹窗 =====
  const [outboundModalOpen, setOutboundModalOpen] = useState(false);
  const [outboundLoading, setOutboundLoading] = useState(false);
  const [outboundItems, setOutboundItems] = useState<OutboundItem[]>([]);
  const [outboundCustomerName, setOutboundCustomerName] = useState('');
  const [outboundCustomerPhone, setOutboundCustomerPhone] = useState('');
  const [outboundShippingAddress, setOutboundShippingAddress] = useState('');
  const [outstockType, setOutstockType] = useState<string>('sales');
  const [outboundRemark, setOutboundRemark] = useState('');

  // ===== 仓库区域操作 =====
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

  const confirmDeleteArea = (areaId: string, areaName: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    let reasonInput = '';
    modal.confirm({
      title: `确定删除仓库「${areaName}」？`,
      content: (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: 'var(--color-danger)', marginBottom: 8 }}>
            此操作将硬删除该仓库及其下所有空闲库位，删除后不可恢复！
          </div>
          <Input.TextArea
            rows={3}
            placeholder="请输入删除原因（必填）"
            onChange={(e) => { reasonInput = e.target.value; }}
          />
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        if (!reasonInput.trim()) {
          message.error('请输入删除原因');
          return Promise.reject();
        }
        try {
          await warehouseLocationMapApi.deleteArea(areaId, reasonInput.trim());
          message.success('仓库删除成功');
          if (selectedAreaId === areaId) {
            setSelectedAreaId('');
            setLocations([]);
          }
          loadAreas();
          loadOverview();
        } catch (err: any) {
          const errMsg = err?.response?.data?.message || err?.message || '删除失败';
          message.error(errMsg);
        }
      },
    });
  };

  const confirmDeleteLocation = (locationId: string, locationCode: string, usedCapacity: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (usedCapacity > 0) {
      modal.confirm({
        title: '无法删除库位',
        content: `该库位有 ${usedCapacity} 件库存，请先转移库存到其他库位后再删除。`,
        okText: '去转移库存',
        cancelText: '取消',
        onOk: () => {
          setTransferTargetLocation('');
          setTransferModalOpen(true);
          setDetailModalOpen(false);
        },
      });
      return;
    }
    let reasonInput = '';
    modal.confirm({
      title: `确定删除库位「${locationCode}」？`,
      content: (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: 'var(--color-danger)', marginBottom: 8 }}>
            此操作将硬删除该库位，删除后不可恢复！
          </div>
          <Input.TextArea
            rows={3}
            placeholder="请输入删除原因（必填）"
            onChange={(e) => { reasonInput = e.target.value; }}
          />
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        if (!reasonInput.trim()) {
          message.error('请输入删除原因');
          return Promise.reject();
        }
        try {
          const res = await warehouseLocationMapApi.deleteLocation(locationId, reasonInput.trim());
          const code = res?.data?.code;
          if (code !== undefined && code !== 0 && code !== 200) {
            message.error(res?.data?.message || '删除失败');
            return;
          }
          message.success(`库位 ${locationCode} 已删除`);
          if (selectedLocation?.id === locationId) {
            setDetailModalOpen(false);
            setSelectedLocation(null);
          }
          loadLocations(selectedAreaId);
          loadOverview();
        } catch (err: any) {
          const errMsg = err?.response?.data?.message || err?.message || '删除失败';
          message.error(errMsg);
        }
      },
    });
  };

  // ===== 新建仓库 =====
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

  // ===== 新增库位 =====
  const handleCreateLocation = async () => {
    try {
      const values = await createLocationForm.validateFields();
      const rawZoneName = Array.isArray(values.zoneName) ? values.zoneName[0] : values.zoneName;
      const zoneName = String(rawZoneName || '').trim();
      if (!zoneName) {
        message.error('请输入库区名称');
        return;
      }
      const rackNum = String(values.rackNum || '01').padStart(2, '0');
      const levelNum = values.levelNum || 1;
      const positionNum = values.positionNum || 1;
      const existingZoneCodes = zones.map(z => z.code);
      const zoneCode = values.zoneCode || generateZoneCode(zoneName, existingZoneCodes);
      const locationCode = `${zoneCode}-${rackNum}-${levelNum}-${positionNum}`;
      const locationName = `${zoneName} ${rackNum}架${levelNum}层${positionNum}位`;
      await warehouseLocationMapApi.createLocation({
        locationCode,
        locationName,
        zoneCode,
        zoneName,
        aisleCode: zoneCode,
        rackCode: `${zoneCode}-${rackNum}`,
        levelCode: String(levelNum),
        positionCode: String(positionNum),
        warehouseType: selectedArea?.warehouseType,
        areaId: selectedAreaId,
        capacity: values.capacity || 100,
        locationType: 'STORAGE',
      });
      message.success('库位创建成功');
      setCreateLocationModalOpen(false);
      createLocationForm.resetFields();
      loadLocations(selectedAreaId);
    } catch {
      message.error('创建失败');
    }
  };

  // ===== 批量初始化 =====
  const handleBatchInit = async () => {
    try {
      const values = await batchInitForm.validateFields();
      const zoneName = values.zoneName.trim();
      const rackCount = values.rackCount || 2;
      const levelCount = values.levelCount || 3;
      const positionCount = values.positionCount || 2;
      const existingZoneCodes = zones.map(z => z.code);
      const _zoneCode = generateZoneCode(zoneName, existingZoneCodes);
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

  // ===== 库存转移 =====
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
      const code = res?.data?.code;
      if (code !== undefined && code !== 0 && code !== 200) {
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
      const errMsg = err?.response?.data?.message || err?.message || '转移失败';
      message.error(errMsg);
    } finally {
      setTransferLoading(false);
    }
  };

  // ===== 入库处理 =====
  const handleOpenInbound = () => {
    inboundForm.resetFields();
    inboundForm.setFieldsValue({ warehouseLocation: selectedLocation?.locationCode || '' });
    setInboundModalOpen(true);
  };

  const handleDoInbound = async () => {
    try {
      const values = await inboundForm.validateFields();
      setInboundLoading(true);
      const operatorId = String(user?.id || '').trim();
      const operatorName = String(user?.name || user?.username || '').trim();
      const res = await api.post('/production/material/inbound/manual', {
        materialCode: values.materialCode,
        materialName: values.materialName,
        materialType: values.materialType || 'fabricA',
        color: values.color || '',
        size: values.size || '',
        quantity: values.quantity,
        warehouseLocation: values.warehouseLocation || selectedLocation?.locationCode || '',
        supplierName: values.supplierName || '',
        operatorId,
        operatorName,
        remark: values.remark || '',
      });
      if ((res as any)?.code === 200) {
        message.success('入库成功');
        setInboundModalOpen(false);
        inboundForm.resetFields();
        if (selectedLocation) handleLocationClick(selectedLocation);
        loadLocations(selectedAreaId);
        loadOverview();
      } else {
        message.error((res as any)?.message || '入库失败');
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '入库失败');
    } finally {
      setInboundLoading(false);
    }
  };

  // ===== 出库处理 =====
  const handleOpenOutbound = () => {
    setOutboundItems(buildOutboundItems(locationItems));
    setOutboundCustomerName('');
    setOutboundCustomerPhone('');
    setOutboundShippingAddress('');
    setOutstockType('sales');
    setOutboundRemark('');
    setOutboundModalOpen(true);
  };

  const handleDoOutbound = async () => {
    const error = validateOutboundSelection(outboundItems);
    if (error) {
      message.warning(error);
      return;
    }
    const selectedItems = getSelectedOutboundItems(outboundItems);
    setOutboundLoading(true);
    try {
      const traceId = generateOutboundTraceId();
      for (const item of selectedItems) {
        const finalPrice = item.adjustedPrice ?? item.salesPrice;
        await api.post('/warehouse/finished-inventory/free-outbound', {
          skuCode: item.skuCode,
          quantity: item.outboundQty,
          warehouseLocation: selectedLocation?.locationCode,
          warehouseAreaId: selectedLocation?.areaId,
          outstockType: outstockType || 'sales',
          customerName: outboundCustomerName || undefined,
          customerPhone: outboundCustomerPhone || undefined,
          shippingAddress: outboundShippingAddress || undefined,
          salesPrice: finalPrice,
          originalSalesPrice: item.salesPrice,
          priceAdjustmentReason: finalPrice !== item.salesPrice ? '手动调整' : undefined,
          traceId,
          remark: outboundRemark || undefined,
        });
      }
      message.success(`出库成功，共 ${selectedItems.length} 项`);
      setOutboundModalOpen(false);
      if (selectedLocation) handleLocationClick(selectedLocation);
      loadLocations(selectedAreaId);
      loadOverview();
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '出库失败');
    } finally {
      setOutboundLoading(false);
    }
  };

  return {
    // 仓库区域操作
    handleToggleArea,
    confirmDeleteArea,
    confirmDeleteLocation,
    // 库位操作
    handleCreateArea,
    handleCreateLocation,
    handleBatchInit,
    handleTransfer,
    // 入库
    handleOpenInbound,
    handleDoInbound,
    // 出库
    handleOpenOutbound,
    handleDoOutbound,
    // 弹窗状态
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
    // 勾选模式
    selectMode,
    selectedLocationIds,
    printModalOpen,
    // setters
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
