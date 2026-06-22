import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dayjs } from 'dayjs';
import type { ShipmentReconciliation, ShipmentReconQueryParams } from '@/types/finance';
import shipmentReconciliationApi from '@/services/finance/shipmentReconciliationApi';
import { unwrapApiData } from '@/utils/api';
import { errorHandler } from '@/utils/errorHandling';
import { readPageSize } from '@/utils/pageSizeStore';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

export const useShipmentReconData = () => {
  const [reconciliationList, setReconciliationList] = useState<ShipmentReconciliation[]>([]);
  const [loading, setLoading] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [queryParams, setQueryParams] = useState<ShipmentReconQueryParams>({
    page: 1,
    pageSize: readPageSize(10),
  });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '刷新重试' });
  };

  const fetchList = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setQueryLoading(true);
    try {
      const params: Record<string, unknown> = { ...queryParams };
      if (dateRange?.[0]) params.startDate = dateRange[0].format('YYYY-MM-DD');
      if (dateRange?.[1]) params.endDate = dateRange[1].format('YYYY-MM-DD');
      const res = await shipmentReconciliationApi.list(params as unknown as ShipmentReconQueryParams);
      const data = unwrapApiData<{ records: ShipmentReconciliation[]; total: number }>(res, '获取出货对账列表失败');
      setReconciliationList(data?.records || []);
      setTotal(data?.total || 0);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '获取出货对账列表失败';
      reportSmartError('出货对账列表加载失败', errMsg, 'SHIPMENT_RECON_LIST_LOAD_FAILED');
      errorHandler.handleApiError(e, '获取出货对账列表失败');
    } finally {
      setLoading(false);
      setQueryLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams, dateRange]);

  useEffect(() => { fetchList(); }, [fetchList]);

  return {
    reconciliationList, loading, queryLoading, total, queryParams, dateRange,
    smartError, showSmartErrorNotice,
    setQueryParams, setDateRange, fetchList,
  };
};
