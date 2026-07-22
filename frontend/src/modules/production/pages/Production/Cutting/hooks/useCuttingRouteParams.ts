import { useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';

export function useCuttingRouteParams() {
  const params = useParams();
  const location = useLocation();

  const routeOrderNo = useMemo(() => {
    const raw = String(params?.orderNo || '').trim();
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [params]);

  const isEntryPage = Boolean(routeOrderNo);

  const autoPrintBundleIds = useMemo(() => {
    const search = new URLSearchParams(location.search);
    return String(search.get('bundleIds') || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }, [location.search]);

  const autoPrintEnabled = useMemo(() => {
    const search = new URLSearchParams(location.search);
    return search.get('autoPrint') === '1';
  }, [location.search]);

  return {
    routeOrderNo,
    isEntryPage,
    autoPrintBundleIds,
    autoPrintEnabled,
    location,
  };
}
