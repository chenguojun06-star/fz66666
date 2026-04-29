/**
 * useKpiMetrics — KPI 指标计算、增量 delta、历史趋势、风险分组。
 *
 * 从 IntelligenceCenter/index.tsx 抽取，减少主文件逻辑耦合。
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CockpitData } from '../hooks/useCockpit';
import type { KpiMetricSnapshot, KpiHistoryStore } from '../kpiTypes';
import { EMPTY_KPI_METRICS, EMPTY_KPI_HISTORY, KPI_HISTORY_WINDOW_MS } from '../kpiTypes';
import { useTimerManager } from './useTimerManager';

export function useKpiMetrics(data: CockpitData) {
  const navigate = useNavigate();
  const timers = useTimerManager();
  const { pulse, health, notify, workers: _workers, heatmap: _heatmap, ranking, shortage, healing, bottleneck, orders, factoryCapacity, productionStats } = data;

  const [kpiFlash, setKpiFlash] = useState(false);
  const [kpiDelta, setKpiDelta] = useState<KpiMetricSnapshot>(EMPTY_KPI_METRICS);
  const [kpiHistory, setKpiHistory] = useState<KpiHistoryStore>(EMPTY_KPI_HISTORY);
  const prevKpiMetricsRef = useRef<KpiMetricSnapshot | null>(null);

  /* KPI 刷新闪光 */
  useEffect(() => {
    if (!data.ts) return;
    setKpiFlash(true);
    timers.setTimeout('kpi-flash', 900, () => setKpiFlash(false));
  }, [data.ts, timers]);

  /* 工厂产能 Map */
  const factoryCapMap = useMemo(() => {
    const m = new Map<string, { totalOrders: number; totalQuantity: number }>();
    (factoryCapacity ?? []).forEach(f => m.set(f.factoryName, { totalOrders: f.totalOrders, totalQuantity: f.totalQuantity }));
    return m;
  }, [factoryCapacity]);

  /* 当前 KPI 快照 */
  const currentKpiMetrics = useMemo<KpiMetricSnapshot>(() => ({
    todayScanQty: Number(pulse?.todayScanQty) || 0,
    scanRatePerHour: Number(pulse?.scanRatePerHour) || 0,
    activeFactories: Number(pulse?.activeFactories) || 0,
    activeWorkers: Number(pulse?.activeWorkers) || 0,
    healthIndex: Number(health?.healthIndex) || 0,
    stagnantFactories: Number(pulse?.stagnantFactories?.length) || 0,
    shortageItems: Number(shortage?.shortageItems?.length) || 0,
    pendingNotify: Number(notify?.pendingCount) || 0,
    sentToday: Number(notify?.sentToday) || 0,
    totalFactories: Math.max(Number(pulse?.factoryActivity?.length) || 0, Number(ranking?.rankings?.length) || 0),
    productionOrderCount: Number(productionStats?.activeOrders ?? (orders ?? []).filter(o => {
      const s = String(o.status || '').toUpperCase();
      return s !== 'COMPLETED' && s !== 'CANCELLED' && s !== 'DRAFT' && s !== 'SCRAPPED';
    }).length),
  }), [health?.healthIndex, notify?.pendingCount, notify?.sentToday, orders, productionStats?.activeOrders, pulse?.activeFactories, pulse?.activeWorkers, pulse?.factoryActivity?.length, pulse?.scanRatePerHour, pulse?.stagnantFactories, pulse?.todayScanQty, ranking?.rankings?.length, shortage?.shortageItems]);

  /* delta & history 更新 */
  useEffect(() => {
    const prev = prevKpiMetricsRef.current;
    const nowTs = Date.now();
    if (!prev) {
      prevKpiMetricsRef.current = currentKpiMetrics;
      const init = {} as KpiHistoryStore;
      (Object.keys(currentKpiMetrics) as Array<keyof KpiMetricSnapshot>).forEach(k => {
        init[k] = [{ ts: nowTs, value: currentKpiMetrics[k] }];
      });
      setKpiHistory(init);
      return;
    }
    const delta = {} as KpiMetricSnapshot;
    (Object.keys(currentKpiMetrics) as Array<keyof KpiMetricSnapshot>).forEach(k => {
      (delta as any)[k] = currentKpiMetrics[k] - prev[k];
    });
    setKpiDelta(delta);
    setKpiHistory(prevHistory => {
      const nextHistory = { ...prevHistory } as KpiHistoryStore;
      (Object.keys(currentKpiMetrics) as Array<keyof KpiMetricSnapshot>).forEach(key => {
        const prevSeries = prevHistory[key] || [];
        const lastPoint = prevSeries[prevSeries.length - 1];
        if (lastPoint && lastPoint.value === currentKpiMetrics[key] && nowTs - lastPoint.ts < 8_000) {
          nextHistory[key] = prevSeries.filter(point => nowTs - point.ts <= KPI_HISTORY_WINDOW_MS);
          return;
        }
        nextHistory[key] = [
          ...prevSeries,
          { ts: nowTs, value: currentKpiMetrics[key] },
        ].filter(point => nowTs - point.ts <= KPI_HISTORY_WINDOW_MS);
      });
      return nextHistory;
    });
    prevKpiMetricsRef.current = currentKpiMetrics;
  }, [currentKpiMetrics]);

  /* 格式化 delta 文本 */
  const formatDeltaText = useCallback((delta: number, suffix = '') => {
    if (delta === 0) return `0${suffix}`;
    return `${delta > 0 ? '+' : ''}${delta}${suffix}`;
  }, []);

  const renderDeltaBadge = useCallback((delta: number, options?: { flatText?: string; suffix?: string }) => {
    const flatText = options?.flatText ?? '持平';
    const suffix = options?.suffix ?? '';
    const tone = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    return (
      <span className={`c-kpi-delta ${tone}`}>
        {delta === 0 ? flatText : formatDeltaText(delta, suffix)}
      </span>
    );
  }, [formatDeltaText]);

  const getKpiTrend = useCallback((key: keyof KpiMetricSnapshot) => {
    return (kpiHistory[key] || []).map(point => point.value);
  }, [kpiHistory]);

  /* 最小工厂静默分钟 */
  const minFactorySilentMinutes = useMemo(() => {
    const activity = pulse?.factoryActivity || [];
    if (activity.length === 0) return null;
    return activity.reduce<number | null>((min, item) => {
      const value = Number(item.minutesSinceLastScan);
      if (!Number.isFinite(value)) return min;
      if (min === null) return value;
      return Math.min(min, value);
    }, null);
  }, [pulse?.factoryActivity]);

  /* 逾期 & 延期风险订单 */
  const overdueRisk = useMemo(() => {
    const overdue: typeof orders = [];
    const highRisk: typeof orders = [];
    const watch: typeof orders = [];
    for (const o of orders) {
      const prog = Number(o.productionProgress) || 0;
      const isUrgentOrder = String((o as any)?.urgencyLevel || '').trim().toLowerCase() === 'urgent';
      const daysLeft = o.plannedEndDate
        ? Math.ceil((new Date(o.plannedEndDate).getTime() - Date.now()) / 86400000)
        : null;
      if (daysLeft !== null && daysLeft < 0) overdue.push(o);
      else if (daysLeft !== null && daysLeft <= 7 && prog < 50) highRisk.push(o);
      else if (isUrgentOrder && daysLeft !== null && daysLeft <= 14 && prog < 30) watch.push(o);
    }
    return { overdue, highRisk, watch };
  }, [orders]);

  /* 订单量汇总 */
  const orderStats = useMemo(() => ({
    totalQty: Number(productionStats?.activeQuantity ?? orders.reduce((s, o) => s + (Number(o.orderQuantity) || 0), 0)),
    overdueQty: overdueRisk.overdue.reduce((s, o) => s + (Number(o.orderQuantity) || 0), 0),
    highRiskQty: overdueRisk.highRisk.reduce((s, o) => s + (Number(o.orderQuantity) || 0), 0),
    watchQty: overdueRisk.watch.reduce((s, o) => s + (Number(o.orderQuantity) || 0), 0),
  }), [orders, overdueRisk, productionStats?.activeQuantity]);

  /* 工厂卡点 */
  const factoryBottleneck = bottleneck ?? [];

  /* 派生警报数量 */
  const alertCount = (pulse?.stagnantFactories?.length ?? 0) + (shortage?.shortageItems?.length ?? 0);
  const healWarnCount = healing?.items?.filter(i => i.status !== 'OK' && !i.autoFixed).length ?? 0;
  const totalWarn = alertCount + healWarnCount + (notify?.pendingCount ?? 0);

  /* 跑马灯 */
  const tickerItems = useMemo(() => {
    const items: Array<{ orderNo: string; text: string; level: 'danger' | 'warning' }> = [];
    overdueRisk.overdue.forEach(o => {
      const d = o.plannedEndDate ? Math.abs(Math.ceil((new Date(o.plannedEndDate).getTime() - Date.now()) / 86400000)) : 0;
      items.push({
        orderNo: String(o.orderNo || '').trim(),
        text: ` ${o.orderNo} · ${o.factoryName ?? '—'} · 已逾期 ${d} 天 · 进度 ${Number(o.productionProgress) || 0}%`,
        level: 'danger',
      });
    });
    overdueRisk.highRisk.forEach(o => {
      const d = o.plannedEndDate ? Math.ceil((new Date(o.plannedEndDate).getTime() - Date.now()) / 86400000) : 0;
      items.push({
        orderNo: String(o.orderNo || '').trim(),
        text: ` ${o.orderNo} · ${o.factoryName ?? '—'} · 剩 ${d} 天 · 进度 ${Number(o.productionProgress) || 0}%`,
        level: 'warning',
      });
    });
    return items;
  }, [overdueRisk]);

  const handleTickerClick = useCallback((orderNo: string) => {
    const safeOrderNo = String(orderNo || '').trim();
    if (!safeOrderNo) return;
    navigate(`/production/progress-detail?orderNo=${encodeURIComponent(safeOrderNo)}`);
  }, [navigate]);

  return {
    kpiFlash, kpiDelta, kpiHistory, currentKpiMetrics,
    factoryCapMap,
    formatDeltaText, renderDeltaBadge, getKpiTrend,
    minFactorySilentMinutes,
    overdueRisk, orderStats, factoryBottleneck,
    alertCount, healWarnCount, totalWarn,
    tickerItems, handleTickerClick,
  };
}
