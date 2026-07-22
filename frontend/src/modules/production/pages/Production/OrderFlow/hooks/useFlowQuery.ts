import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

export function useFlowQuery() {
  const location = useLocation();

  const query = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      orderId: String(params.get('orderId') || '').trim(),
      orderNo: String(params.get('orderNo') || '').trim(),
      styleNo: String(params.get('styleNo') || '').trim(),
    };
  }, [location.search]);

  return query;
}
