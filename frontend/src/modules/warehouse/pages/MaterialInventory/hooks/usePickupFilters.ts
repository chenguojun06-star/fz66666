import { useRef, useCallback, useEffect } from 'react';
import type { Dayjs } from 'dayjs';
import type { useMaterialPickupData } from './useMaterialPickupData';

type PickupData = ReturnType<typeof useMaterialPickupData>;

/**
 * 领料记录筛选条件相关事件处理器
 * 与原 index.tsx 内联实现完全一致，仅抽出为独立 hook
 * 包含关键词防抖（300ms）和过滤条件变更后立即刷新
 */
export function usePickupFilters(pickupData: PickupData) {
  const pickupKeywordRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (pickupKeywordRef.current) clearTimeout(pickupKeywordRef.current);
    };
  }, []);

  const handlePickupKeywordChange = useCallback((v: string) => {
    pickupData.setKeyword(v);
    if (pickupKeywordRef.current) clearTimeout(pickupKeywordRef.current);
    pickupKeywordRef.current = setTimeout(() => {
      void pickupData.fetchData();
    }, 300);
  }, [pickupData]);

  const handlePickupStatusChange = useCallback((v: string | undefined) => {
    pickupData.setStatusFilter(v ?? '');
    void pickupData.fetchData();
  }, [pickupData]);

  const handlePickupTypeChange = useCallback((v: string | undefined) => {
    pickupData.setPickupType(v ?? undefined);
    void pickupData.fetchData();
  }, [pickupData]);

  const handleUsageTypeChange = useCallback((v: string | undefined) => {
    pickupData.setUsageType(v ?? undefined);
    void pickupData.fetchData();
  }, [pickupData]);

  const handlePickupDateRangeChange = useCallback((dates: [Dayjs, Dayjs] | null) => {
    pickupData.setDateRange(dates);
    void pickupData.fetchData();
  }, [pickupData]);

  return {
    handlePickupKeywordChange,
    handlePickupStatusChange,
    handlePickupTypeChange,
    handleUsageTypeChange,
    handlePickupDateRangeChange,
  };
}
