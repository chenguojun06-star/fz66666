// 仓库仓位管理 - 数据获取子 Hook
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App } from 'antd';
import { warehouseLocationMapApi } from '@/services/warehouse/warehouseLocationMapApi';
import type {
  WarehouseAreaItem,
  LocationItem,
  LocationSkuItem,
} from './types';

export const useWarehouseFetch = () => {
  const { message } = App.useApp();
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
    // 派生数据
    selectedArea,
    zones,
    filteredLocations,
    areaOverview,
    // 内部 setter（供 operations 子 hook 使用）
    setAreas,
    setLocations,
    // 公开 setter
    setSelectedAreaId,
    setSelectedZoneName,
    setSelectedLocation,
    setDetailModalOpen,
    // 数据加载
    loadAreas,
    loadOverview,
    loadLocations,
    handleLocationClick,
  };
};
