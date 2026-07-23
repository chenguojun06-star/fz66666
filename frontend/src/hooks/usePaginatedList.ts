import { useState, useEffect, useCallback, useRef } from 'react';
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
  error: Error | null;
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
  const [error, setError] = useState<Error | null>(null);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    mountedRef.current = true;
    const reqId = requestIdRef.current;
    return () => {
      mountedRef.current = false;
      requestIdRef.current = reqId + 1;
    };
  }, []);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const promises: [Promise<unknown>, Promise<unknown>?] = [
        fetchList({ page, pageSize, ...filtersRef.current } as { page: number; pageSize: number } & Partial<F>),
      ];
      if (fetchStats) {
        promises.push(fetchStats());
      }
      const results = await Promise.all(promises);

      if (requestIdRef.current !== requestId || !mountedRef.current) return;

      const listData = results[0] as PaginatedResult<T>;
      const records = listData?.records ?? (Array.isArray(listData) ? listData : []);
      setList(Array.isArray(records) ? records : []);
      setTotal(listData?.total ?? 0);
      if (results[1]) {
        setStats(results[1] as S);
      }
    } catch (err) {
      if (requestIdRef.current !== requestId || !mountedRef.current) return;
      setError(err as Error);
      setList([]);
      setTotal(0);
      message.error(onError);
    } finally {
      if (requestIdRef.current === requestId && mountedRef.current) {
        setLoading(false);
      }
    }
  }, [fetchList, fetchStats, page, pageSize, onError]);

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
    error,
    refresh: fetchData,
  };
}
