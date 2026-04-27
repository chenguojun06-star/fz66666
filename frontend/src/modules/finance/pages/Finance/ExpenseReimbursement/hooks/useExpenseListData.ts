import { useCallback, useEffect, useMemo, useState } from 'react';
import { App } from 'antd';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { useAuth } from '@/utils/AuthContext';
import { expenseReimbursementApi, type ExpenseReimbursement } from '@/services/finance/expenseReimbursementApi';
import { readPageSize } from '@/utils/pageSizeStore';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { usePersistentState } from '@/hooks/usePersistentState';

export const useExpenseListData = () => {
  const { user } = useAuth();
  const { message } = App.useApp();

  const [list, setList] = useState<ExpenseReimbursement[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize(20));
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterType, setFilterType] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const [viewMode, setViewMode] = usePersistentState<'my' | 'all'>('expense-reimbursement-view-mode', 'my');
  const [stats, setStats] = useState({ pending: 0, totalAmount: 0, paidAmount: 0 });
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '刷新重试' });
  };

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, size: pageSize };
      if (viewMode === 'my' && user?.id) {
        params.applicantId = String(user.id);
      }
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.expenseType = filterType;
      if (debouncedKeyword.trim()) params.keyword = debouncedKeyword.trim();

      const res = await expenseReimbursementApi.getList(params);
      if (res.code === 200 && res.data) {
        setList(res.data.records || []);
        setTotal(res.data.total || 0);
        if (showSmartErrorNotice) setSmartError(null);

        const records: ExpenseReimbursement[] = res.data.records || [];
        const pendingCount = records.filter(r => r.status === 'pending').length;
        const totalAmt = records.reduce((s, r) => s + (r.amount || 0), 0);
        const paidAmt = records.filter(r => r.status === 'paid').reduce((s, r) => s + (r.amount || 0), 0);
        setStats({ pending: pendingCount, totalAmount: totalAmt, paidAmount: paidAmt });
      } else {
        const errMessage = res.message || '加载报销列表失败';
        reportSmartError('费用报销列表加载失败', errMessage, 'EXPENSE_LIST_LOAD_FAILED');
        message.error(errMessage);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '网络异常或服务不可用，请稍后重试';
      reportSmartError('费用报销列表加载失败', errMsg, 'EXPENSE_LIST_LOAD_EXCEPTION');
      message.error(`加载报销列表失败: ${err instanceof Error ? err.message : '请检查网络连接'}`);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterStatus, filterType, debouncedKeyword, viewMode, user?.id, message]);

  useEffect(() => { fetchList(); }, [fetchList]);

  return {
    list, loading, total, page, pageSize, filterStatus, filterType, keyword,
    viewMode, stats, smartError, showSmartErrorNotice,
    setPage, setPageSize, setFilterStatus, setFilterType, setKeyword,
    setViewMode, fetchList, reportSmartError,
  };
};
