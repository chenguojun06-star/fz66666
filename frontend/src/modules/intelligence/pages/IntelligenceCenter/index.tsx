import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense, lazy } from 'react';
import { Tag, Tooltip, Popover, Spin } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ThunderboltOutlined, SyncOutlined, RobotOutlined,
  WarningOutlined, CheckCircleOutlined,
  FullscreenOutlined, FullscreenExitOutlined, SearchOutlined,
  DownOutlined, UpOutlined, AppstoreOutlined,
  EyeOutlined, EyeInvisibleOutlined,
} from '@ant-design/icons';
import { intelligenceApi as execApi } from '@/services/intelligenceApi';
import Layout from '@/components/Layout';
import ProfitDeliveryPanel from './ProfitDeliveryPanel';
import LiveScanFeed from './LiveScanFeed';
import AiExecutionPanel from '../../components/AiExecutionPanel';

/* ── 智能分析面板 — lazy 加载（11个） ── */
const DefectTracePanel = lazy(() => import('./DefectTracePanel'));
const SmartAssignmentPanel = lazy(() => import('./SmartAssignmentPanel'));
const WorkerProfilePanel = lazy(() => import('./WorkerProfilePanel'));
const RhythmDnaPanel = lazy(() => import('./RhythmDnaPanel'));
const SchedulingSuggestionPanel = lazy(() => import('./SchedulingSuggestionPanel'));
const MindPushPanel = lazy(() => import('./MindPushPanel'));
const LiveCostTrackerPanel = lazy(() => import('./LiveCostTrackerPanel'));
const LearningReportPanel = lazy(() => import('./LearningReportPanel'));
const FinanceAuditPanel = lazy(() => import('./FinanceAuditPanel'));
const StyleQuoteSuggestionPanel = lazy(() => import('./StyleQuoteSuggestionPanel'));
const SupplierScorecardPanel = lazy(() => import('./SupplierScorecardPanel'));
import {
  risk2color, grade2color, LiveDot, Sparkline,
  KpiPop, AnimatedNum, medalColor,
} from './components/IntelligenceWidgets';
import { OrderScrollPanel, AutoScrollBox, BottleneckRow } from './components/OrderScrollPanel';
import { useCockpit } from './hooks/useCockpit';
import GlobalSearchModal from './components/GlobalSearchModal';
import './styles.css';

type KpiMetricSnapshot = {
  todayScanQty: number;
  scanRatePerHour: number;
  activeFactories: number;
  activeWorkers: number;
  healthIndex: number;
  stagnantFactories: number;
  shortageItems: number;
  pendingNotify: number;
  sentToday: number;
  totalFactories: number;
  productionOrderCount: number;
};

type KpiHistoryPoint = {
  ts: number;
  value: number;
};

type KpiHistoryStore = Record<keyof KpiMetricSnapshot, KpiHistoryPoint[]>;

const EMPTY_KPI_METRICS: KpiMetricSnapshot = {
  todayScanQty: 0,
  scanRatePerHour: 0,
  activeFactories: 0,
  activeWorkers: 0,
  healthIndex: 0,
  stagnantFactories: 0,
  shortageItems: 0,
  pendingNotify: 0,
  sentToday: 0,
  totalFactories: 0,
  productionOrderCount: 0,
};

const EMPTY_KPI_HISTORY = (): KpiHistoryStore => ({
  todayScanQty: [],
  scanRatePerHour: [],
  activeFactories: [],
  activeWorkers: [],
  healthIndex: [],
  stagnantFactories: [],
  shortageItems: [],
  pendingNotify: [],
  sentToday: [],
  totalFactories: [],
  productionOrderCount: [],
});

const KPI_HISTORY_WINDOW_MS = 5 * 60 * 1000;

const IntelligenceCenter: React.FC = () => {
  const navigate = useNavigate();
  const { data, reload } = useCockpit();
  const [countdown, setCountdown]   = useState(30);
  const [now, setNow]               = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showAnalysisPanels, setShowAnalysisPanels] = useState(false);

  /* ── 每个分析面板独立显示/隐藏（localStorage 持久化） ── */
  const ANALYSIS_PANELS = useMemo(() => [
    { key: 'smartAssignment',    label: '智能派工' },
    { key: 'workerProfile',      label: '工人画像' },
    { key: 'scheduling',         label: '排产建议' },
    { key: 'rhythmDna',          label: '工序节奏DNA' },
    { key: 'liveCost',           label: '实时成本' },
    { key: 'defectTrace',        label: '缺陷追溯' },
    { key: 'financeAudit',       label: '财务审计' },
    { key: 'styleQuote',         label: '报价建议' },
    { key: 'supplierScorecard',  label: '供应商评分' },
    { key: 'learningReport',     label: '学习报告' },
    { key: 'mindPush',           label: '智能推送' },
  ] as const, []);

  const [visiblePanels, setVisiblePanels] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('intelligence_panel_visibility');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return Object.fromEntries(ANALYSIS_PANELS.map(p => [p.key, true]));
  });

  const togglePanel = useCallback((key: string) => {
    setVisiblePanels(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('intelligence_panel_visibility', JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleAllPanels = useCallback((show: boolean) => {
    setVisiblePanels(() => {
      const next = Object.fromEntries(ANALYSIS_PANELS.map(p => [p.key, show]));
      localStorage.setItem('intelligence_panel_visibility', JSON.stringify(next));
      return next;
    });
  }, [ANALYSIS_PANELS]);

  /* ── 主面板折叠/展开（localStorage 持久化） ── */
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('cockpit_main_panel_collapsed');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return {};
  });
  const toggleCollapse = useCallback((key: string) => {
    setCollapsedPanels(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('cockpit_main_panel_collapsed', JSON.stringify(next));
      return next;
    });
  }, []);

  const [executingTask, setExecutingTask] = useState<string | null>(null);
  const [executeTaskResult, setExecuteTaskResult] = useState<{ taskCode: string; ok: boolean; msg: string } | null>(null);
  const [kpiFlash, setKpiFlash] = useState(false);
  const [kpiDelta, setKpiDelta] = useState<KpiMetricSnapshot>(EMPTY_KPI_METRICS);
  const [kpiHistory, setKpiHistory] = useState<KpiHistoryStore>(EMPTY_KPI_HISTORY);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rootRef  = useRef<HTMLDivElement>(null);
  const prevKpiMetricsRef = useRef<KpiMetricSnapshot | null>(null);

  /* URL ?q= 参数：从生产页「问AI分析」或「催→AI」跳转时自动预填问题 */
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      // useSearchParams 已自动解码，无需再 decodeURIComponent（否则含 % 字符会 URIError）
      // setInlineQuery(q); // removed AI panel
      setSearchParams({}, { replace: true }); // 消费后清除 URL 参数，避免刷新重复触发
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* KPI 刷新闪光：data.ts 每次全量刷新完成后更新，触发各 KPI 卡短暂氖灯闪光 */
  useEffect(() => {
    if (!data.ts) return;
    setKpiFlash(true);
    const t = setTimeout(() => setKpiFlash(false), 900);
    return () => clearTimeout(t);
  }, [data.ts]);

  /* ⌘K / Ctrl+K：打开全局搜索 */
  useEffect(() => {
    const handleSearchKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handleSearchKey);
    return () => window.removeEventListener('keydown', handleSearchKey);
  }, []);

  /* 全屏：F 键切换 */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) {
          rootRef.current?.requestFullscreen?.();
          setIsFullscreen(true);
        } else {
          document.exitFullscreen?.();
          setIsFullscreen(false);
        }
      }
    };
    const fsChange = () => setIsFullscreen(!!document.fullscreenElement);
    window.addEventListener('keydown', handler);
    document.addEventListener('fullscreenchange', fsChange);
    return () => {
      window.removeEventListener('keydown', handler);
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

  /* 秒计时：倒计时 + 时钟 */
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setNow(new Date());
      setCountdown(c => { if (c <= 1) { reload(); return 30; } return c - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [reload]);

  const handleReload = () => { reload(); setCountdown(30); };

  const handleExecuteTask = useCallback(async (task: any) => {
    if (!task?.taskCode) return;
    setExecutingTask(task.taskCode);
    setExecuteTaskResult(null);
    try {
      const result = await execApi.executeCommand(task) as any;
      const ok = result?.status === 'SUCCESS' || result?.success === true || result?.code === 200;
      setExecuteTaskResult({ taskCode: task.taskCode, ok, msg: result?.message || (ok ? '执行成功' : '执行失败') });
      if (ok) reload();
    } catch (err: any) {
      setExecuteTaskResult({ taskCode: task.taskCode, ok: false, msg: err?.message || '执行失败' });
    } finally {
      setExecutingTask(null);
    }
  }, [reload]);

  const { pulse, health, notify, workers, heatmap, ranking, shortage, healing, bottleneck, orders, brain, actionCenter } = data;

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
    productionOrderCount: (orders ?? []).filter(o => {
      const s = String(o.status || '').toUpperCase();
      return s !== 'COMPLETED' && s !== 'CANCELLED' && s !== 'DRAFT';
    }).length,
  }), [health?.healthIndex, notify?.pendingCount, notify?.sentToday, orders, pulse?.activeFactories, pulse?.activeWorkers, pulse?.factoryActivity?.length, pulse?.scanRatePerHour, pulse?.stagnantFactories, pulse?.todayScanQty, ranking?.rankings?.length, shortage?.shortageItems]);

  useEffect(() => {
    const prev = prevKpiMetricsRef.current;
    const nowTs = Date.now();
    if (!prev) {
      prevKpiMetricsRef.current = currentKpiMetrics;
      setKpiHistory({
        todayScanQty: [{ ts: nowTs, value: currentKpiMetrics.todayScanQty }],
        scanRatePerHour: [{ ts: nowTs, value: currentKpiMetrics.scanRatePerHour }],
        activeFactories: [{ ts: nowTs, value: currentKpiMetrics.activeFactories }],
        activeWorkers: [{ ts: nowTs, value: currentKpiMetrics.activeWorkers }],
        healthIndex: [{ ts: nowTs, value: currentKpiMetrics.healthIndex }],
        stagnantFactories: [{ ts: nowTs, value: currentKpiMetrics.stagnantFactories }],
        shortageItems: [{ ts: nowTs, value: currentKpiMetrics.shortageItems }],
        pendingNotify: [{ ts: nowTs, value: currentKpiMetrics.pendingNotify }],
        sentToday: [{ ts: nowTs, value: currentKpiMetrics.sentToday }],
        totalFactories: [{ ts: nowTs, value: currentKpiMetrics.totalFactories }],
        productionOrderCount: [{ ts: nowTs, value: currentKpiMetrics.productionOrderCount }],
      });
      return;
    }
    setKpiDelta({
      todayScanQty: currentKpiMetrics.todayScanQty - prev.todayScanQty,
      scanRatePerHour: currentKpiMetrics.scanRatePerHour - prev.scanRatePerHour,
      activeFactories: currentKpiMetrics.activeFactories - prev.activeFactories,
      activeWorkers: currentKpiMetrics.activeWorkers - prev.activeWorkers,
      healthIndex: currentKpiMetrics.healthIndex - prev.healthIndex,
      stagnantFactories: currentKpiMetrics.stagnantFactories - prev.stagnantFactories,
      shortageItems: currentKpiMetrics.shortageItems - prev.shortageItems,
      pendingNotify: currentKpiMetrics.pendingNotify - prev.pendingNotify,
      sentToday: currentKpiMetrics.sentToday - prev.sentToday,
      totalFactories: currentKpiMetrics.totalFactories - prev.totalFactories,
      productionOrderCount: currentKpiMetrics.productionOrderCount - prev.productionOrderCount,
    });
    setKpiHistory((prevHistory) => {
      const nextHistory = { ...prevHistory } as KpiHistoryStore;
      (Object.keys(currentKpiMetrics) as Array<keyof KpiMetricSnapshot>).forEach((key) => {
        const prevSeries = prevHistory[key] || [];
        const lastPoint = prevSeries[prevSeries.length - 1];
        if (lastPoint && lastPoint.value === currentKpiMetrics[key] && nowTs - lastPoint.ts < 8_000) {
          nextHistory[key] = prevSeries.filter((point) => nowTs - point.ts <= KPI_HISTORY_WINDOW_MS);
          return;
        }
        nextHistory[key] = [
          ...prevSeries,
          { ts: nowTs, value: currentKpiMetrics[key] },
        ].filter((point) => nowTs - point.ts <= KPI_HISTORY_WINDOW_MS);
      });
      return nextHistory;
    });
    prevKpiMetricsRef.current = currentKpiMetrics;
  }, [currentKpiMetrics]);

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
    return (kpiHistory[key] || []).map((point) => point.value);
  }, [kpiHistory]);

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

  /* ── 逾期 & 延期风险订单（纯前端推导，无需额外接口） ── */
  const overdueRisk = useMemo(() => {
    const overdue: typeof orders = [];
    const highRisk: typeof orders = [];
    const watch: typeof orders = [];
    for (const o of orders) {
      const prog = Number(o.productionProgress) || 0;
      const daysLeft = o.plannedEndDate
        ? Math.ceil((new Date(o.plannedEndDate).getTime() - Date.now()) / 86400000)
        : null;
      if (daysLeft !== null && daysLeft < 0)                        overdue.push(o);
      else if (daysLeft !== null && daysLeft <= 7 && prog < 50)     highRisk.push(o);
      else if (daysLeft !== null && daysLeft <= 14 && prog < 30)    watch.push(o);
    }
    return { overdue, highRisk, watch };
  }, [orders]);

  /* ── 订单量汇总：各风险分组总件数 ── */
  const orderStats = useMemo(() => ({
    totalQty:    orders.reduce((s, o) => s + (Number(o.orderQuantity) || 0), 0),
    overdueQty:  overdueRisk.overdue.reduce((s, o) => s + (Number(o.orderQuantity) || 0), 0),
    highRiskQty: overdueRisk.highRisk.reduce((s, o) => s + (Number(o.orderQuantity) || 0), 0),
    watchQty:    overdueRisk.watch.reduce((s, o) => s + (Number(o.orderQuantity) || 0), 0),
  }), [orders, overdueRisk]);

  /* ── 工厂卡点分析：来自后端真实扫码统计（替代旧的从未写入的 *CompletionRate 字段） ── */
  const factoryBottleneck = bottleneck ?? [];

  /* 派生警报数量 */
  const alertCount = (pulse?.stagnantFactories?.length ?? 0) + (shortage?.shortageItems?.length ?? 0);
  const healWarnCount = healing?.items?.filter(i => i.status !== 'OK' && !i.autoFixed).length ?? 0;
  const totalWarn = alertCount + healWarnCount + (notify?.pendingCount ?? 0);

  /* 格式化时钟 */
  const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
  const dateStr = now.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' });

  /* ── 跑马灯：紧急订单（预留，暂未渲染）── */
  const tickerItems = useMemo(() => {
    const items: Array<{ orderNo: string; text: string; level: 'danger' | 'warning' }> = [];
    overdueRisk.overdue.forEach(o => {
      const d = o.plannedEndDate ? Math.abs(Math.ceil((new Date(o.plannedEndDate).getTime() - Date.now()) / 86400000)) : 0;
      items.push({
        orderNo: String(o.orderNo || '').trim(),
        text: `⚠ ${o.orderNo} · ${o.factoryName ?? '—'} · 已逾期 ${d} 天 · 进度 ${Number(o.productionProgress)||0}%`,
        level: 'danger',
      });
    });
    overdueRisk.highRisk.forEach(o => {
      const d = o.plannedEndDate ? Math.ceil((new Date(o.plannedEndDate).getTime() - Date.now()) / 86400000) : 0;
      items.push({
        orderNo: String(o.orderNo || '').trim(),
        text: `🔴 ${o.orderNo} · ${o.factoryName ?? '—'} · 剩 ${d} 天 · 进度 ${Number(o.productionProgress)||0}%`,
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

  /* ── 各 KPI 卡片悬浮详情内容 ── */
  const hourNow = Math.max(now.getHours(), 1);
  const projectedToday = ((pulse?.scanRatePerHour ?? 0) * (24 - hourNow) + (pulse?.todayScanQty ?? 0));

  const scanPop = (
    <KpiPop
      title="今日扫码详情"
      items={[
        { label: '扫码总量',  value: `${pulse?.todayScanQty?.toLocaleString() ?? '—'} 件`, color: '#00e5ff' },
        { label: '实时速率',  value: `${pulse?.scanRatePerHour ?? '—'} 件/时` },
        { label: '在线员工',  value: `${pulse?.activeWorkers ?? '—'} 人` },
        { label: '活跃工厂',  value: `${pulse?.activeFactories ?? '—'} 家` },
        ...(pulse?.timeline?.length ? [{ label: '最新采样点', value: pulse.timeline[pulse.timeline.length - 1]?.time.slice(-5) }] : []),
      ]}
      aiTip={pulse ? `按当前速率，今日预计完成 ${projectedToday.toLocaleString()} 件` : undefined}
    />
  );

  const factoryPop = (
    <KpiPop
      title="工厂在线状态"
      items={[
        { label: '活跃工厂',  value: `${pulse?.activeFactories ?? '—'} 家`, color: '#39ff14' },
        { label: '在线员工',  value: `${pulse?.activeWorkers ?? '—'} 人` },
        { label: '停工预警',  value: `${pulse?.stagnantFactories?.length ?? 0} 家`, color: (pulse?.stagnantFactories?.length ?? 0) > 0 ? '#ff4136' : '#39ff14' },
        ...(ranking?.rankings?.slice(0, 3).map((r, i) => ({
          label: (['🥇 ', '🥈 ', '🥉 '][i] ?? '') + r.factoryName,
          value: `${r.totalScore} 分`,
          color: (['#ffd700', '#c0c0c0', '#cd7f32'][i] as string | undefined),
        })) ?? []),
      ]}
      aiTip="高产工厂建议持续跟踪，停工工厂建议立即联系确认"
    />
  );

  const healthPop = (
    <KpiPop
      title="供应链健康分析"
      items={[
        { label: '健康指数',  value: `${health?.healthIndex ?? '—'} 分`, color: grade2color(health?.grade ?? '') },
        { label: '评级',      value: `${health?.grade ?? '—'} 级`,       color: grade2color(health?.grade ?? '') },
        { label: '异常项目',  value: `${healing?.issuesFound ?? 0} 项`,  color: (healing?.issuesFound ?? 0) > 0 ? '#f7a600' : '#39ff14' },
        { label: '自愈健康',  value: `${healing?.healthScore ?? '—'} 分` },
      ]}
      aiTip={health?.grade === 'A' ? '系统运行优秀，继续保持' : health?.grade === 'B' ? '整体良好，关注预警项' : '建议立即处理异常，提升供应链健康'}
    />
  );

  const stagnantPop = (
    <KpiPop
      title="停工预警详情"
      items={pulse?.stagnantFactories?.length
        ? pulse.stagnantFactories.slice(0, 5).map(f => ({
            label: f.factoryName,
            value: `停滞 ${Math.floor(f.minutesSilent / 60)}h ${Math.round(f.minutesSilent % 60)}m`,
            color: '#ff4136',
          }))
        : [{ label: '状态', value: currentKpiMetrics.productionOrderCount > 0 && currentKpiMetrics.activeFactories === 0
            ? '无工厂活跃，生产可能停滞' : '所有工厂正常运转',
            color: currentKpiMetrics.productionOrderCount > 0 && currentKpiMetrics.activeFactories === 0 ? '#f7a600' : '#39ff14' }]}
      warning={(pulse?.stagnantFactories?.length ?? 0) > 0 ? '建议 15 分钟内联系工厂确认原因'
        : currentKpiMetrics.productionOrderCount > 0 && currentKpiMetrics.activeFactories === 0 ? `有 ${currentKpiMetrics.productionOrderCount} 单在制但无工厂生产动态，建议检查工厂状态` : undefined}
      aiTip={(pulse?.stagnantFactories?.length ?? 0) > 0
        ? `${pulse!.stagnantFactories.length} 家工厂停工，订单交付风险上升，建议立即介入`
        : currentKpiMetrics.productionOrderCount > 0 && currentKpiMetrics.activeFactories === 0
          ? `当前 ${currentKpiMetrics.productionOrderCount} 单在制但无活跃工厂，生产节拍异常，建议检查`
          : '停工率 0%，生产节拍正常，供应链健康'}
    />
  );

  const shortagePop = (
    <KpiPop
      title="面料缺口预警"
      items={shortage?.shortageItems?.length
        ? shortage.shortageItems.slice(0, 5).map(item => ({
            label: item.materialName,
            value: `缺 ${item.shortageQuantity} ${item.unit}`,
            color: risk2color(item.riskLevel),
          }))
        : [{ label: '状态', value: '所有面辅料库存充足', color: '#39ff14' }]}
      warning={(shortage?.shortageItems?.length ?? 0) > 0 ? (shortage?.summary ?? undefined) : undefined}
      aiTip={(shortage?.shortageItems?.length ?? 0) > 0
        ? 'HIGH 级缺料将影响 3 天内生产，建议立即下补采购单'
        : '面辅料储备率良好，暂无补单压力'}
    />
  );

  const notifyPop = (
    <KpiPop
      title="智能通知概况"
      items={[
        { label: '待发送', value: `${notify?.pendingCount ?? '—'} 条`, color: '#a78bfa' },
        { label: '今日已发', value: `${notify?.sentToday ?? 0} 条` },
        { label: '通知命中率', value: notify?.sentToday
          ? `${Math.round(Math.min(100, ((notify.sentToday) / Math.max(notify.sentToday + (notify.pendingCount ?? 0), 1)) * 100))}%`
          : '—' },
      ]}
      aiTip={`待处理 ${notify?.pendingCount ?? 0} 条，建议及时下发确保工厂按时接收指令`}
    />
  );

  /* 面板折叠按钮（chevron 图标，放在 c-card-title 末尾） */
  const CollapseChevron = ({ panelKey }: { panelKey: string }) => (
    <span
      style={{ marginLeft: 'auto', cursor: 'pointer', color: collapsedPanels[panelKey] ? '#a78bfa' : '#5a7a9a', fontSize: 12, padding: '0 4px', display: 'inline-flex', alignItems: 'center', flexShrink: 0, userSelect: 'none' }}
      title={collapsedPanels[panelKey] ? '展开面板' : '收起面板'}
    >
      {collapsedPanels[panelKey] ? <DownOutlined /> : <UpOutlined />}
    </span>
  );

  return (
    <Layout>
      <div className={`cockpit-root${isFullscreen ? ' cockpit-fullscreen' : ''}`} ref={rootRef}>

        {/* ╔══════════════════════════════════════════════╗
            ║   顶栏  标题 · 时钟 · 系统状态 · 刷新      ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-header">
          {/* 左：LIVE + 标题 */}
          <div className="cockpit-header-left">
            <LiveDot size={10} />
            <span className="cockpit-badge-live">LIVE</span>
            <ThunderboltOutlined style={{ color: '#00e5ff', fontSize: 18 }} />
            <span className="cockpit-title">智能运营驾驶舱</span>
            <span className="cockpit-subtitle">全链路实时指挥 · AI 决策引擎</span>
          </div>

          {/* 中：实时时钟 */}
          <div className="cockpit-clock">
            <span className="cockpit-time">{timeStr}</span>
            <span className="cockpit-date">{dateStr}</span>
          </div>

          {/* 右：告警数 + 系统状态 + 刷新 */}
          <div className="cockpit-header-right">
            {totalWarn > 0
              ? <span className="cockpit-alert-badge">
                  <WarningOutlined />
                  {totalWarn} 项预警
                </span>
              : <span className="cockpit-ok-badge">
                  <CheckCircleOutlined />
                  系统正常
                </span>
            }
            <Tooltip title={`${countdown}s 后自动刷新`}>
              <button className="cockpit-refresh-btn" onClick={handleReload} disabled={data.loading}>
                <SyncOutlined spin={data.loading} />
                {data.loading ? '加载中' : `${countdown}s`}
              </button>
            </Tooltip>
            <Tooltip title="⌘K 全局搜索">
              <button className="cockpit-fs-btn" onClick={() => setShowSearch(true)} style={{ marginRight: 4 }}>
                <SearchOutlined />
              </button>
            </Tooltip>
            <Tooltip title={isFullscreen ? '退出全屏 (F)' : '全屏投屏 (F)'}>
              <button className="cockpit-fs-btn" onClick={toggleFullscreen}>
                {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* 刷新倒计时进度条：从 100% 线性消耗到 0%，reload 后复位 */}
        <div className="cockpit-refresh-bar">
          <div className="cockpit-refresh-bar-fill" style={{ width: `${(countdown / 30) * 100}%` }} />
        </div>

        {/* 紧急预警跑马灯：逾期 & 高风险订单滚动提示（有数据时才渲染） */}
        {tickerItems.length > 0 && (
          <div className="cockpit-ticker">
            <span className="cockpit-ticker-label">⚠ 紧急预警</span>
            <div className="cockpit-ticker-track">
              <div className="cockpit-ticker-inner"
                style={{ animationDuration: `${Math.max(12, tickerItems.length * 5)}s` }}>
                {[...tickerItems, ...tickerItems].map((item, i) => (
                  <button
                    key={`${item.orderNo}-${i}`}
                    type="button"
                    className={`cockpit-ticker-item ${item.level}`}
                    onClick={() => handleTickerClick(item.orderNo)}
                    title={`点击查看 ${item.orderNo} 生产进度`}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ╔══════════════════════════════════════════════╗
            ║   第一行：6 大核心 KPI 闪光数字卡            ║
            ╚══════════════════════════════════════════════╝ */}
        <div className={`cockpit-grid-6${kpiFlash ? ' kpi-flash' : ''}`}>

          {/* 今日生产扫码量 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={scanPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className="c-card c-kpi c-kpi-hoverable">
            <div className="c-kpi-label"><LiveDot size={7} />今日扫码量</div>
            <div className="c-kpi-val cyan neon-cyan"><AnimatedNum val={pulse?.todayScanQty?.toLocaleString() ?? '—'} /></div>
            <div className="c-kpi-unit">件</div>
            <div className="c-kpi-sub">速率&nbsp;<b style={{ color: '#00e5ff' }}><AnimatedNum val={pulse?.scanRatePerHour ?? '—'} /></b>&nbsp;件/时</div>
            <div className="c-kpi-delta-row">
              {renderDeltaBadge(kpiDelta.todayScanQty, { flatText: '本轮无新增', suffix: '件' })}
              <span className="c-kpi-delta-note">速率 {formatDeltaText(kpiDelta.scanRatePerHour, '/h')}</span>
            </div>
            <div className="c-kpi-history-wrap">
              <Sparkline pts={getKpiTrend('todayScanQty')} color="#00e5ff" width={88} height={22} />
              <span className="c-kpi-history-label">5分钟趋势</span>
            </div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 活跃工厂 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={factoryPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className={`c-card c-kpi c-kpi-hoverable ${currentKpiMetrics.activeFactories === 0 && currentKpiMetrics.productionOrderCount > 0 ? 'c-kpi-danger' : ''}`}>
            <div className="c-kpi-label">
              <LiveDot size={7} color={currentKpiMetrics.activeFactories === 0 && currentKpiMetrics.productionOrderCount > 0 ? '#ff4136' : undefined} />
              活跃工厂
            </div>
            <div className="c-kpi-val" style={currentKpiMetrics.activeFactories === 0 && currentKpiMetrics.productionOrderCount > 0 ? { color: '#ff4136' } : { color: '#39ff14' }}>
              <AnimatedNum val={pulse?.activeFactories ?? '—'} />
            </div>
            <div className="c-kpi-unit">家</div>
            <div className="c-kpi-sub">
              {currentKpiMetrics.activeFactories === 0 && currentKpiMetrics.productionOrderCount > 0
                ? <span style={{ color: '#ff4136' }}>⚠️ 全部离线·{currentKpiMetrics.productionOrderCount}单在制</span>
                : <>员工&nbsp;<b style={{ color: '#39ff14' }}><AnimatedNum val={pulse?.activeWorkers ?? '—'} /></b>&nbsp;人在线</>}
            </div>
            <div className="c-kpi-delta-row">
              {currentKpiMetrics.activeFactories === 0 && currentKpiMetrics.productionOrderCount > 0
                ? <span className="c-kpi-delta down">生产停滞</span>
                : renderDeltaBadge(kpiDelta.activeFactories, { flatText: '工厂稳定', suffix: '家' })}
              <span className="c-kpi-delta-note">员工 {formatDeltaText(kpiDelta.activeWorkers, '人')}</span>
            </div>
            <div className="c-kpi-history-wrap">
              <Sparkline pts={getKpiTrend('activeFactories')} color="#39ff14" width={88} height={22} />
              <span className="c-kpi-history-label">5分钟趋势</span>
            </div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 供应链健康 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={healthPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className="c-card c-kpi c-kpi-hoverable">
            <div className="c-kpi-label"><LiveDot size={7} color={grade2color(health?.grade ?? '')} />供应链健康</div>
            <div className="c-kpi-val" style={{ color: grade2color(health?.grade ?? ''), textShadow: `0 0 18px ${grade2color(health?.grade ?? '')}88` }}>
              <AnimatedNum val={health?.healthIndex ?? '—'} />
            </div>
            <div className="c-kpi-unit">分</div>
            <div className="c-kpi-sub">等级&nbsp;<b style={{ color: grade2color(health?.grade ?? '') }}>{health?.grade ?? '—'}&nbsp;级</b></div>
            <div className="c-kpi-delta-row">
              {renderDeltaBadge(kpiDelta.healthIndex, { flatText: '健康稳定', suffix: '分' })}
              <span className="c-kpi-delta-note">异常 {formatDeltaText(-(Number(healing?.issuesFound) || 0), '项基线')}</span>
            </div>
            <div className="c-kpi-history-wrap">
              <Sparkline pts={getKpiTrend('healthIndex')} color={grade2color(health?.grade ?? '') || '#39ff14'} width={88} height={22} />
              <span className="c-kpi-history-label">5分钟趋势</span>
            </div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 停工预警 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={stagnantPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className={`c-card c-kpi c-kpi-hoverable ${(pulse?.stagnantFactories?.length ?? 0) > 0 ? 'c-kpi-danger' : ''}`}>
            <div className="c-kpi-label">
              <LiveDot size={7} color={(pulse?.stagnantFactories?.length ?? 0) > 0 ? '#ff4136' : '#39ff14'} />
              停工预警
            </div>
            <div className="c-kpi-val" style={{ color: (pulse?.stagnantFactories?.length ?? 0) > 0 ? '#ff4136' : '#39ff14' }}>
              <AnimatedNum val={pulse?.stagnantFactories?.length ?? 0} />
            </div>
            <div className="c-kpi-unit">家停滞</div>
            <div className="c-kpi-sub">
              {(pulse?.stagnantFactories?.length ?? 0) > 0
                ? <span className="blink-text">⚠️ 需立即处理</span>
                : currentKpiMetrics.activeFactories === 0 && currentKpiMetrics.productionOrderCount > 0
                  ? <span style={{ color: '#f7a600' }}>⚠️ 无工厂活跃·生产停滞</span>
                  : '生产运转正常'}
            </div>
            <div className="c-kpi-delta-row">
              {currentKpiMetrics.activeFactories === 0 && currentKpiMetrics.productionOrderCount > 0
                ? <span className="c-kpi-delta down">生产异常</span>
                : renderDeltaBadge(kpiDelta.stagnantFactories, { flatText: '无新增停滞', suffix: '家' })}
              <span className="c-kpi-delta-note">异常越少越好</span>
            </div>
            <div className="c-kpi-history-wrap">
              <Sparkline pts={getKpiTrend('stagnantFactories')} color="#ff6b6b" width={88} height={22} />
              <span className="c-kpi-history-label">5分钟趋势</span>
            </div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 面料缺口 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={shortagePop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className={`c-card c-kpi c-kpi-hoverable ${(shortage?.shortageItems?.length ?? 0) > 0 ? 'c-kpi-warn' : ''}`}>
            <div className="c-kpi-label">
              <LiveDot size={7} color={(shortage?.shortageItems?.length ?? 0) > 0 ? '#f7a600' : '#39ff14'} />
              面料缺口
            </div>
            <div className="c-kpi-val" style={{ color: (shortage?.shortageItems?.length ?? 0) > 0 ? '#f7a600' : '#39ff14' }}>
              <AnimatedNum val={shortage?.shortageItems?.length ?? 0} />
            </div>
            <div className="c-kpi-unit">项缺料</div>
            <div className="c-kpi-sub">
              {(shortage?.shortageItems?.length ?? 0) > 0
                ? <span style={{ color: '#f7a600' }}>⚡ 请及时补单</span>
                : '库存储备充足'}
            </div>
            <div className="c-kpi-delta-row">
              {renderDeltaBadge(kpiDelta.shortageItems, { flatText: '缺口未变', suffix: '项' })}
              <span className="c-kpi-delta-note">补单越快越稳</span>
            </div>
            <div className="c-kpi-history-wrap">
              <Sparkline pts={getKpiTrend('shortageItems')} color="#f7a600" width={88} height={22} />
              <span className="c-kpi-history-label">5分钟趋势</span>
            </div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

          {/* 待处理通知 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={notifyPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className="c-card c-kpi c-kpi-hoverable">
            <div className="c-kpi-label"><LiveDot size={7} color="#7c4dff" />待处理通知</div>
            <div className="c-kpi-val purple"><AnimatedNum val={notify?.pendingCount ?? '—'} /></div>
            <div className="c-kpi-unit">条待发</div>
            <div className="c-kpi-sub">今日已发&nbsp;<b style={{ color: '#7c4dff' }}><AnimatedNum val={notify?.sentToday ?? 0} /></b>&nbsp;条</div>
            <div className="c-kpi-delta-row">
              {renderDeltaBadge(kpiDelta.pendingNotify, { flatText: '待发稳定', suffix: '条' })}
              <span className="c-kpi-delta-note">已发 {formatDeltaText(kpiDelta.sentToday, '条')}</span>
            </div>
            <div className="c-kpi-history-wrap">
              <Sparkline pts={getKpiTrend('pendingNotify')} color="#a78bfa" width={88} height={22} />
              <span className="c-kpi-history-label">5分钟趋势</span>
            </div>
            <div className="c-kpi-hover-hint">悬停查看详情 ↑</div>
          </div>
          </Popover>

        </div>
        {/* ╔══════════════════════════════════════════════╗
            ║   补充 KPI：生产中订单数 + 工厂全景         ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-2">

          {/* 生产中订单数 —— 扩充版 */}
          <div className="c-card" style={{ padding: '12px 14px' }}>
            <div className="c-kpi-label"><LiveDot size={7} color="#f7a600" />生产中订单</div>

            {/* 主数字 + 总件数 */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ color: '#f7a600', fontSize: 36, fontWeight: 700, textShadow: '0 0 14px #f7a60088', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                <AnimatedNum val={currentKpiMetrics.productionOrderCount} />
              </span>
              <span style={{ color: '#7dacc4', fontSize: 12 }}>单在制</span>
              <span style={{ marginLeft: 'auto', color: '#7dacc4', fontSize: 12 }}>
                总&nbsp;<b style={{ color: '#e0e0e0', fontSize: 14 }}>{orderStats.totalQty.toLocaleString()}</b>&nbsp;件
              </span>
            </div>

            {/* 三色统计块：逾期 / 高风险 / 关注 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10 }}>
              <div style={{ background: 'rgba(255,65,54,0.12)', borderRadius: 6, padding: '6px 8px', border: '1px solid rgba(255,65,54,0.3)' }}>
                <div style={{ color: '#ff6b6b', fontSize: 10 }}>已逾期</div>
                <div style={{ color: '#ff4136', fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>
                  {overdueRisk.overdue.length}<span style={{ color: '#7dacc4', fontSize: 10, marginLeft: 2 }}>单</span>
                </div>
                <div style={{ color: '#ff8080', fontSize: 11, marginTop: 2 }}>{orderStats.overdueQty.toLocaleString()} 件</div>
              </div>
              <div style={{ background: 'rgba(247,166,0,0.12)', borderRadius: 6, padding: '6px 8px', border: '1px solid rgba(247,166,0,0.3)' }}>
                <div style={{ color: '#f7a600', fontSize: 10 }}>高风险</div>
                <div style={{ color: '#f7a600', fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>
                  {overdueRisk.highRisk.length}<span style={{ color: '#7dacc4', fontSize: 10, marginLeft: 2 }}>单</span>
                </div>
                <div style={{ color: '#f7a600', fontSize: 11, marginTop: 2 }}>{orderStats.highRiskQty.toLocaleString()} 件</div>
              </div>
              <div style={{ background: 'rgba(0,180,255,0.08)', borderRadius: 6, padding: '6px 8px', border: '1px solid rgba(0,180,255,0.2)' }}>
                <div style={{ color: '#7dacc4', fontSize: 10 }}>关注中</div>
                <div style={{ color: '#7dacc4', fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>
                  {overdueRisk.watch.length}<span style={{ color: '#7dacc4', fontSize: 10, marginLeft: 2 }}>单</span>
                </div>
                <div style={{ color: '#5c9ab8', fontSize: 11, marginTop: 2 }}>{orderStats.watchQty.toLocaleString()} 件</div>
              </div>
            </div>

            {/* 逾期订单明细（最多3条） */}
            {overdueRisk.overdue.length > 0 && (
              <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                <div style={{ color: '#7dacc4', fontSize: 10, marginBottom: 5 }}>逾期订单明细</div>
                {overdueRisk.overdue.slice(0, 3).map(o => {
                  const d = o.plannedEndDate
                    ? Math.abs(Math.ceil((new Date(o.plannedEndDate).getTime() - Date.now()) / 86400000))
                    : 0;
                  return (
                    <div key={String(o.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 3, gap: 4 }}>
                      <span style={{ color: '#e0e0e0', flex: '0 0 auto', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.orderNo}</span>
                      <span style={{ color: '#7dacc4', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{o.factoryName ?? '—'}</span>
                      <span style={{ color: '#ff4136', flex: '0 0 auto', whiteSpace: 'nowrap' }}>逾{d}天·{(Number(o.orderQuantity)||0).toLocaleString()}件</span>
                    </div>
                  );
                })}
                {overdueRisk.overdue.length > 3 && (
                  <div style={{ color: '#5c9ab8', fontSize: 10, textAlign: 'right' }}>还有 {overdueRisk.overdue.length - 3} 单…</div>
                )}
              </div>
            )}

            <div className="c-kpi-delta-row" style={{ marginTop: 8 }}>
              {renderDeltaBadge(kpiDelta.productionOrderCount, { flatText: '订单稳定', suffix: '单' })}
            </div>
          </div>

          {/* 工厂全景 —— 扩充版 */}
          <div className="c-card" style={{ padding: '12px 14px' }}>
            <div className="c-kpi-label"><LiveDot size={7} color="#00b4ff" />工厂全景</div>

            {/* 主数字 + 状态概要 */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ color: '#00e5ff', fontSize: 36, fontWeight: 700, textShadow: '0 0 14px #00b4ff88', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                <AnimatedNum val={currentKpiMetrics.totalFactories} />
              </span>
              <span style={{ color: '#7dacc4', fontSize: 12 }}>家工厂&nbsp;共计</span>
            </div>

            {/* 在线 / 停滞 状态 pills */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.35)', borderRadius: 10, padding: '3px 10px', fontSize: 12, color: '#39ff14', whiteSpace: 'nowrap' }}>
                ● 在线 {pulse?.activeFactories ?? 0} 家
              </span>
              <span style={{
                background: (pulse?.stagnantFactories?.length ?? 0) > 0 ? 'rgba(255,65,54,0.12)' : 'rgba(57,255,20,0.06)',
                border: `1px solid ${(pulse?.stagnantFactories?.length ?? 0) > 0 ? 'rgba(255,65,54,0.4)' : 'rgba(57,255,20,0.2)'}`,
                borderRadius: 10, padding: '3px 10px', fontSize: 12,
                color: (pulse?.stagnantFactories?.length ?? 0) > 0 ? '#ff4136' : '#39ff14',
                whiteSpace: 'nowrap',
              }}>
                ● 停滞 {pulse?.stagnantFactories?.length ?? 0} 家
              </span>
            </div>

            {/* 在线工厂名单 */}
            {(pulse?.factoryActivity?.filter(f => f.active).length ?? 0) > 0 && (
              <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                <div style={{ color: '#7dacc4', fontSize: 10, marginBottom: 5 }}>在线工厂</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {pulse!.factoryActivity.filter(f => f.active).map(f => (
                    <span key={f.factoryName} style={{ background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.3)', borderRadius: 4, padding: '2px 7px', fontSize: 11, color: '#39ff14' }}>
                      {f.factoryName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 停滞工厂明细 */}
            {(pulse?.stagnantFactories?.length ?? 0) > 0 && (
              <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                <div style={{ color: '#ff6b6b', fontSize: 10, marginBottom: 5 }}>停滞工厂 ⚠</div>
                {pulse!.stagnantFactories.map(f => {
                  const h = Math.floor(f.minutesSilent / 60);
                  const m = f.minutesSilent % 60;
                  const silentStr = h > 0 ? `${h}h${m}m` : `${m}m`;
                  return (
                    <div key={f.factoryName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: '#e0e0e0' }}>● {f.factoryName}</span>
                      <span style={{ color: '#ff6b6b' }}>已 {silentStr} 无扫码</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 无活跃数据时的提示 */}
            {(pulse?.factoryActivity?.filter(f => f.active).length ?? 0) === 0
              && (pulse?.stagnantFactories?.length ?? 0) === 0 && (
              <div style={{ marginTop: 12, color: '#5c9ab8', fontSize: 11, textAlign: 'center' }}>暂无活跃工厂数据</div>
            )}

            <div className="c-kpi-delta-row" style={{ marginTop: 8 }}>
              {renderDeltaBadge(kpiDelta.totalFactories, { flatText: '工厂稳定', suffix: '家' })}
            </div>
          </div>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   第二行：实时生产脉搏(左) + 人效实时动态(右) ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-2">

          {/* 实时生产脉搏 */}
          <div className="c-card c-scanline-card">
            <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('pulse')}>
              <LiveDot />
              实时生产脉搏
              <span className="c-card-badge cyan-badge">{pulse?.scanRatePerHour ?? 0} 件/时</span>
              <CollapseChevron panelKey="pulse" />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['pulse'] ? 0 : 800, transition: 'max-height 0.28s ease' }}>
            <div style={{ margin: '6px 0 4px' }}>
              <Sparkline pts={(pulse?.timeline ?? []).map(p => Number(p.count) || 0)} color="#00e5ff" width={340} height={52} />
              <div className="c-sparkline-label">
                {(pulse?.timeline ?? []).map((p, i) => <span key={i}>{p.time.slice(-5)}</span>)}
              </div>
            </div>
            {/* 各工厂活跃状态 — 动态展示哪个工厂在扫码 */}
            {(pulse?.factoryActivity?.length ?? 0) > 0 ? (
              <div className="c-factory-activity-list">
                {pulse!.factoryActivity.map(f => {
                  const mins = f.minutesSinceLastScan;
                  const timeStr = mins < 1 ? '刚刚' : mins < 60 ? `${mins}分钟前` : `${Math.floor(mins/60)}h${mins%60}m前`;
                  return (
                    <div key={f.factoryName} className={`c-factory-activity-row${f.active ? '' : ' inactive'}`}>
                      <span className="c-fa-dot" style={{ background: f.active ? '#39ff14' : mins < 90 ? '#f7a600' : '#ff4136' }} />
                      <span className="c-fa-name">{f.factoryName}</span>
                      <span className="c-fa-time" style={{ color: f.active ? '#39ff14' : mins < 90 ? '#f7a600' : '#ff4136' }}>{timeStr}</span>
                      <span className="c-fa-qty">{f.todayQty.toLocaleString()}<em>件</em></span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="c-all-ok">
                <CheckCircleOutlined style={{ marginRight: 6 }} />
                今日暂无扫码记录
              </div>
            )}
            {/* WebSocket 驱动的实时扫码事件流，有扫码时自动出现 */}
            <LiveScanFeed
              minMinutesSinceLastScan={minFactorySilentMinutes}
              currentScanRatePerHour={Number(pulse?.scanRatePerHour) || 0}
            />
            </div>
          </div>

          {/* 人效实时动态 */}
          <div className="c-card">
            <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('workers')}>
              <LiveDot size={7} />
              人效实时动态
              <CollapseChevron panelKey="workers" />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['workers'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
            <table className="c-table">
              <thead>
                <tr><th>姓名</th><th>速度</th><th>质量</th><th>稳定</th><th>多能</th><th>出勤</th><th>综合</th><th>评级</th></tr>
              </thead>
              <tbody>
                {workers?.workers?.slice(0, 7).map(w => (
                  <tr key={w.workerName ?? w.workerId}>
                    <td>{w.workerName}</td>
                    <td style={{ color: w.speedScore >= 80 ? '#39ff14' : '#f7a600' }}>{w.speedScore}</td>
                    <td style={{ color: w.qualityScore >= 80 ? '#39ff14' : '#f7a600' }}>{w.qualityScore}</td>
                    <td>{w.stabilityScore}</td>
                    <td>{w.versatilityScore}</td>
                    <td>{w.attendanceScore}</td>
                    <td><b style={{ color: '#00e5ff' }}>{w.overallScore}</b></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {(() => {
                        const grd = w.overallScore >= 85 ? { g: 'A', c: '#39ff14' }
                          : w.overallScore >= 70 ? { g: 'B', c: '#00e5ff' }
                          : w.overallScore >= 55 ? { g: 'C', c: '#f7a600' }
                          : { g: 'D', c: '#ff4136' };
                        return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <b style={{ color: grd.c, border: `1px solid ${grd.c}55`, padding: '0 3px', borderRadius: 3, fontSize: 10 }}>{grd.g}</b>
                            {w.trend === 'UP' ? '📈' : w.trend === 'DOWN' ? '📉' : '➡️'}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                )) ?? <tr><td colSpan={8} className="c-empty-td">暂无数据</td></tr>}
              </tbody>
            </table>
            </div>
          </div>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   第三行：活跃订单实时滚动 + 工厂工序卡点 + 逾期&延期风险订单 ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-3">

          {/* 活跃订单实时滚动面板（左侧） */}
          <OrderScrollPanel orders={orders} />

          {/* 工厂卡点分析 */}
          <div className="c-card c-breathe-cyan">
            <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('bottleneck')}>
              <LiveDot size={7} color="#00e5ff" />
              工厂工序卡点
              <span className="c-card-badge cyan-badge">{factoryBottleneck.length} 家工厂</span>
              <span style={{ fontSize: 10, color: '#4a8aaa', letterSpacing: 0 }}>点击整行或订单号可直达 →</span>
              <CollapseChevron panelKey="bottleneck" />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['bottleneck'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
            <AutoScrollBox className="c-orders-scroll">
              {factoryBottleneck.map(f => <BottleneckRow key={f.factoryName} item={f} />)}
              {!factoryBottleneck.length && <div className="c-empty">暂无在制订单</div>}
            </AutoScrollBox>
            </div>
          </div>

          {/* 逾期 & 预计延期订单 */}
          <div className="c-card c-breathe-red">
            <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('overdueRisk')}>
              <LiveDot color={overdueRisk.overdue.length > 0 ? '#ff4136' : '#f7a600'} />
              逾期 &amp; 延期风险订单
              {overdueRisk.overdue.length > 0 && (
                <span className="c-card-badge" style={{ background: 'rgba(255,65,54,0.15)', color: '#ff4136', borderColor: '#ff413644' }}>
                  逾期 {overdueRisk.overdue.length} 单
                </span>
              )}
              {overdueRisk.highRisk.length > 0 && (
                <span className="c-card-badge" style={{ background: 'rgba(247,166,0,0.12)', color: '#f7a600', borderColor: '#f7a60044' }}>
                  高风险 {overdueRisk.highRisk.length} 单
                </span>
              )}
              <CollapseChevron panelKey="overdueRisk" />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['overdueRisk'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
            {overdueRisk.overdue.length === 0 && overdueRisk.highRisk.length === 0 && overdueRisk.watch.length === 0 ? (
              <div className="c-all-ok"><CheckCircleOutlined style={{ marginRight: 6 }} />所有订单均在健康交期内</div>
            ) : (
              <AutoScrollBox className="c-risk-list">
                {overdueRisk.overdue.map(o => {
                  const d = Math.ceil((new Date(o.plannedEndDate!).getTime() - Date.now()) / 86400000);
                  return (
                    <div key={String(o.id)} className="c-risk-row">
                      <span className="c-risk-badge" style={{ color: '#ff4136', borderColor: '#ff413655' }}>逾{-d}天</span>
                      <span className="c-risk-order">{o.orderNo}</span>
                      <span className="c-risk-factory">{o.factoryName}</span>
                      <span className="c-risk-prog" style={{ color: '#ff4136' }}>{Number(o.productionProgress)||0}%</span>
                      <span style={{ flex: 1, textAlign: 'right', fontSize: 10, color: '#ff4136', flexShrink: 0, fontWeight: 600 }}>📞 立即联系</span>
                    </div>
                  );
                })}
                {overdueRisk.highRisk.map(o => {
                  const d = Math.ceil((new Date(o.plannedEndDate!).getTime() - Date.now()) / 86400000);
                  return (
                    <div key={String(o.id)} className="c-risk-row">
                      <span className="c-risk-badge" style={{ color: '#f7a600', borderColor: '#f7a60055' }}>剩{d}天</span>
                      <span className="c-risk-order">{o.orderNo}</span>
                      <span className="c-risk-factory">{o.factoryName}</span>
                      <span className="c-risk-prog" style={{ color: '#f7a600' }}>{Number(o.productionProgress)||0}%</span>
                      <span style={{ flex: 1, textAlign: 'right', fontSize: 10, color: '#f7a600', flexShrink: 0, fontWeight: 600 }}>⚡ 加急协调</span>
                    </div>
                  );
                })}
                {overdueRisk.watch.map(o => {
                  const d = Math.ceil((new Date(o.plannedEndDate!).getTime() - Date.now()) / 86400000);
                  return (
                    <div key={String(o.id)} className="c-risk-row">
                      <span className="c-risk-badge" style={{ color: '#3a8aff', borderColor: '#3a8aff55' }}>关注{d}d</span>
                      <span className="c-risk-order">{o.orderNo}</span>
                      <span className="c-risk-factory">{o.factoryName}</span>
                      <span className="c-risk-prog" style={{ color: '#3a8aff' }}>{Number(o.productionProgress)||0}%</span>
                      <span style={{ flex: 1, textAlign: 'right', fontSize: 10, color: '#3a8aff', flexShrink: 0 }}>👁 持续关注</span>
                    </div>
                  );
                })}
              </AutoScrollBox>
            )}
            </div>
          </div>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   监控：面料缺口 + 缺陷热力图                ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-5-7">

          {/* 面料缺口预警 */}
          <div className="c-card">
            <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('shortage')}>
              <LiveDot color={(shortage?.shortageItems?.length ?? 0) > 0 ? '#f7a600' : '#39ff14'} />
              面料 &amp; 辅料缺口预警
              <CollapseChevron panelKey="shortage" />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['shortage'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
            {shortage?.shortageItems?.length ? (
              shortage.shortageItems.slice(0, 6).map(item => (
                <div key={item.materialCode} className="c-shortage-row">
                  <span className="c-shortage-risk" style={{ color: risk2color(item.riskLevel), borderColor: risk2color(item.riskLevel) }}>
                    {item.riskLevel}
                  </span>
                  <span className="c-shortage-name">{item.materialName}</span>
                  <span className="c-shortage-qty">缺&nbsp;{item.shortageQuantity}&nbsp;{item.unit}</span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, flexShrink: 0, fontWeight: 600,
                    color: item.riskLevel === 'HIGH' ? '#ff4136' : item.riskLevel === 'MEDIUM' ? '#f7a600' : '#39ff14',
                  }}>
                    {item.riskLevel === 'HIGH' ? '⚠ 库存严重不足' : item.riskLevel === 'MEDIUM' ? '库存偏紧' : '适量补充'}
                  </span>
                </div>
              ))
            ) : (
              <div className="c-all-ok">
                <CheckCircleOutlined style={{ marginRight: 6 }} />
                所有面辅料库存充足
              </div>
            )}
            {shortage?.summary && <div className="c-summary">{shortage.summary}</div>}
            </div>
          </div>

          {/* 缺陷热力图 */}
          <div className="c-card">
            <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('heatmap')}>
              <LiveDot size={7} color={(heatmap?.totalDefects ?? 0) > 0 ? '#ff4136' : '#39ff14'} />
              质量缺陷热力图
              {heatmap && (
                <span className="c-card-badge red-badge">
                  总缺陷 {heatmap.totalDefects}
                </span>
              )}
              <CollapseChevron panelKey="heatmap" />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['heatmap'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
            {heatmap?.cells?.length ? (
              <>
                <div className="c-heatmap-meta">
                  风险工序：<b style={{ color: '#ff4136' }}>{heatmap.worstProcess}</b>
                  &nbsp;·&nbsp;风险工厂：<b style={{ color: '#ff4136' }}>{heatmap.worstFactory}</b>
                </div>
                <div className="c-heatmap-grid" style={{ gridTemplateColumns: `52px repeat(${(heatmap.factories || []).length}, 1fr)` }}>
                  <div />
                  {(heatmap.factories || []).map(f => (
                    <Tooltip key={f} title={f} placement="top">
                      <div className="c-heat-head">{f}</div>
                    </Tooltip>
                  ))}
                  {(heatmap.processes || []).map(proc => (
                    <React.Fragment key={proc}>
                      <div className="c-heat-row-label">{proc}</div>
                      {(heatmap.factories || []).map(fac => {
                        const cell = heatmap.cells.find(c => c.process === proc && c.factory === fac);
                        const alpha = cell ? Math.min(cell.intensity, 0.9) : 0;
                        return (
                          <div key={fac} className="c-heat-cell"
                            style={{ background: `rgba(255,65,54,${alpha})`, color: alpha > 0.45 ? '#fff' : '#aaa' }}>
                            {cell?.defectCount || ''}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </>
            ) : <div className="c-empty">暂无缺陷数据</div>}
            </div>
          </div>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   系统异常自愈诊断(左) + 工厂绩效排行榜(右)  ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-2">

          {/* 异常自愈诊断 */}
          <div className="c-card">
            <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('healing')}>
              <LiveDot size={7} color={healing && healing.healthScore < 80 ? '#d48806' : '#73d13d'} />
              系统异常自愈诊断
              {healing && (
                <span className="c-card-badge" style={{
                  background: healing.healthScore >= 80 ? 'rgba(82,196,26,0.12)' : 'rgba(212,137,6,0.12)',
                  color: healing.healthScore >= 80 ? '#73d13d' : '#d48806',
                  borderColor: healing.healthScore >= 80 ? '#73d13d55' : '#d4880655',
                }}>
                  健康 <AnimatedNum val={healing.healthScore} /> 分 · 发现 <AnimatedNum val={healing.issuesFound} /> 项
                </span>
              )}
              <CollapseChevron panelKey="healing" />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['healing'] ? 0 : 500, transition: 'max-height 0.28s ease' }}>
            {healing?.items?.length ? (
              healing.items.slice(0, 7).map((item, i) => (
                <div key={i} className="c-heal-item">
                  <span className={`c-heal-dot ${item.status === 'OK' ? 'dot-ok' : item.autoFixed ? 'dot-fixed' : 'dot-warn'}`} />
                  <span className="c-heal-name">{item.checkName}</span>
                  <span className="c-heal-detail">{item.detail}</span>
                  <span style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    {item.autoFixed
                      ? <Tag style={{ fontSize: 11, background: '#1677ff22', color: '#4096ff', borderColor: '#4096ff55' }}>已自修</Tag>
                      : item.status !== 'OK'
                        ? <Tag style={{ fontSize: 11, background: '#d4880622', color: '#d48806', borderColor: '#d4880655' }}>需处理</Tag>
                        : <Tag style={{ fontSize: 11, background: '#52c41a22', color: '#73d13d', borderColor: '#73d13d55' }}>正常</Tag>
                    }
                  </span>
                </div>
              ))
            ) : <div className="c-empty">暂无诊断数据</div>}
            </div>
          </div>

          {/* 工厂绩效排行 */}
          <div className="c-card">
            <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('ranking')}>
              <LiveDot size={7} color="#ffd700" />
              工厂绩效排行榜
              <span className="c-card-badge purple-badge">实时评分</span>
              <CollapseChevron panelKey="ranking" />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['ranking'] ? 0 : 500, transition: 'max-height 0.28s ease' }}>
            {ranking?.rankings?.length ? (
              ranking.rankings.slice(0, 5).map((r, i) => (
                <div key={r.factoryId} className="c-rank-row">
                  <span className="c-rank-medal" style={{ color: medalColor[i] ?? '#7a8999' }}>
                    {i < 3 ? ['🥇','🥈','🥉'][i] : `#${r.rank}`}
                  </span>
                  <span className="c-rank-name">{r.factoryName}</span>
                  <div className="c-rank-bar-wrap">
                    <div className="c-rank-bar" style={{ width: `${r.totalScore}%`, background: i === 0 ? 'linear-gradient(90deg,#ffd700,#f7a600)' : 'linear-gradient(90deg,#00e5ff,#0098aa)' }} />
                  </div>
                  <span className="c-rank-score"><AnimatedNum val={r.totalScore} /></span>
                </div>
              ))
            ) : <div className="c-empty">暂无排行数据</div>}
            </div>
          </div>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   AI 大脑状态 + 行动中心 (brain + actionCenter) ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-2">

          {/* AI 大脑快照 */}
          <div className="c-card">
            <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('brain')}>
              <RobotOutlined style={{ color: '#a78bfa', marginRight: 6 }} />
              AI 大脑状态
              {brain && (
                <span className="c-card-badge" style={{
                  background: brain.summary.healthGrade === 'A' ? 'rgba(82,196,26,0.12)' : 'rgba(212,137,6,0.12)',
                  color: brain.summary.healthGrade === 'A' ? '#73d13d' : '#d48806',
                  borderColor: brain.summary.healthGrade === 'A' ? '#73d13d55' : '#d4880655',
                }}>
                  {brain.summary.healthGrade} 级 · {brain.summary.healthIndex} 分
                </span>
              )}
              <CollapseChevron panelKey="brain" />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['brain'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
            {brain ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                  <div style={{ textAlign: 'center', padding: '6px 0', background: 'rgba(0,229,255,0.04)', borderRadius: 6, border: '1px solid rgba(0,229,255,0.1)' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#00e5ff' }}>{brain.summary.todayScanQty.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: '#7aaec8' }}>今日扫码</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '6px 0', background: 'rgba(167,139,250,0.04)', borderRadius: 6, border: '1px solid rgba(167,139,250,0.1)' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#a78bfa' }}>{brain.summary.anomalyCount}</div>
                    <div style={{ fontSize: 10, color: '#7aaec8' }}>异常项</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '6px 0', background: 'rgba(255,65,54,0.04)', borderRadius: 6, border: '1px solid rgba(255,65,54,0.1)' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: brain.summary.highRiskOrders > 0 ? '#ff4136' : '#39ff14' }}>{brain.summary.highRiskOrders}</div>
                    <div style={{ fontSize: 10, color: '#7aaec8' }}>高风险订单</div>
                  </div>
                </div>
                {/* 模型网关状态 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 11, color: '#b0c4de' }}>
                  <span style={{ color: brain.modelGateway.status === 'CONNECTED' ? '#39ff14' : '#ff4136', fontWeight: 600 }}>
                    ● {brain.modelGateway.status}
                  </span>
                  <span>{brain.modelGateway.provider} · {brain.modelGateway.activeModel}</span>
                  {brain.modelGateway.fallbackEnabled && <Tag style={{ fontSize: 9, background: 'rgba(0,229,255,0.08)', color: '#00e5ff', borderColor: '#00e5ff33' }}>降级就绪</Tag>}
                </div>
                {/* 信号列表 */}
                {brain.signals?.slice(0, 4).map((sig, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: sig.level === 'CRITICAL' ? '#ff4136' : sig.level === 'WARNING' ? '#f7a600' : '#39ff14', fontWeight: 600, fontSize: 10, minWidth: 52 }}>
                      {sig.level}
                    </span>
                    <span style={{ color: '#b0c4de', flex: 1 }}>{sig.title}</span>
                    {sig.relatedOrderNo && <span style={{ color: '#5a7a9a', fontSize: 10 }}>{sig.relatedOrderNo}</span>}
                  </div>
                ))}
                {brain.summary.topRisk && (
                  <div style={{ marginTop: 6, fontSize: 10, color: '#f7a600', background: 'rgba(247,166,0,0.06)', padding: '4px 8px', borderRadius: 4 }}>
                    🎯 首要风险：{brain.summary.topRisk}
                  </div>
                )}
              </>
            ) : <div className="c-empty">大脑快照加载中...</div>}
            </div>
          </div>

          {/* 行动中心 */}
          <div className="c-card">
            <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('actionCenter')}>
              <ThunderboltOutlined style={{ color: '#ffd700', marginRight: 6 }} />
              行动中心
              {actionCenter?.summary && (
                <span className="c-card-badge red-badge">
                  待处理 {actionCenter.summary.totalTasks} · 紧急 {actionCenter.summary.highPriorityTasks}
                </span>
              )}
              <CollapseChevron panelKey="actionCenter" />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['actionCenter'] ? 0 : 800, transition: 'max-height 0.28s ease' }}>
            {actionCenter?.tasks?.length ? (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  {actionCenter.summary.productionTasks > 0 && <Tag style={{ fontSize: 10, background: 'rgba(0,229,255,0.08)', color: '#00e5ff', borderColor: '#00e5ff33' }}>生产 {actionCenter.summary.productionTasks}</Tag>}
                  {actionCenter.summary.financeTasks > 0 && <Tag style={{ fontSize: 10, background: 'rgba(167,139,250,0.08)', color: '#a78bfa', borderColor: '#a78bfa33' }}>财务 {actionCenter.summary.financeTasks}</Tag>}
                  {actionCenter.summary.factoryTasks > 0 && <Tag style={{ fontSize: 10, background: 'rgba(247,166,0,0.08)', color: '#f7a600', borderColor: '#f7a60033' }}>工厂 {actionCenter.summary.factoryTasks}</Tag>}
                </div>
                {actionCenter.tasks.slice(0, 6).map((task) => (
                  <div key={task.taskCode} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: task.routePath ? 'pointer' : 'default' }}
                    onClick={() => task.routePath && navigate(task.routePath)}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, minWidth: 22, textAlign: 'center', padding: '1px 4px', borderRadius: 3,
                      background: task.priority === 'CRITICAL' ? 'rgba(255,65,54,0.15)' : task.priority === 'HIGH' ? 'rgba(247,166,0,0.12)' : 'rgba(0,229,255,0.08)',
                      color: task.priority === 'CRITICAL' ? '#ff4136' : task.priority === 'HIGH' ? '#f7a600' : '#00e5ff',
                    }}>
                      L{task.escalationLevel}
                    </span>
                    <span style={{ color: '#b0c4de', flex: 1 }}>{task.title}</span>
                    {task.relatedOrderNo && <span style={{ color: '#5a7a9a', fontSize: 10 }}>{task.relatedOrderNo}</span>}
                    {task.dueHint && <span style={{ color: '#f7a600', fontSize: 9 }}>{task.dueHint}</span>}
                    {task.autoExecutable && (
                      executeTaskResult?.taskCode === task.taskCode ? (
                        <span style={{ fontSize: 9, color: executeTaskResult.ok ? '#73d13d' : '#ff4136', fontWeight: 600 }}>
                          {executeTaskResult.ok ? '✓ 已执行' : '✗ 失败'}
                        </span>
                      ) : (
                        <button
                          disabled={executingTask === task.taskCode}
                          onClick={e => { e.stopPropagation(); handleExecuteTask(task); }}
                          style={{
                            fontSize: 9, padding: '2px 7px', border: '1px solid rgba(82,196,26,0.4)',
                            borderRadius: 3, background: executingTask === task.taskCode ? 'rgba(82,196,26,0.04)' : 'rgba(82,196,26,0.08)',
                            color: '#73d13d', cursor: executingTask === task.taskCode ? 'wait' : 'pointer',
                          }}
                        >
                          {executingTask === task.taskCode ? '执行中…' : '一键执行'}
                        </button>
                      )
                    )}
                  </div>
                ))}
                {/* 待审批 AI 命令 — 常驻显示，无需触发聊天 */}
                <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                  <div style={{ fontSize: 10, color: '#4a6d8a', marginBottom: 6 }}>
                    <ThunderboltOutlined style={{ marginRight: 4, color: '#a78bfa' }} />待审批 AI 命令
                  </div>
                  <AiExecutionPanel />
                </div>
              </>
            ) : (
              <div>
                <div className="c-empty">暂无待办任务</div>
                {/* 即使无任务也显示待审批命令区 */}
                <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                  <div style={{ fontSize: 10, color: '#4a6d8a', marginBottom: 6 }}>
                    <ThunderboltOutlined style={{ marginRight: 4, color: '#a78bfa' }} />待审批 AI 命令
                  </div>
                  <AiExecutionPanel />
                </div>
              </div>
            )}
            </div>
          </div>

        </div>

        {/* ╔════════════════════════════════════════════╗
            ║ 底部：利润/完工双引擎(左) + AI智能顾问(右)  ║
            ╚════════════════════════════════════════════╝ */}
        <div style={{ padding: '0 24px 4px' }}>
          <div className="c-card-title" style={{ cursor: 'pointer', padding: '8px 0', marginBottom: 0 }} onClick={() => toggleCollapse('profit')}>
            <span style={{ fontSize: 13, color: '#a78bfa', fontWeight: 600 }}>💰 订单利润估算 &amp; 完工预测</span>
            <span className="c-card-badge purple-badge" style={{ marginLeft: 8 }}>AI 双引擎分析</span>
            <CollapseChevron panelKey="profit" />
          </div>
        </div>
        <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['profit'] ? 0 : 2000, transition: 'max-height 0.3s ease' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0, padding: '0 24px 28px', alignItems: 'stretch' }}>
          {/* 左：利润估算&完工预测 */}
          <div style={{ paddingRight: 6 }}>
            <ProfitDeliveryPanel />
          </div>

        </div>
        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   智能分析面板（可展开，11个独立分析模块）      ║
            ╚══════════════════════════════════════════════╝ */}
        <div style={{ padding: '0 24px 12px' }}>
          <div
            className="c-card"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setShowAnalysisPanels(v => !v)}
          >
            <div className="c-card-title" style={{ marginBottom: 0 }}>
              <AppstoreOutlined style={{ color: '#a78bfa', marginRight: 6 }} />
              智能分析面板
              <span className="c-card-badge purple-badge">
                {ANALYSIS_PANELS.filter(p => visiblePanels[p.key]).length} / {ANALYSIS_PANELS.length} 已启用
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#5a7a9a' }}>
                {showAnalysisPanels ? <UpOutlined /> : <DownOutlined />}
                {showAnalysisPanels ? ' 收起' : ' 展开'}
              </span>
            </div>
          </div>
        </div>
        {showAnalysisPanels && (
          <>
            {/* ── 面板开关栏 ── */}
            <div style={{ padding: '0 24px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {ANALYSIS_PANELS.map(p => {
                const on = !!visiblePanels[p.key];
                return (
                  <Tag
                    key={p.key}
                    style={{
                      cursor: 'pointer', fontSize: 12, padding: '2px 10px',
                      borderColor: on ? '#a78bfa' : '#d9d9d9',
                      color: on ? '#a78bfa' : '#999',
                      background: on ? 'rgba(167,139,250,0.08)' : '#fafafa',
                    }}
                    onClick={() => togglePanel(p.key)}
                  >
                    {on ? <EyeOutlined style={{ marginRight: 4 }} /> : <EyeInvisibleOutlined style={{ marginRight: 4 }} />}
                    {p.label}
                  </Tag>
                );
              })}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <Tag style={{ cursor: 'pointer', fontSize: 11 }} onClick={() => toggleAllPanels(true)}>全部显示</Tag>
                <Tag style={{ cursor: 'pointer', fontSize: 11 }} onClick={() => toggleAllPanels(false)}>全部隐藏</Tag>
              </span>
            </div>
            <Suspense fallback={<div style={{ textAlign: 'center', padding: 40 }}><Spin tip="加载分析面板…" /></div>}>
              {(visiblePanels.smartAssignment || visiblePanels.workerProfile) && (
                <div style={{ display: 'grid', gridTemplateColumns: visiblePanels.smartAssignment && visiblePanels.workerProfile ? '1fr 1fr' : '1fr', gap: 16, padding: '0 24px 16px' }}>
                  {visiblePanels.smartAssignment && <SmartAssignmentPanel />}
                  {visiblePanels.workerProfile && <WorkerProfilePanel />}
                </div>
              )}
              {(visiblePanels.scheduling || visiblePanels.rhythmDna) && (
                <div style={{ display: 'grid', gridTemplateColumns: visiblePanels.scheduling && visiblePanels.rhythmDna ? '1fr 1fr' : '1fr', gap: 16, padding: '0 24px 16px' }}>
                  {visiblePanels.scheduling && <SchedulingSuggestionPanel />}
                  {visiblePanels.rhythmDna && <RhythmDnaPanel />}
                </div>
              )}
              {(visiblePanels.liveCost || visiblePanels.defectTrace) && (
                <div style={{ display: 'grid', gridTemplateColumns: visiblePanels.liveCost && visiblePanels.defectTrace ? '1fr 1fr' : '1fr', gap: 16, padding: '0 24px 16px' }}>
                  {visiblePanels.liveCost && <LiveCostTrackerPanel />}
                  {visiblePanels.defectTrace && <DefectTracePanel />}
                </div>
              )}
              {(visiblePanels.financeAudit || visiblePanels.styleQuote) && (
                <div style={{ display: 'grid', gridTemplateColumns: visiblePanels.financeAudit && visiblePanels.styleQuote ? '1fr 1fr' : '1fr', gap: 16, padding: '0 24px 16px' }}>
                  {visiblePanels.financeAudit && <FinanceAuditPanel />}
                  {visiblePanels.styleQuote && <StyleQuoteSuggestionPanel />}
                </div>
              )}
              {(visiblePanels.supplierScorecard || visiblePanels.learningReport) && (
                <div style={{ display: 'grid', gridTemplateColumns: visiblePanels.supplierScorecard && visiblePanels.learningReport ? '1fr 1fr' : '1fr', gap: 16, padding: '0 24px 16px' }}>
                  {visiblePanels.supplierScorecard && <SupplierScorecardPanel />}
                  {visiblePanels.learningReport && <LearningReportPanel />}
                </div>
              )}
              {visiblePanels.mindPush && (
                <div style={{ padding: '0 24px 24px' }}>
                  <MindPushPanel />
                </div>
              )}
            </Suspense>
          </>
        )}



      </div>

      {/* ⌘K 全局搜索弹窗 */}
      <GlobalSearchModal open={showSearch} onClose={() => setShowSearch(false)} />

    </Layout>
  );
};

export default IntelligenceCenter;
