import { useState, useCallback, useEffect, useRef } from 'react';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { BottleneckItem } from '@/services/intelligence/intelligenceApi';
import type { ProductionOrder } from '@/types/production';

export function useBottleneckBanner(orders: ProductionOrder[]) {
  const [bottleneckItems, setBottleneckItems] = useState<BottleneckItem[]>([]);
  const [bottleneckBannerVisible, setBottleneckBannerVisible] = useState(false);
  const bottleneckFetched = useRef(false);

  const fetchBottleneck = useCallback(async () => {
    if (bottleneckFetched.current) return;
    bottleneckFetched.current = true;
    try {
      const res = await intelligenceApi.detectBottleneck() as any;
      const detection = res?.data ?? res;
      const items: BottleneckItem[] = detection?.items ?? [];
      const significant = items.filter((i: BottleneckItem) => i.severity === 'critical' || i.severity === 'warning');
      if (significant.length > 0) {
        setBottleneckItems(significant);
        setBottleneckBannerVisible(true);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (orders.length > 0) void fetchBottleneck();
  }, [orders.length]);

  return { bottleneckItems, bottleneckBannerVisible, setBottleneckBannerVisible };
}
