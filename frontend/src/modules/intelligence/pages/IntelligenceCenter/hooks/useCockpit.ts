import { useState, useEffect, useCallback, useRef } from 'react';
import { productionOrderApi } from '@/services/production/productionApi';
import type { FactoryCapacityItem, ProductionOrderStats } from '@/services/production/productionApi';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type {
  LivePulseResponse, HealthIndexResponse, SmartNotificationResponse,
  WorkerEfficiencyResponse, DefectHeatmapResponse, FactoryLeaderboardResponse,
  MaterialShortageResult, SelfHealingResponse, FactoryBottleneckItem,
} from '@/services/intelligence/intelligenceApi';
import type { ApiResult } from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import { useUser, useAuthState } from '@/utils/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { WsMessage } from '@/hooks/useWebSocket';
import { useTimerManager } from './useTimerManager';

export interface CockpitData {
  pulse:        LivePulseResponse | null;
  health:       HealthIndexResponse | null;
  notify:       SmartNotificationResponse | null;
  workers:      WorkerEfficiencyResponse | null;
  heatmap:      DefectHeatmapResponse | null;
  ranking:      FactoryLeaderboardResponse | null;
  shortage:     MaterialShortageResult | null;
  healing:      SelfHealingResponse | null;
  bottleneck:   FactoryBottleneckItem[] | null;
  orders:       ProductionOrder[];
  factoryCapacity: FactoryCapacityItem[];
  productionStats: ProductionOrderStats | null;
  loading:      boolean;
  ts:           number;
}

const INITIAL: CockpitData = {
  pulse: null, health: null, notify: null, workers: null,
  heatmap: null, ranking: null, shortage: null, healing: null,
  bottleneck: null, orders: [], factoryCapacity: [], productionStats: null, loading: true, ts: 0,
};

export function useCockpit() {
  const { user } = useUser();
  const { isAuthenticated } = useAuthState();
  const [data, setData] = useState<CockpitData>(INITIAL);
  const timers = useTimerManager();

  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setData(d => ({ ...d, loading: true }));

    const v = <T,>(r: PromiseSettledResult<{ code: number; data: T } | T>): T | null =>
      r.status === 'fulfilled' ? ((r.value as any)?.data ?? (r.value as T)) : null;

    const [rPulse, rHealth, rNotify, rWorkers, rOrders, rFactoryCap, rProductionStats] =
      await Promise.allSettled([
        intelligenceApi.getLivePulse(), intelligenceApi.getHealthIndex(),
        intelligenceApi.getSmartNotifications(), intelligenceApi.getWorkerEfficiency(),
        productionOrderApi.list({ page: 1, pageSize: 500, excludeTerminal: true }),
        productionOrderApi.getFactoryCapacity(),
        productionOrderApi.stats(),
      ]);

    const orderResult: ProductionOrder[] = rOrders.status === 'fulfilled'
      ? ((rOrders.value as any)?.data?.records ?? (rOrders.value as any)?.records ?? [])
      : [];
    const factoryCapResult: FactoryCapacityItem[] = rFactoryCap.status === 'fulfilled'
      ? ((rFactoryCap.value as any)?.data ?? [])
      : [];
    const productionStatsResult: ProductionOrderStats | null = rProductionStats.status === 'fulfilled'
      ? (((rProductionStats.value as any)?.data ?? null) as ProductionOrderStats | null)
      : null;

    setData({
      pulse: v(rPulse), health: v(rHealth), notify: v(rNotify), workers: v(rWorkers),
      heatmap: null, ranking: null, shortage: null, healing: null,
      bottleneck: null,
      orders: orderResult.filter(o => !['completed', 'cancelled', 'scrapped', 'archived', 'closed'].includes(String(o.status || '').trim())),
      factoryCapacity: factoryCapResult,
      productionStats: productionStatsResult,
      loading: false, ts: Date.now(),
    });
    loadingRef.current = false;

    const [rHeatmap, rRanking, rShortage, rHealing, rBottleneck] =
      await Promise.allSettled([
        intelligenceApi.getDefectHeatmap(), intelligenceApi.getFactoryLeaderboard(),
        intelligenceApi.getMaterialShortage(),
        intelligenceApi.runSelfHealing(),
        intelligenceApi.getFactoryBottleneck(),
      ]);

    setData(prev => ({
      ...prev,
      heatmap: v(rHeatmap), ranking: v(rRanking), shortage: v(rShortage),
      healing: v(rHealing), bottleneck: v(rBottleneck),
    }));
  }, []);

  useEffect(() => { load(); }, [load]);

  /* 10 秒快刷：仅更新实时脉搏 */
  const fetchPulseOnly = useCallback(async () => {
    if (loadingRef.current) return;
    try {
      const res: ApiResult<LivePulseResponse> = await intelligenceApi.getLivePulse();
      const newPulse = (res?.data ?? res) as LivePulseResponse;
      if (newPulse) setData(prev => ({ ...prev, pulse: newPulse }));
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    timers.setInterval({
      id: 'cockpit-pulse',
      interval: 15_000,
      callback: fetchPulseOnly,
    });
  }, [fetchPulseOnly, timers]);

  /* WebSocket: 扫码事件 → todayScanQty 立刻跳 + 2s 防抖刷新工厂心跳 */
  const { subscribe } = useWebSocket({
    userId: user?.id,
    tenantId: user?.tenantId,
    enabled: isAuthenticated && !!user?.id,
    token: localStorage.getItem('authToken') ?? '',
  });

  useEffect(() => {
    return subscribe('scan:realtime', (msg: WsMessage) => {
      const qty: number = (msg.payload as any)?.quantity ?? 0;
      if (qty > 0) {
        setData(prev => {
          if (!prev.pulse) return prev;
          const newQty = prev.pulse.todayScanQty + qty;
          if (newQty === prev.pulse.todayScanQty) return prev;
          return { ...prev, pulse: { ...prev.pulse, todayScanQty: newQty } };
        });
      }
      timers.setTimeout('cockpit-ws-debounce', 3000, () => fetchPulseOnly());
    });
  }, [subscribe, fetchPulseOnly, timers]);

  /* 每分钟本地递增 minutesSinceLastScan / minutesSilent */
  useEffect(() => {
    timers.setInterval({
      id: 'cockpit-minute-tick',
      interval: 60_000,
      callback: () => {
        setData(prev => {
          if (!prev.pulse) return prev;
          const updatedFactory = (prev.pulse.factoryActivity ?? []).map(f => ({
            ...f,
            minutesSinceLastScan: f.minutesSinceLastScan + 1,
            active: (f.minutesSinceLastScan + 1) < 30,
          }));
          const updatedStagnant = (prev.pulse.stagnantFactories ?? []).map(sf => ({
            ...sf,
            minutesSilent: sf.minutesSilent + 1,
          }));
          const changed =
            updatedFactory.some((f, i) => f.minutesSinceLastScan !== prev.pulse!.factoryActivity?.[i]?.minutesSinceLastScan) ||
            updatedStagnant.some((sf, i) => sf.minutesSilent !== prev.pulse!.stagnantFactories?.[i]?.minutesSilent);
          if (!changed) return prev;
          return {
            ...prev,
            pulse: { ...prev.pulse, factoryActivity: updatedFactory, stagnantFactories: updatedStagnant },
          };
        });
      },
    });
  }, [timers]);

  return { data, reload: load };
}
