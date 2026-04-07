import { useState, useEffect } from 'react';
import api from '@/utils/api';

interface TodayBrief {
  todayOrderCount: number;
  todayOrderQuantity: number;
  todayInboundCount: number;
  todayInboundQuantity: number;
  todayOutboundCount: number;
  todayOutboundQuantity: number;
}

const defaultBrief: TodayBrief = {
  todayOrderCount: 0, todayOrderQuantity: 0,
  todayInboundCount: 0, todayInboundQuantity: 0,
  todayOutboundCount: 0, todayOutboundQuantity: 0,
};

export function useTodayBrief(): TodayBrief {
  const [brief, setBrief] = useState<TodayBrief>(defaultBrief);

  useEffect(() => {
    const ac = new AbortController();
    (api.get('/dashboard/daily-brief', { signal: ac.signal }) as Promise<any>)
      .then((res: any) => {
        const d = res?.data ?? res;
        if (d) {
          setBrief({
            todayOrderCount: Number(d.todayOrderCount ?? 0),
            todayOrderQuantity: Number(d.todayOrderQuantity ?? 0),
            todayInboundCount: Number(d.todayInboundCount ?? 0),
            todayInboundQuantity: Number(d.todayInboundQuantity ?? 0),
            todayOutboundCount: Number(d.todayOutboundCount ?? 0),
            todayOutboundQuantity: Number(d.todayOutboundQuantity ?? 0),
          });
        }
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  return brief;
}
