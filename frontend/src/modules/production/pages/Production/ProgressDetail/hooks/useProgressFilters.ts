import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { ProductionQueryParams } from '@/types/production';
import { readPageSize } from '@/utils/pageSizeStore';
import { usePersistentSort } from '@/hooks/usePersistentSort';

const DATE_SORT_STORAGE_KEY = 'production_date_sort_asc';
const PROGRESS_VIEW_MODE_STORAGE_KEY = 'production_progress_view_mode';

const getDateSortFromStorage = (): boolean => {
  try {
    return localStorage.getItem(DATE_SORT_STORAGE_KEY) === 'true';
  } catch {}
  return false;
};

const saveDateSortToStorage = (asc: boolean) => {
  try {
    localStorage.setItem(DATE_SORT_STORAGE_KEY, String(asc));
  } catch {}
};

export const useProgressFilters = () => {
  const location = useLocation();

  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({ page: 1, pageSize: readPageSize(10), keyword: '', includeScrapped: false, excludeTerminal: true });
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'card'>(
    () => (localStorage.getItem(PROGRESS_VIEW_MODE_STORAGE_KEY) as 'list' | 'card') || 'card'
  );
  const setViewModePersist = (mode: 'list' | 'card') => {
    localStorage.setItem(PROGRESS_VIEW_MODE_STORAGE_KEY, mode);
    setViewMode(mode);
  };
  const [activeStatFilter, setActiveStatFilter] = useState<'production' | 'delayed' | 'today'>('production');
  const [dateSortAsc, setDateSortAsc] = useState<boolean>(() => getDateSortFromStorage());

  const toggleDateSort = useCallback(() => {
    setDateSortAsc((prev) => {
      const newValue = !prev;
      saveDateSortToStorage(newValue);
      return newValue;
    });
  }, []);

  const {
    sortField: orderSortField,
    sortOrder: orderSortOrder,
    handleSort: handleOrderSort,
  } = usePersistentSort<string, 'asc' | 'desc'>({
    storageKey: 'progress-detail-order-list',
    defaultField: 'createTime',
    defaultOrder: 'desc',
  });

  const statusOptions = useMemo(() => ([
    { label: '全部', value: '' },
    { label: '待生产', value: 'pending' },
    { label: '生产中', value: 'production' },
    { label: '已完成', value: 'completed' },
    { label: '已报废', value: 'scrapped' },
    { label: '已逾期', value: 'delayed' },
    { label: '已取消', value: 'cancelled' },
  ]), []);

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
    dateSortAsc,
    toggleDateSort,
  };
};
