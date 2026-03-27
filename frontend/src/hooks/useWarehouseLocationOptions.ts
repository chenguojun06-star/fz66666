import { useEffect, useMemo, useState } from 'react';
import api from '@/utils/api';

const STORAGE_KEY = 'warehouse-location-options';

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

export function useWarehouseLocationOptions() {
  const [options, setOptions] = useState<string[]>(() => readCachedWarehouseOptions());

  useEffect(() => {
    let cancelled = false;
    api.get<{ code: number; data: { records?: { dictLabel: string }[] } | { dictLabel: string }[] }>(
      '/system/dict/list',
      { params: { dictType: 'warehouse_location', page: 1, pageSize: 100 } },
    ).then((res) => {
      if (cancelled || res.code !== 200) return;
      const list = Array.isArray(res.data) ? res.data : (res.data as any)?.records || [];
      const labels = list.map((item: any) => String(item?.dictLabel || '').trim()).filter(Boolean);
      if (!labels.length) return;
      setOptions(labels);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
      } catch {
        return;
      }
    }).catch(() => {
      return;
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectOptions = useMemo(
    () => options.map((item) => ({ label: item, value: item })),
    [options],
  );

  return {
    warehouseOptions: options,
    warehouseSelectOptions: selectOptions,
  };
}
