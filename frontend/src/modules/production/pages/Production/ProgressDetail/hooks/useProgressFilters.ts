import { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { ProductionQueryParams } from '@/types/production';

/**
 * 筛选条件、排序、统计卡片状态管理
 */
export const useProgressFilters = () => {
  const location = useLocation();

  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({ page: 1, pageSize: 10, keyword: '' });
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('card');
  const [activeStatFilter, setActiveStatFilter] = useState<'all' | 'delayed' | 'today'>('all');
  const [orderSortField, setOrderSortField] = useState<string>('createTime');
  const [orderSortOrder, setOrderSortOrder] = useState<'asc' | 'desc'>('desc');

  const statusOptions = useMemo(() => ([
    { label: '全部', value: '' },
    { label: '待生产', value: 'pending' },
    { label: '生产中', value: 'production' },
    { label: '已完成', value: 'completed' },
    { label: '已逾期', value: 'delayed' },
    { label: '已取消', value: 'cancelled' },
  ]), []);

  const handleOrderSort = (field: string, order: 'asc' | 'desc') => {
    setOrderSortField(field);
    setOrderSortOrder(order);
  };

  const handleStatClick = (type: 'all' | 'delayed' | 'today') => {
    setActiveStatFilter(type);
    if (type === 'all') {
      setQueryParams((prev) => ({ ...prev, status: '', delayedOnly: undefined, todayOnly: undefined, page: 1 } as any));
    } else if (type === 'delayed') {
      setQueryParams((prev) => ({ ...prev, status: '', delayedOnly: 'true', todayOnly: undefined, page: 1 } as any));
    } else if (type === 'today') {
      setQueryParams((prev) => ({ ...prev, status: '', delayedOnly: undefined, todayOnly: 'true', page: 1 } as any));
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
    }));
  }, [location.search]);

  return {
    queryParams,
    setQueryParams,
    dateRange,
    setDateRange,
    viewMode,
    setViewMode,
    activeStatFilter,
    orderSortField,
    orderSortOrder,
    statusOptions,
    handleOrderSort,
    handleStatClick,
  };
};
