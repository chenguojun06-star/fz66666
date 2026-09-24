/**
 * D-529：组合商品列表数据 Hook —— 服务端分页 + 关键词/状态过滤（防抖）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { comboProductApi, type ComboProductVO } from '@/services/warehouse/comboProductApi';

export function useCombinedProductData() {
  const [records, setRecords] = useState<ComboProductVO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchText, setSearchText] = useState('');
  const [statusValue, setStatusValue] = useState('');
  const [loading, setLoading] = useState(false);
  const debouncedKeyword = useDebouncedValue(searchText, 400);
  const loadSeqRef = useRef(0);

  const loadData = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const data = await comboProductApi.list({
        page,
        pageSize,
        keyword: debouncedKeyword.trim() || undefined,
        status: statusValue || undefined,
      });
      if (seq !== loadSeqRef.current) return; // 只采纳最后一次请求结果
      setRecords(data?.records || []);
      setTotal(Number(data?.total || 0));
    } catch {
      if (seq === loadSeqRef.current) {
        setRecords([]);
        setTotal(0);
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [page, pageSize, debouncedKeyword, statusValue]);

  useEffect(() => { void loadData(); }, [loadData]);

  // 关键词/状态变化时回到第一页
  const prevKeywordRef = useRef(debouncedKeyword);
  const prevStatusRef = useRef(statusValue);
  useEffect(() => {
    if (prevKeywordRef.current !== debouncedKeyword || prevStatusRef.current !== statusValue) {
      prevKeywordRef.current = debouncedKeyword;
      prevStatusRef.current = statusValue;
      setPage(1);
    }
  }, [debouncedKeyword, statusValue]);

  return useMemo(() => ({
    records,
    total,
    page,
    pageSize,
    loading,
    searchText,
    setSearchText,
    statusValue,
    setStatusValue,
    setPage,
    setPageSize,
    loadData,
  }), [records, total, page, pageSize, loading, searchText, statusValue, loadData]);
}
