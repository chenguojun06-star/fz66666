import React from 'react';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

type SetQueryParams = React.Dispatch<React.SetStateAction<any>>;

export const useProgressUrlParams = (
  setQueryParams: SetQueryParams,
  setFocusedOrderNos: (nos: string[]) => void,
  setPendingFocusNode: (node: { orderNo: string; nodeName: string } | null) => void,
  normalizeFocusNodeName: (name: string) => string,
  setSmartQueueFilter: (filter: 'all' | 'urgent' | 'behind' | 'stagnant' | 'overdue') => void,
) => {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleNo = String(params.get('styleNo') || '').trim();
    const orderNo = String(params.get('orderNo') || '').trim();
    const orderNos = String(params.get('orderNos') || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const mergedOrderNos = Array.from(new Set(orderNo ? [orderNo, ...orderNos] : orderNos));
    const focusNode = normalizeFocusNodeName(String(params.get('focusNode') || '').trim());
    setFocusedOrderNos(mergedOrderNos);
    const filterParam = String(params.get('filter') || '').trim();
    if (['overdue', 'urgent', 'behind', 'stagnant'].includes(filterParam)) {
      setSmartQueueFilter(filterParam as 'overdue' | 'urgent' | 'behind' | 'stagnant');
    }
    if (styleNo || orderNo || mergedOrderNos.length > 0) {
      setQueryParams((prev: any) => ({
        ...prev,
        page: 1,
        pageSize: mergedOrderNos.length > 0 ? 200 : prev.pageSize,
        styleNo: styleNo || prev.styleNo,
        keyword: mergedOrderNos.length > 0 ? undefined : (orderNo || prev.keyword),
      }));
    }
    if (orderNo && focusNode) {
      setPendingFocusNode({ orderNo, nodeName: focusNode });
    }
  }, [location.search, normalizeFocusNodeName, setQueryParams, setFocusedOrderNos, setPendingFocusNode, setSmartQueueFilter]);
};
