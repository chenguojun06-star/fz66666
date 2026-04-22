import { useEffect, useMemo, useState } from 'react';
import api from '@/utils/api';

const STORAGE_KEY = 'warehouse-location-options';
const STORAGE_KEY_BY_TYPE = 'warehouse-location-options-by-type';

const readCachedWarehouseOptions = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
};

const readCachedWarehouseOptionsByType = (): Record<string, string[]> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_BY_TYPE);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export type WarehouseType = 'finished' | 'material' | 'sample' | 'all';

const getDictTypeByWarehouseType = (type: WarehouseType): string => {
  switch (type) {
    case 'finished':
      return 'finished_warehouse_location';
    case 'material':
      return 'material_warehouse_location';
    case 'sample':
      return 'sample_warehouse_location';
    default:
      return 'warehouse_location';
  }
};

export function useWarehouseLocationOptions(warehouseType: WarehouseType = 'all') {
  const [options, setOptions] = useState<string[]>(() => {
    if (warehouseType === 'all') {
      return readCachedWarehouseOptions();
    }
    const cachedByType = readCachedWarehouseOptionsByType();
    return cachedByType[warehouseType] || [];
  });

  useEffect(() => {
    let cancelled = false;
    const dictType = getDictTypeByWarehouseType(warehouseType);
    
    api.get<{ code: number; data: { records?: { dictLabel: string }[] } | { dictLabel: string }[] }>(
      '/system/dict/list',
      { params: { dictType, page: 1, pageSize: 100 } },
    ).then((res) => {
      if (cancelled || res.code !== 200) return;
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.records || [];
      const labels = list.map((item: any) => String(item?.dictLabel || '').trim()).filter(Boolean);
      if (!labels.length) return;
      
      setOptions(labels);
      
      try {
        if (warehouseType === 'all') {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
        } else {
          const cachedByType = readCachedWarehouseOptionsByType();
          cachedByType[warehouseType] = labels;
          window.localStorage.setItem(STORAGE_KEY_BY_TYPE, JSON.stringify(cachedByType));
        }
      } catch {
        return;
      }
    }).catch(() => {
      return;
    });

    return () => {
      cancelled = true;
    };
  }, [warehouseType]);

  const selectOptions = useMemo(
    () => options.map((item) => ({ label: item, value: item })),
    [options],
  );

  return {
    warehouseOptions: options,
    warehouseSelectOptions: selectOptions,
  };
}
