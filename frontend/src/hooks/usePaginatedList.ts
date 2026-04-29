import { useState, useEffect, useCallback } from 'react';
import { message } from '@/utils/antdStatic';

interface PaginatedResult<_T = unknown> {
  records?: _T[];
  total?: number;
}

interface UsePaginatedListOptions<F> {
  fetchList: (params: { page: number; pageSize: number } & Partial<F>) => Promise<unknown>;
  fetchStats?: () => Promise<unknown>;
  pageSize?: number;
  onError?: string;
}

interface UsePaginatedListResult<T, S> {
  list: T[];
  loading: boolean;
  total: number;
  page: number;
  setPage: (p: number) => void;
  stats: S | null;
  refresh: () => void;
}

export function usePaginatedList<T = unknown, F = Record<string, unknown>, S = unknown>(
  options: UsePaginatedListOptions<F>,
  filters: Partial<F>
): UsePaginatedListResult<T, S> {
  const { fetchList, fetchStats, pageSize = 20, onError = '加载数据失败' } = options;
  const [list, setList] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<S | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const promises: [Promise<unknown>, Promise<unknown>?] = [
        fetchList({ page, pageSize, ...filters } as { page: number; pageSize: number } & Partial<F>),
      ];
      if (fetchStats) {
        promises.push(fetchStats());
      }
      const results = await Promise.all(promises);
      const listData = results[0] as PaginatedResult<T>;
      const records = listData?.records ?? (Array.isArray(listData) ? listData : []);
      setList(Array.isArray(records) ? records : []);
      setTotal(listData?.total ?? 0);
      if (results[1]) {
        setStats(results[1] as S);
      }
    } catch {
      message.error(onError);
    } finally {
      setLoading(false);
    }
  }, [fetchList, fetchStats, page, pageSize, filters, onError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    list,
    loading,
    total,
    page,
    setPage,
    stats,
    refresh: fetchData,
  };
}
