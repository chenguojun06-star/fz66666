import { useCallback, useEffect, useMemo, useState } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import { useTablePagination } from '@/hooks';
import { useOrganizationFilterOptions } from '@/hooks/useOrganizationFilterOptions';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import type { FinishedInventory } from '../finishedInventoryColumns';

export const useFinishedInventoryData = () => {
  const { message } = App.useApp();
  const [rawDataSource, setRawDataSource] = useState<FinishedInventory[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusValue, setStatusValue] = useState('');
  const [selectedFactoryType, setSelectedFactoryType] = useState('');
  const { factoryTypeOptions } = useOrganizationFilterOptions();
  const pagination = useTablePagination(20);
  const [loading, setLoading] = useState(false);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = useCallback((title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '刷新重试' });
  }, [showSmartErrorNotice]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.post<{ code: number; data: { records: FinishedInventory[]; total: number } }>('/warehouse/finished-inventory/list', { page: 1, pageSize: 500, factoryType: selectedFactoryType || undefined });
      if (res.code === 200 && res.data?.records) { setRawDataSource(res.data.records); if (showSmartErrorNotice) setSmartError(null); }
      else setRawDataSource([]);
    } catch (error) {
      console.error('加载成品库存失败:', error);
      reportSmartError('成品库存加载失败', '网络异常或服务不可用，请稍后重试', 'FINISHED_INVENTORY_LOAD_FAILED');
      message.error('加载成品库存数据失败');
      setRawDataSource([]);
    } finally { setLoading(false); }
  }, [selectedFactoryType, showSmartErrorNotice, reportSmartError, message]);

  useEffect(() => { loadData(); }, [loadData]);

  const dataSource = useMemo(() => {
    let filtered = [...rawDataSource];
    if (searchText) { const lowerSearch = searchText.toLowerCase(); filtered = filtered.filter(item => item.orderNo?.toLowerCase().includes(lowerSearch) || item.styleNo?.toLowerCase().includes(lowerSearch) || item.sku?.toLowerCase().includes(lowerSearch)); }
    if (statusValue === 'available') filtered = filtered.filter(item => item.availableQty > 0);
    else if (statusValue === 'defect') filtered = filtered.filter(item => item.defectQty > 0);
    if (selectedFactoryType) filtered = filtered.filter(item => item.factoryType === selectedFactoryType);
    const groupMap = new Map<string, FinishedInventory>();
    for (const item of filtered) {
      const key = `${item.orderNo || ''}_${item.styleNo || ''}`;
      const existing = groupMap.get(key);
      if (existing) {
        existing.availableQty = (existing.availableQty || 0) + (item.availableQty || 0);
        existing.lockedQty = (existing.lockedQty || 0) + (item.lockedQty || 0);
        existing.defectQty = (existing.defectQty || 0) + (item.defectQty || 0);
        const colors = new Set(existing.colors || []); if (item.color) colors.add(item.color); existing.colors = Array.from(colors);
        const sizes = new Set(existing.sizes || []); if (item.size) sizes.add(item.size); existing.sizes = Array.from(sizes);
        if ((item.totalInboundQty ?? 0) > (existing.totalInboundQty ?? 0)) existing.totalInboundQty = item.totalInboundQty;
      } else { groupMap.set(key, { ...item, colors: item.colors?.length ? [...item.colors] : (item.color ? [item.color] : []), sizes: item.sizes?.length ? [...item.sizes] : (item.size ? [item.size] : []) }); }
    }
    return Array.from(groupMap.values());
  }, [rawDataSource, searchText, selectedFactoryType, statusValue]);

  useEffect(() => { pagination.gotoPage(1); }, [searchText, statusValue, selectedFactoryType]);

  const { current: paginationCurrent, pageSize: paginationPageSize } = pagination.pagination;
  const pagedDataSource = useMemo(() => { const start = (paginationCurrent - 1) * paginationPageSize; return dataSource.slice(start, start + paginationPageSize); }, [dataSource, paginationCurrent, paginationPageSize]);

  return { rawDataSource, dataSource, pagedDataSource, totalRecords: dataSource.length, loading, smartError, showSmartErrorNotice, searchText, setSearchText, statusValue, setStatusValue, selectedFactoryType, setSelectedFactoryType, factoryTypeOptions, pagination, loadData };
};
