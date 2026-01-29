import { useState } from 'react';

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
 * @param initialPageSize - 初始每页条数（默认10）
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
export const useTablePagination = (initialPageSize = 10) => {
  const [pagination, setPagination] = useState<PaginationConfig>({
    current: 1,
    pageSize: initialPageSize,
    total: 0,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: ['10', '20', '50', '100'],
  });

  /**
   * 页码或每页条数变化时的回调
   */
  const onChange = (page: number, pageSize: number) => {
    setPagination(prev => ({
      ...prev,
      current: page,
      pageSize: pageSize !== prev.pageSize ? prev.pageSize : pageSize,
    }));
  };

  /**
   * 设置总条数
   */
  const setTotal = (total: number) => {
    setPagination(prev => ({ ...prev, total }));
  };

  /**
   * 重置分页到第一页
   */
  const reset = () => {
    setPagination(prev => ({
      ...prev,
      current: 1,
      total: 0,
    }));
  };

  /**
   * 跳转到指定页
   */
  const gotoPage = (page: number) => {
    setPagination(prev => ({ ...prev, current: page }));
  };

  /**
   * 设置每页条数
   */
  const setPageSize = (pageSize: number) => {
    setPagination(prev => ({
      ...prev,
      pageSize,
      current: 1, // 改变每页条数时重置到第一页
    }));
  };

  return {
    pagination,   // 分页配置对象
    onChange,     // 分页变化回调
    setTotal,     // 设置总条数
    reset,        // 重置分页
    gotoPage,     // 跳转页面
    setPageSize,  // 设置每页条数
  };
};
