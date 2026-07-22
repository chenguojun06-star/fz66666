import { useCallback, useEffect, useState } from 'react';
import { savePageSize } from '@/utils/pageSizeStore';
import { StyleInfo } from '@/types/style';
import { StyleQueryParams } from '@/types/style';
import { StyleSmartFilter } from './useStyleListData';

interface UseStyleListPageParams {
  smartFilter: StyleSmartFilter;
  setSmartFilter: React.Dispatch<React.SetStateAction<StyleSmartFilter>>;
  queryParams: StyleQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<StyleQueryParams>>;
  setPendingFocusStyleId: React.Dispatch<React.SetStateAction<string | null>>;
  setFocusedStyleId: React.Dispatch<React.SetStateAction<string | null>>;
  getStyleDomKey: (record: Partial<StyleInfo> | null | undefined) => string;
}

export const useStyleListPage = ({
  smartFilter,
  setSmartFilter,
  queryParams,
  setQueryParams,
  setPendingFocusStyleId,
  setFocusedStyleId,
  getStyleDomKey,
}: UseStyleListPageParams) => {
  const [costDetailVisible, setCostDetailVisible] = useState(false);

  useEffect(() => {
    if (smartFilter === 'all') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSmartFilter('all');
        setPendingFocusStyleId(null);
        setFocusedStyleId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [smartFilter, setPendingFocusStyleId, setFocusedStyleId, setSmartFilter]);

  const handleSmartFilterClick = useCallback(
    (target: Exclude<StyleSmartFilter, 'all'>, records: StyleInfo[]) => {
      if (smartFilter === target) {
        setSmartFilter('all');
        setPendingFocusStyleId(null);
        setFocusedStyleId(null);
        return;
      }
      setSmartFilter(target);
      setQueryParams((prev) => ({ ...prev, page: 1 }));
      setPendingFocusStyleId(getStyleDomKey(records[0]));
    },
    [getStyleDomKey, smartFilter, setQueryParams, setPendingFocusStyleId, setFocusedStyleId, setSmartFilter]
  );

  const handlePageChange = useCallback(
    (page: number, pageSize: number) => {
      if (pageSize !== queryParams.pageSize) {
        savePageSize(pageSize);
      }
      setQueryParams((prev) => ({
        ...prev,
        page: pageSize !== prev.pageSize ? 1 : page,
        pageSize,
      }));
    },
    [queryParams.pageSize, setQueryParams]
  );

  return {
    costDetailVisible,
    setCostDetailVisible,
    handleSmartFilterClick,
    handlePageChange,
  };
};
