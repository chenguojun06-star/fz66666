import { useState, useCallback } from 'react';
import api, { type ApiResult } from '@/utils/api';
import type {
  LogisticsAnomaly,
  PlatformBill,
  ReconcileResult,
} from './types';
import { extractApiData, buildBillQueryParams } from './utils';

export function useLogisticsBills() {
  const [anomalies, setAnomalies] = useState<LogisticsAnomaly[]>([]);
  const [bills, setBills] = useState<PlatformBill[]>([]);

  const fetchAnomalies = useCallback(async (unhandledOnly = true) => {
    try {
      const res = await api.get<ApiResult<LogisticsAnomaly[]>>(
        `/ecommerce/logistics/anomalies?unhandledOnly=${unhandledOnly}`);
      setAnomalies(extractApiData(res, []));
    } catch { /* handled */ }
  }, []);

  const scanAnomalies = useCallback(async () => {
    const res = await api.post<ApiResult<number>>('/ecommerce/logistics/anomaly-scan');
    await fetchAnomalies();
    return res?.data ?? 0;
  }, [fetchAnomalies]);

  const handleAnomaly = useCallback(async (id: number, remark?: string) => {
    await api.post(`/ecommerce/logistics/anomalies/${id}/handle`, { remark });
    await fetchAnomalies();
  }, [fetchAnomalies]);

  const ignoreAnomaly = useCallback(async (id: number, remark?: string) => {
    await api.post(`/ecommerce/logistics/anomalies/${id}/ignore`, { remark });
    await fetchAnomalies();
  }, [fetchAnomalies]);

  const fetchBills = useCallback(async (pendingOnly = true, billPeriod?: string) => {
    try {
      const params = buildBillQueryParams(pendingOnly, billPeriod);
      const res = await api.get<ApiResult<PlatformBill[]>>(
        `/ecommerce/bills${params}`);
      setBills(extractApiData(res, []));
    } catch { /* handled */ }
  }, []);

  const reconcileBills = useCallback(async (platform?: string, billPeriod?: string) => {
    const res = await api.post<ApiResult<ReconcileResult>>('/ecommerce/bill/reconcile',
      { platform, billPeriod });
    await fetchBills(false);
    return res?.data;
  }, [fetchBills]);

  const handleBill = useCallback(async (id: number, status: number, remark?: string) => {
    await api.post(`/ecommerce/bills/${id}/handle`, { status, remark });
    await fetchBills(false);
  }, [fetchBills]);

  return {
    anomalies, bills,
    fetchAnomalies, scanAnomalies, handleAnomaly, ignoreAnomaly,
    fetchBills, reconcileBills, handleBill,
  };
}
