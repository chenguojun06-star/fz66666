import { useState, useEffect, useMemo } from 'react';
import { materialInventoryApi } from '@/services/warehouse/materialInventoryApi';
import type { MaterialStockAlertItem } from '../components/MaterialAlertRanking';

export function useMaterialAlerts() {
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertList, setAlertList] = useState<MaterialStockAlertItem[]>([]);

  const alertOptions = useMemo(
    () => alertList.map((item) => {
      const key = `${item.materialCode || ''}|${item.color || ''}|${item.size || ''}`;
      const label = `${item.materialName || item.materialCode || '物料'}${item.color ? `/${item.color}` : ''}${item.size ? `/${item.size}` : ''}`;
      return { label, value: key };
    }),
    [alertList],
  );

  const fetchAlerts = async () => {
    setAlertLoading(true);
    try {
      const res = await materialInventoryApi.listAlerts({ days: 30, leadDays: 7, limit: 50, onlyNeed: true });
      if (res?.code === 200 && Array.isArray(res.data)) {
        setAlertList(res.data as MaterialStockAlertItem[]);
      } else {
        setAlertList([]);
      }
    } catch {
      setAlertList([]);
    } finally {
      setAlertLoading(false);
    }
  };

  useEffect(() => {
    void fetchAlerts();
    const timer = setInterval(() => void fetchAlerts(), 60000);
    return () => clearInterval(timer);
  }, []);

  return { alertLoading, alertList, alertOptions, fetchAlerts };
}
