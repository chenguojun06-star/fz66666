import { useState, useEffect, useCallback, useRef } from 'react';
import { productionOrderApi } from '@/services/production/productionApi';
import type { FactoryCapacityItem, ProductionOrderStats } from '@/services/production/productionApi';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type {
  LivePulseResponse, HealthIndexResponse, SmartNotificationResponse,
  WorkerEfficiencyResponse, DefectHeatmapResponse, FactoryLeaderboardResponse,
  MaterialShortageResult, SelfHealingResponse, FactoryBottleneckItem,
  IntelligenceBrainSnapshotResponse, ActionCenterResponse,
} from '@/services/intelligence/intelligenceApi';
import type { ApiResult } from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import { useAuth } from '@/utils/AuthContext';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { WsMessage } from '@/hooks/useWebSocket';

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
  brain:        IntelligenceBrainSnapshotResponse | null;
  actionCenter: ActionCenterResponse | null;
  orders:       ProductionOrder[];
  factoryCapacity: FactoryCapacityItem[];
  productionStats: ProductionOrderStats | null;
  loading:      boolean;
  ts:           number;
}

const INITIAL: CockpitData = {
  pulse: null, health: null, notify: null, workers: null,
  heatmap: null, ranking: null, shortage: null, healing: null,
  bottleneck: null, brain: null, actionCenter: null,
  orders: [], factoryCapacity: [], productionStats: null, loading: true, ts: 0,
};

export function useCockpit() {
  const { user, isAuthenticated } = useAuth();
  const [data, setData] = useState<CockpitData>(INITIAL);

  const load = useCallback(async () => {
    setData(d => ({ ...d, loading: true }));
    const [rPulse, rHealth, rNotify, rWorkers, rHeatmap, rRanking, rShortage, rBottleneck, rOrders, rBrain, rActionCenter, rFactoryCap, rProductionStats] =
      await Promise.allSettled([
        intelligenceApi.getLivePulse(), intelligenceApi.getHealthIndex(),
        intelligenceApi.getSmartNotifications(), intelligenceApi.getWorkerEfficiency(),
        intelligenceApi.getDefectHeatmap(), intelligenceApi.getFactoryLeaderboard(),
        intelligenceApi.getMaterialShortage(),
        intelligenceApi.getFactoryBottleneck(),
        productionOrderApi.list({ pageSize: 200, excludeTerminal: true } as any),
        intelligenceApi.getBrainSnapshot(),
        intelligenceApi.getActionCenter(),
        productionOrderApi.getFactoryCapacity(),
        productionOrderApi.stats(),
      ]);
    const v = <T,>(r: PromiseSettledResult<{ code: number; data: T } | T>): T | null =>
      r.status === 'fulfilled' ? ((r.value as any)?.data ?? (r.value as T)) : null;
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
      heatmap: v(rHeatmap), ranking: v(rRanking), shortage: v(rShortage), healing: null,
      bottleneck: v(rBottleneck), brain: v(rBrain), actionCenter: v(rActionCenter),
      orders: orderResult.filter(o => !['completed', 'cancelled', 'scrapped'].includes(String(o.status || '').trim())),
      factoryCapacity: factoryCapResult,
      productionStats: productionStatsResult,
      loading: false, ts: Date.now(),
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  /* 10 秒快刷：仅更新实时脉搏 */
  const fetchPulseOnly = useCallback(async () => {
    try {
      const res: ApiResult<LivePulseResponse> = await intelligenceApi.getLivePulse();
      const newPulse = (res?.data ?? res) as LivePulseResponse;
      if (newPulse) setData(prev => ({ ...prev, pulse: newPulse }));
    } catch { /* silent */ }
  }, []);

  const pulseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    pulseIntervalRef.current = setInterval(fetchPulseOnly, 10_000);
    return () => {
      if (pulseIntervalRef.current) {
        clearInterval(pulseIntervalRef.current);
        pulseIntervalRef.current = null;
      }
    };
  }, [fetchPulseOnly]);

  /* WebSocket: 扫码事件 → todayScanQty 立刻跳 + 2s 防抖刷新工厂心跳 */
  const { subscribe } = useWebSocket({
    userId: user?.id,
    tenantId: user?.tenantId,
    enabled: isAuthenticated && !!user?.id,
  });
  const wsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribe('scan:realtime', (msg: WsMessage) => {
      const qty: number = (msg.payload as any)?.quantity ?? 0;
      if (qty > 0) {
        setData(prev => {
          if (!prev.pulse) return prev;
          return { ...prev, pulse: { ...prev.pulse, todayScanQty: prev.pulse.todayScanQty + qty } };
        });
      }
      if (wsDebounceRef.current) clearTimeout(wsDebounceRef.current);
      wsDebounceRef.current = setTimeout(() => fetchPulseOnly(), 2000);
    });
  }, [subscribe, fetchPulseOnly]);

  /* 每分钟本地递增 minutesSinceLastScan / minutesSilent */
  const minuteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    minuteIntervalRef.current = setInterval(() => {
      setData(prev => {
        if (!prev.pulse) return prev;
        return {
          ...prev,
          pulse: {
            ...prev.pulse,
            factoryActivity: (prev.pulse.factoryActivity ?? []).map(f => ({
              ...f,
              minutesSinceLastScan: f.minutesSinceLastScan + 1,
              active: (f.minutesSinceLastScan + 1) < 30,
            })),
            stagnantFactories: (prev.pulse.stagnantFactories ?? []).map(sf => ({
              ...sf,
              minutesSilent: sf.minutesSilent + 1,
            })),
          },
        };
      });
    }, 60_000);
    return () => {
      if (minuteIntervalRef.current) {
        clearInterval(minuteIntervalRef.current);
        minuteIntervalRef.current = null;
      }
    };
  }, []);

  return { data, reload: load };
}
