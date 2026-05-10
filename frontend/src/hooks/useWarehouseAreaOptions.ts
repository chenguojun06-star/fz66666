import { useEffect, useMemo, useState } from 'react';
import api from '@/utils/api';
import { warehouseAreaApi } from '@/services/warehouse/warehouseAreaApi';

export type WarehouseAreaType = 'FINISHED' | 'MATERIAL' | 'SAMPLE';

export interface WarehouseAreaOption {
  id: string;
  areaCode: string;
  areaName: string;
  warehouseType: string;
  status: string;
  address?: string;
  contactPerson?: string;
  contactPhone?: string;
  managerName?: string;
}

export function useWarehouseAreaOptions(warehouseType?: WarehouseAreaType) {
  const [areas, setAreas] = useState<WarehouseAreaOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    warehouseAreaApi.listByType(warehouseType)
      .then((res: any) => {
        if (cancelled) return;
        const data = res.data?.data || res.data;
        const list = Array.isArray(data) ? data : [];
        setAreas(list);
      })
      .catch(() => {
        if (!cancelled) setAreas([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [warehouseType]);

  const selectOptions = useMemo(
    () => areas.map((a) => ({
      label: `${a.areaName}（${a.areaCode}）`,
      value: a.id,
      area: a,
    })),
    [areas],
  );

  return { areas, selectOptions, loading };
}

export interface WarehouseLocationOption {
  id: string;
  locationCode: string;
  locationName: string;
  zoneCode: string;
  zoneName: string;
  warehouseType: string;
  areaId: string;
  status: string;
}

export function useWarehouseLocationByArea(warehouseType?: string, areaId?: string) {
  const [locations, setLocations] = useState<WarehouseLocationOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!areaId && !warehouseType) {
      setLocations([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.get('/warehouse/location/list-by-type', {
      params: { warehouseType, areaId },
    })
      .then((res: any) => {
        if (cancelled) return;
        const data = res.data?.data || res.data;
        const list = Array.isArray(data) ? data : [];
        setLocations(list);
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [warehouseType, areaId]);

  const selectOptions = useMemo(
    () => locations.map((l) => ({
      label: `${l.locationName}（${l.locationCode}）`,
      value: l.locationCode,
      location: l,
    })),
    [locations],
  );

  return { locations, selectOptions, loading };
}
