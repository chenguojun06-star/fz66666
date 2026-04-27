import { useState, useEffect, useMemo } from 'react';
import type { Dayjs } from 'dayjs';
import { useTablePagination } from '@/hooks';
import { useUser } from '@/utils/AuthContext';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { materialInventoryApi } from '@/services/warehouse/materialInventoryApi';
import { message } from '@/utils/antdStatic';
import type { MaterialInventory } from '../types';

export function useMaterialInventoryList() {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<MaterialInventory[]>([]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const { user } = useUser();
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const showMaterialAI = useMemo(() => isSmartFeatureEnabled('smart.material.inventory.ai.enabled'), []);
  const pagination = useTablePagination(20, 'material-inventory-main');
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [stats, setStats] = useState({
    totalValue: 0, totalQty: 0, lowStockCount: 0, materialTypes: 0, todayInCount: 0, todayOutCount: 0,
  });

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '刷新重试' });
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { current, pageSize } = pagination.pagination;
      const res = await materialInventoryApi.list({
        page: current, pageSize,
        materialCode: searchText,
        materialType: selectedType || undefined,
        startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
        endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
      });
      if (res?.data?.records) {
        const list = res.data.records.map((item) => ({
          ...item,
          availableQty: (item.quantity || 0) - (item.lockedQuantity || 0),
          lockedQty: item.lockedQuantity || 0,
          specification: item.specifications || item.specification || '',
          safetyStock: item.safetyStock || 100,
          inTransitQty: 0,
          unit: item.unit || '米',
          conversionRate: item.conversionRate != null ? Number(item.conversionRate) : undefined,
          unitPrice: Number(item.unitPrice) || 0,
          totalValue: Number(item.totalValue) || (item.quantity || 0) * (Number(item.unitPrice) || 0),
          warehouseLocation: item.location || item.warehouseLocation || '默认仓',
          lastInboundDate: item.lastInboundDate
            ? String(item.lastInboundDate).replace('T', ' ').substring(0, 16)
            : (item.updateTime ? String(item.updateTime).replace('T', ' ').substring(0, 16) : '-'),
          lastOutboundDate: item.lastOutboundDate
            ? String(item.lastOutboundDate).replace('T', ' ').substring(0, 16) : '-',
          supplierName: item.supplierName || '-',
        }));
        setDataSource(list);
        pagination.setTotal(res.data.total);
        setStats({
          totalValue: list.reduce((sum: number, i) => sum + (i.totalValue || 0), 0),
          totalQty: list.reduce((sum: number, i) => sum + (i.quantity || 0), 0),
          lowStockCount: list.filter((i) => (i.quantity || 0) < (i.safetyStock || 100)).length,
          materialTypes: list.length,
          todayInCount: res.data?.todayInCount || 0,
          todayOutCount: res.data?.todayOutCount || 0,
        });
        if (showSmartErrorNotice) setSmartError(null);
      }
    } catch {
      reportSmartError('面辅料库存加载失败', '网络异常或服务不可用，请稍后重试', 'WAREHOUSE_MATERIAL_STOCK_LOAD_FAILED');
      message.error('加载库存失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pagination.pagination.pageSize < 20) pagination.setPageSize(20);
  }, [pagination, pagination.pagination.pageSize]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void fetchData(); }, [
    pagination.pagination.current, pagination.pagination.pageSize, searchText, selectedType, dateRange,
  ]);

  return {
    loading, dataSource, smartError, showSmartErrorNotice, showMaterialAI,
    stats, pagination, user,
    searchText, setSearchText,
    selectedType, setSelectedType,
    dateRange, setDateRange,
    fetchData,
  };
}
