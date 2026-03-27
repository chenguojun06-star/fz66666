import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  buildPageSizeStorageKey,
  normalizePageSize,
  readPageSize,
  readPageSizeByKey,
  savePageSize,
  savePageSizeByKey,
} from '@/utils/pageSizeStore';

/**
 * 表格分页配置
 */
export interface PaginationConfig {
  current: number;
  pageSize: number;
  total: number;
  showSizeChanger?: boolean;
  showQuickJumper?: boolean;
  pageSizeOptions?: string[];
}

/**
 * 通用表格分页管理 Hook
 *
 * @param initialPageSize - 初始每页条数（默认20）
 *
 * @example
 * const { pagination, onChange, setTotal, reset } = useTablePagination();
 *
 * // 获取列表时使用分页参数
 * const fetchList = async () => {
 *   const res = await api.list({
 *     page: pagination.current,
 *     pageSize: pagination.pageSize,
 *   });
 *   setTotal(res.total);
 * };
 *
 * // 在表格中使用
 * <ResizableTable
 *   pagination={{
 *     ...pagination,
 *     onChange,
 *   }}
 * />
 */
export const useTablePagination = (initialPageSize = DEFAULT_PAGE_SIZE, storageKey?: string) => {
  const pageSizeStorageKey = useMemo(
    () => (storageKey ? buildPageSizeStorageKey(storageKey) : undefined),
    [storageKey],
  );
  const readPersistedPageSize = useCallback(
    () => (pageSizeStorageKey
      ? readPageSizeByKey(pageSizeStorageKey, initialPageSize)
      : readPageSize(initialPageSize)),
    [initialPageSize, pageSizeStorageKey],
  );
  const persistPageSize = useCallback((pageSize: number) => {
    if (pageSizeStorageKey) {
      savePageSizeByKey(pageSizeStorageKey, pageSize);
      return;
    }
    savePageSize(pageSize);
  }, [pageSizeStorageKey]);

  const [pagination, setPagination] = useState<PaginationConfig>({
    current: 1,
    pageSize: readPersistedPageSize(),
    total: 0,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
  });

  /**
   * 页码或每页条数变化时的回调
   */
  const onChange = useCallback((page: number, pageSize: number) => {
    const nextPageSize = normalizePageSize(pageSize, initialPageSize);
    setPagination(prev => {
      const nextCurrent = nextPageSize !== prev.pageSize ? 1 : page;
      if (nextPageSize !== prev.pageSize) persistPageSize(nextPageSize);
      return { ...prev, current: nextCurrent, pageSize: nextPageSize };
    });
  }, [initialPageSize, persistPageSize]);

  /**
   * 设置总条数
   */
  const setTotal = useCallback((total: number) => {
    setPagination(prev => (prev.total === total ? prev : { ...prev, total }));
  }, []);

  /**
   * 重置分页到第一页
   */
  const reset = useCallback(() => {
    setPagination(prev => ({
      ...prev,
      current: 1,
      total: 0,
    }));
  }, []);

  /**
   * 跳转到指定页
   */
  const gotoPage = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, current: page }));
  }, []);

  /**
   * 设置每页条数
   */
  const setPageSize = useCallback((pageSize: number) => {
    const nextPageSize = normalizePageSize(pageSize, initialPageSize);
    persistPageSize(nextPageSize);
    setPagination(prev => ({
      ...prev,
      pageSize: nextPageSize,
      current: 1, // 改变每页条数时重置到第一页
    }));
  }, [initialPageSize, persistPageSize]);

  return useMemo(() => ({
    pagination,   // 分页配置对象
    onChange,     // 分页变化回调
    setTotal,     // 设置总条数
    reset,        // 重置分页
    gotoPage,     // 跳转页面
    setPageSize,  // 设置每页条数
  }), [gotoPage, onChange, pagination, reset, setPageSize, setTotal]);
};
