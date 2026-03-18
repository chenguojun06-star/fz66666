import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { ProductionQueryParams } from '@/types/production';

/**
 * 筛选条件、排序、统计卡片状态管理
 */
export const useProgressFilters = () => {
  const location = useLocation();

  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({ page: 1, pageSize: 10, keyword: '', excludeTerminal: true });
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'card'>(
    () => (localStorage.getItem('production_view_mode') as 'list' | 'card') || 'card'
  );
  const setViewModePersist = (mode: 'list' | 'card') => {
    localStorage.setItem('production_view_mode', mode);
    setViewMode(mode);
  };
  const [activeStatFilter, setActiveStatFilter] = useState<'production' | 'delayed' | 'today'>('production');
  const [orderSortField, setOrderSortField] = useState<string>('createTime');
  const [orderSortOrder, setOrderSortOrder] = useState<'asc' | 'desc'>('desc');

  const statusOptions = useMemo(() => ([
    { label: '全部', value: '' },
    { label: '待生产', value: 'pending' },
    { label: '生产中', value: 'production' },
    { label: '已完成', value: 'completed' },
    { label: '已报废', value: 'scrapped' },
    { label: '已逾期', value: 'delayed' },
    { label: '已取消', value: 'cancelled' },
  ]), []);

  const handleOrderSort = (field: string, order: 'asc' | 'desc') => {
    setOrderSortField(field);
    setOrderSortOrder(order);
  };

  const handleStatClick = (type: 'production' | 'delayed' | 'today') => {
    setActiveStatFilter(type);
    if (type === 'production') {
      setQueryParams((prev) => ({ ...prev, status: '', includeScrapped: undefined, delayedOnly: undefined, todayOnly: undefined, excludeTerminal: true, page: 1 }));
    } else if (type === 'delayed') {
      setQueryParams((prev) => ({ ...prev, status: '', includeScrapped: undefined, delayedOnly: 'true', todayOnly: undefined, excludeTerminal: true, page: 1 }));
    } else if (type === 'today') {
      setQueryParams((prev) => ({ ...prev, status: '', includeScrapped: undefined, delayedOnly: undefined, todayOnly: 'true', excludeTerminal: true, page: 1 }));
    }
  };

  // 从 URL 参数读取初始筛选条件
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleNo = String(params.get('styleNo') || '').trim();
    const orderNo = String(params.get('orderNo') || '').trim();
    if (!styleNo && !orderNo) return;
    const keyword = orderNo || styleNo;
    setQueryParams((prev) => ({
      ...prev,
      page: 1,
      keyword,
      orderNo: undefined,
      styleNo: undefined,
      factoryName: undefined,
      orgUnitId: undefined,
      parentOrgUnitId: undefined,
      factoryType: undefined,
    }));
  }, [location.search]);

  return {
    queryParams,
    setQueryParams,
    dateRange,
    setDateRange,
    viewMode,
    setViewMode: setViewModePersist,
    activeStatFilter,
    orderSortField,
    orderSortOrder,
    statusOptions,
    handleOrderSort,
    handleStatClick,
  };
};
