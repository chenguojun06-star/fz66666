import { useEffect, useState } from 'react';
import { warehouseLocationMapApi } from '@/services/warehouse/warehouseLocationMapApi';

/**
 * 库位下拉选项（D-839：补入库单的库位必须从仓库地图已建的库位里选，
 * 不能手输——手输的"库位"仓库地图不认识，库存放哪永远说不清）。
 *
 * <p>按库区联动：选了库区只出该库区下的库位；未选库区出成品类型全部。
 */
export interface WarehouseLocationOption {
  id: string;
  locationCode: string;
  locationName?: string;
  areaId?: string;
  areaName?: string;
  status?: string;
}

export function useWarehouseLocationOptions(areaId?: string, warehouseType = 'FINISHED') {
  const [locations, setLocations] = useState<WarehouseLocationOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    warehouseLocationMapApi
      .getLocationListByType(warehouseType, areaId || undefined)
      .then((res: any) => {
        if (cancelled) return;
        const data = res?.data?.data || res?.data;
        const list = Array.isArray(data) ? data : [];
        // 只留启用状态的库位（停用的选了也放不进货）。
        // 注意：库里 status 是 'ACTIVE'（大写）——大小写不敏感比较，
        // 首版写成 'active' 会把全部库位滤光（顾客看到空下拉就是这个 bug）。
        const enabled = (st: any) => !st || String(st).toUpperCase() === 'ACTIVE';
        setLocations(list.filter((l: any) => enabled(l?.status)));
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [areaId, warehouseType]);

  return { locations, loading };
}
