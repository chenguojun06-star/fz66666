import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dayjs } from 'dayjs';
import type { MaterialReconType, MaterialReconQueryParams } from '@/types/finance';
import materialReconciliationApi from '@/services/finance/materialReconciliationApi';
import type { ApiResult } from '@/utils/api';
import { unwrapApiData } from '@/utils/api';
import { errorHandler } from '@/utils/errorHandling';
import { readPageSize } from '@/utils/pageSizeStore';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { FinanceAuditResponse } from '@/services/intelligence/intelligenceApi';

export const useMaterialReconData = () => {
  const [reconciliationList, setReconciliationList] = useState<MaterialReconType[]>([]);
  const [loading, setLoading] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [queryParams, setQueryParams] = useState<MaterialReconQueryParams>({ page: 1, pageSize: readPageSize(10) });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

  const [financeAudit, setFinanceAudit] = useState<FinanceAuditResponse | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchFinanceAudit = useCallback(async () => {
    setAuditLoading(true);
    try { const res: ApiResult = await intelligenceApi.getFinanceAudit(); if (res?.data) setFinanceAudit(res.data as FinanceAuditResponse); }
    catch { /* 静默失败 */ }
    finally { setAuditLoading(false); }
  }, []);

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
      const res = await materialReconciliationApi.getMaterialReconciliationList(params as unknown as MaterialReconQueryParams);
      const data = unwrapApiData<{ records: MaterialReconType[]; total: number }>(res, '获取物料对账列表失败');
      setReconciliationList(data?.records || []);
      setTotal(data?.total || 0);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '获取物料对账列表失败';
      reportSmartError('物料对账列表加载失败', errMsg, 'MATERIAL_RECON_LIST_LOAD_FAILED');
      errorHandler.handleApiError(e, '获取物料对账列表失败');
    } finally {
      setLoading(false);
      setQueryLoading(false);
    }
  }, [queryParams, dateRange]);

  useEffect(() => { fetchList(); }, [fetchList]);

  return {
    reconciliationList, loading, queryLoading, total, queryParams, dateRange,
    smartError, showSmartErrorNotice, financeAudit, auditLoading,
    setQueryParams, setDateRange, fetchList, fetchFinanceAudit, reportSmartError,
  };
};
