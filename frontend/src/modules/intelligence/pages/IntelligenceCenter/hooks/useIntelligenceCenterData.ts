import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '@/utils/AuthContext';
import { useDeviceCapability } from '@/hooks/useDeviceCapability';
import { useCockpit } from './useCockpit';
import { useKpiMetrics } from './useKpiMetrics';
import { useKpiPopovers } from '../KpiPopoverContent';
import { useRepairAction } from './useRepairAction';
import { useTodayBrief } from './useTodayBrief';
import { usePanelCollapse } from './usePanelCollapse';
import { useTimerManager } from './useTimerManager';

/**
 * 智能运营驾驶舱主组件业务逻辑聚合 Hook
 * - 统一管理 state / refs / effects / 计算属性 / 事件处理
 * - 主组件只需消费返回值并渲染子组件
 */
export const useIntelligenceCenterData = () => {
  const navigate = useNavigate();
  const { data, reload } = useCockpit();
  const { isSuperAdmin } = useUser();
  const { isLowEnd } = useDeviceCapability();

  const [countdown, setCountdown] = useState(30);
  const [now, setNow] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { repairing, repairResult, handleRepair } = useRepairAction(reload);
  const todayBrief = useTodayBrief();
  const { collapsedPanels, toggleCollapse } = usePanelCollapse();
  const timers = useTimerManager();

  const rootRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef(new Date());
  const countdownRef = useRef(30);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setSearchParams({}, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fsChange);
    return () => {
      document.removeEventListener('fullscreenchange', fsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => {
    const refreshInterval = isLowEnd ? 60_000 : 1000;
    const refreshThreshold = isLowEnd ? 60 : 30;
    timers.setInterval({
      id: 'cockpit-countdown',
      interval: refreshInterval,
      callback: () => {
        nowRef.current = new Date();
        countdownRef.current -= 1;
        if (countdownRef.current <= 0) {
          reload();
          countdownRef.current = refreshThreshold;
          setNow(new Date());
          setCountdown(refreshThreshold);
        } else if (countdownRef.current % 5 === 0) {
          setNow(new Date());
        }
        setCountdown(countdownRef.current);
      },
    });
  }, [reload, timers, isLowEnd]);

  const handleReload = () => { reload(); setCountdown(30); };

  const {
    pulse, health, notify, workers, heatmap, ranking, shortage, healing,
    bottleneck: _bottleneck, orders, factoryCapacity,
  } = data;

  const {
    kpiFlash, kpiDelta, kpiHistory: _kpiHistory, currentKpiMetrics, factoryCapMap,
    formatDeltaText, renderDeltaBadge, getKpiTrend,
    minFactorySilentMinutes, overdueRisk, orderStats, factoryBottleneck,
    alertCount: _alertCount, healWarnCount: _healWarnCount, totalWarn, tickerItems, handleTickerClick,
  } = useKpiMetrics(data);

  const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
  const dateStr = now.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' });

  const { scanPop, factoryPop, healthPop, stagnantPop, shortagePop, notifyPop } = useKpiPopovers({ data, currentKpiMetrics, now });

  const heatmapCellMap = useMemo(() => {
    const m = new Map<string, NonNullable<typeof heatmap>['cells'][number]>();
    (heatmap?.cells || []).forEach(c => m.set(`${c.process}|${c.factory}`, c));
    return m;
  }, [heatmap?.cells]);

  const factoryCapTotals = useMemo(() => ({
    totalOrders: (factoryCapacity || []).reduce((s: number, f: any) => s + f.totalOrders, 0),
    totalQuantity: (factoryCapacity || []).reduce((s: number, f: any) => s + f.totalQuantity, 0),
  }), [factoryCapacity]);

  return {
    navigate,
    rootRef,
    data,
    reload,
    isSuperAdmin,
    isLowEnd,
    isFullscreen,
    countdown,
    now,
    timeStr,
    dateStr,
    repairing,
    repairResult,
    handleRepair,
    todayBrief,
    collapsedPanels,
    toggleCollapse,
    pulse,
    health,
    notify,
    workers,
    heatmap,
    ranking,
    shortage,
    healing,
    orders,
    factoryCapacity,
    kpiFlash,
    kpiDelta,
    currentKpiMetrics,
    factoryCapMap,
    factoryCapTotals,
    formatDeltaText,
    renderDeltaBadge,
    getKpiTrend,
    minFactorySilentMinutes,
    overdueRisk,
    orderStats,
    factoryBottleneck,
    totalWarn,
    tickerItems,
    handleTickerClick,
    scanPop,
    factoryPop,
    healthPop,
    stagnantPop,
    shortagePop,
    notifyPop,
    heatmapCellMap,
    handleReload,
    toggleFullscreen,
  };
};
