// 仓库仓位管理 - 业务逻辑 Hook
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App, Form, Input } from 'antd';
import { warehouseLocationMapApi } from '@/services/warehouse/warehouseLocationMapApi';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import { generateZoneCode } from './helpers';
import type {
  WarehouseAreaItem,
  LocationItem,
  LocationSkuItem,
  OutboundItem,
} from './types';

export const useWarehouseLocationData = () => {
  const { message, modal } = App.useApp();
  const { user } = useUser();
  const [searchParams] = useSearchParams();
  const locationCodeFromUrl = searchParams.get('locationCode');

  // ===== 仓库区域 =====
  const [areas, setAreas] = useState<WarehouseAreaItem[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [selectedZoneName, setSelectedZoneName] = useState<string>('');

  // ===== 库位列表 =====
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  // ===== 概览统计 =====
  const [overview, setOverview] = useState<Record<string, any>>({});
  const [overviewLoading, setOverviewLoading] = useState(true);

  // ===== 库位详情 =====
  const [selectedLocation, setSelectedLocation] = useState<LocationItem | null>(null);
  const [locationItems, setLocationItems] = useState<LocationSkuItem[]>([]);
  const [locationItemsLoading, setLocationItemsLoading] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

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

  // ===== 数据加载 =====
  const loadAreas = useCallback(async () => {
    setAreasLoading(true);
    try {
      const res = await warehouseLocationMapApi.getAreaList({ pageSize: 200 });
      const list = res?.data?.data?.records || res?.data?.records || [];
      setAreas(list);
      if (list.length > 0 && !selectedAreaId) {
        setSelectedAreaId(list[0].id);
      }
    } catch {
      message.error('加载仓库区域失败');
    } finally {
      setAreasLoading(false);
    }
  }, [message, selectedAreaId]);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await warehouseLocationMapApi.getWarehouseOverview();
      setOverview(res?.data?.data || res?.data || {});
    } catch {
      // silent
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadLocations = useCallback(async (areaId: string) => {
    if (!areaId) return;
    setLocationsLoading(true);
    try {
      const res = await warehouseLocationMapApi.getLocationListByType(undefined, areaId);
      const list = res?.data?.data || res?.data || [];
      setLocations(list);
      if (list.length > 0) {
        const firstZone = list.find((l: LocationItem) => l.zoneName)?.zoneName || '';
        setSelectedZoneName(firstZone);
      } else {
        setSelectedZoneName('');
      }
    } catch {
      message.error('加载库位数据失败');
    } finally {
      setLocationsLoading(false);
    }
  }, [message]);

  useEffect(() => {
    loadAreas();
    loadOverview();
  }, [loadAreas, loadOverview]);

  useEffect(() => {
    if (selectedAreaId) {
      loadLocations(selectedAreaId);
    }
  }, [selectedAreaId, loadLocations]);

  // ===== 派生数据 =====
  const selectedArea = useMemo(
    () => areas.find(a => a.id === selectedAreaId),
    [areas, selectedAreaId]
  );

  const zones = useMemo(() => {
    const zoneMap = new Map<string, string>();
    locations.forEach(loc => {
      if (loc.zoneName && !zoneMap.has(loc.zoneName)) {
        zoneMap.set(loc.zoneName, loc.zoneCode || loc.zoneName);
      }
    });
    return Array.from(zoneMap.entries()).map(([name, code]) => ({ name, code }));
  }, [locations]);

  const filteredLocations = useMemo(() => {
    if (!selectedZoneName) return locations;
    return locations.filter(l => l.zoneName === selectedZoneName);
  }, [locations, selectedZoneName]);

  const areaOverview = selectedArea ? overview[selectedArea.warehouseType] : null;

  // ===== 库位点击 =====
  const handleLocationClick = useCallback(async (location: LocationItem) => {
    setSelectedLocation(location);
    setDetailModalOpen(true);
    setLocationItemsLoading(true);
    try {
      const res = await warehouseLocationMapApi.getLocationItems(location.locationCode, location.warehouseType);
      const items = res?.data?.data?.items || res?.data?.items || [];
      setLocationItems(items);
    } catch {
      setLocationItems([]);
    } finally {
      setLocationItemsLoading(false);
    }
  }, []);

  // URL 参数解析 - 扫码跳转定位
  useEffect(() => {
    if (locationCodeFromUrl && locations.length > 0) {
      const targetLocation = locations.find(l => l.locationCode === locationCodeFromUrl);
      if (targetLocation) {
        // 自动定位到该库位所在的区域和库区
        setSelectedZoneName(targetLocation.zoneName || '');
        // 自动弹出详情
        handleLocationClick(targetLocation);
      }
    }
  }, [locationCodeFromUrl, locations, handleLocationClick]);

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
    const items = locationItems.map(item => ({
      ...item,
      outboundQty: 0,
      selected: false,
      adjustedPrice: item.salesPrice,
    }));
    setOutboundItems(items);
    setOutboundCustomerName('');
    setOutboundCustomerPhone('');
    setOutboundShippingAddress('');
    setOutstockType('sales');
    setOutboundRemark('');
    setOutboundModalOpen(true);
  };

  const handleDoOutbound = async () => {
    const selectedItems = outboundItems.filter(item => item.selected && item.outboundQty > 0);
    if (selectedItems.length === 0) {
      message.warning('请至少选择一项并填写出库数量');
      return;
    }
    for (const item of selectedItems) {
      if (item.outboundQty > item.stockQuantity) {
        message.warning(`${item.styleNo} ${item.color} ${item.size} 出库数量不能超过库存 ${item.stockQuantity}`);
        return;
      }
    }
    setOutboundLoading(true);
    try {
      const traceId = 'TR-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
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
    // 数据加载
    loadAreas,
    loadOverview,
    loadLocations,
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
    setSelectedLocation,
  };
};

export type UseWarehouseLocationData = ReturnType<typeof useWarehouseLocationData>;
