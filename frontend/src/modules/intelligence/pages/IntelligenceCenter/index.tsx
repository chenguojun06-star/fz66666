import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Tag, Input, Button, Tooltip, Popover } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ThunderboltOutlined, SyncOutlined, RobotOutlined, SendOutlined,
  WarningOutlined, CheckCircleOutlined, DashboardOutlined,
  FullscreenOutlined, FullscreenExitOutlined,
} from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { NlQueryResponse } from '@/services/production/productionApi';
import Layout from '@/components/Layout';
import ProfitDeliveryPanel from './ProfitDeliveryPanel';
import LiveScanFeed from './LiveScanFeed';
import RhythmDnaPanel from './RhythmDnaPanel';
import WorkerProfilePanel from './WorkerProfilePanel';
import LiveCostTrackerPanel from './LiveCostTrackerPanel';
import StyleQuoteSuggestionPanel from './StyleQuoteSuggestionPanel';
import SupplierScorecardPanel from './SupplierScorecardPanel';
import LearningReportPanel from './LearningReportPanel';
import DefectTracePanel from './DefectTracePanel';
import SmartAssignmentPanel from './SmartAssignmentPanel';
import MindPushPanel from './MindPushPanel';
import SchedulingSuggestionPanel from './SchedulingSuggestionPanel';
import {
  risk2color, grade2color, LiveDot, Sparkline,
  KpiPop, AnimatedNum, medalColor,
} from './components/IntelligenceWidgets';
import { OrderScrollPanel, AutoScrollBox, BottleneckRow } from './components/OrderScrollPanel';
import { useCockpit } from './hooks/useCockpit';
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
});

const KPI_HISTORY_WINDOW_MS = 5 * 60 * 1000;


const IntelligenceCenter: React.FC = () => {
  const navigate = useNavigate();
  const { data, reload } = useCockpit();
  const [countdown, setCountdown]   = useState(30);
  const [now, setNow]               = useState(new Date());
  const [query, setQuery]           = useState('');
  const [chatA, setChatA]           = useState('');
  const [nlResult, setNlResult]     = useState<NlQueryResponse | null>(null);
  const [sending, setSending]       = useState(false);
  const [aiAdvisorReady, setAiAdvisorReady] = useState<boolean>(true);
  const [inlineQuery, setInlineQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
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
      setInlineQuery(q);
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

  /* ai-advisor 状态预检 */
  useEffect(() => {
    intelligenceApi.getAiAdvisorStatus()
      .then(r => setAiAdvisorReady((r as any)?.data?.enabled ?? true))
      .catch(() => setAiAdvisorReady(false));
  }, []);

  const handleSend = async (q?: string) => {
    const text = (q ?? query).trim();
    if (!text) return;
    if (q) setQuery(q);
    setSending(true); setNlResult(null); setChatA('');
    setInlineQuery(text);
    try {
      const [nlRes, chatRes] = await Promise.allSettled([
        intelligenceApi.nlQuery({ question: text }) as any,
        aiAdvisorReady ? intelligenceApi.aiAdvisorChat(text) as any : Promise.reject(null),
      ]);
      if (nlRes.status === 'fulfilled') setNlResult((nlRes.value as any)?.data ?? nlRes.value);
      if (chatRes.status === 'fulfilled') setChatA((chatRes.value as any)?.data?.answer || (chatRes.value as any)?.answer || '');
    } finally { setSending(false); }
  };

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
  }), [health?.healthIndex, notify?.pendingCount, notify?.sentToday, pulse?.activeFactories, pulse?.activeWorkers, pulse?.scanRatePerHour, pulse?.stagnantFactories, pulse?.todayScanQty, shortage?.shortageItems]);

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
        : [{ label: '状态', value: '所有工厂正常运转', color: '#39ff14' }]}
      warning={(pulse?.stagnantFactories?.length ?? 0) > 0 ? '建议 15 分钟内联系工厂确认原因' : undefined}
      aiTip={(pulse?.stagnantFactories?.length ?? 0) > 0
        ? `${pulse!.stagnantFactories.length} 家工厂停工，订单交付风险上升，建议立即介入`
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
          <div className="c-card c-kpi c-kpi-hoverable">
            <div className="c-kpi-label"><LiveDot size={7} />活跃工厂</div>
            <div className="c-kpi-val green neon-green"><AnimatedNum val={pulse?.activeFactories ?? '—'} /></div>
            <div className="c-kpi-unit">家</div>
            <div className="c-kpi-sub">员工&nbsp;<b style={{ color: '#39ff14' }}><AnimatedNum val={pulse?.activeWorkers ?? '—'} /></b>&nbsp;人在线</div>
            <div className="c-kpi-delta-row">
              {renderDeltaBadge(kpiDelta.activeFactories, { flatText: '工厂稳定', suffix: '家' })}
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
                : '生产运转正常'}
            </div>
            <div className="c-kpi-delta-row">
              {renderDeltaBadge(kpiDelta.stagnantFactories, { flatText: '无新增停滞', suffix: '家' })}
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
            ║   第二行：实时生产脉搏(左) + 人效实时动态(右) ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-2">

          {/* 实时生产脉搏 */}
          <div className="c-card c-scanline-card">
            <div className="c-card-title">
              <LiveDot />
              实时生产脉搏
              <span className="c-card-badge cyan-badge">{pulse?.scanRatePerHour ?? 0} 件/时</span>
            </div>
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

          {/* 人效实时动态 */}
          <div className="c-card">
            <div className="c-card-title">
              <LiveDot size={7} />
              人效实时动态
            </div>
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

        {/* ╔══════════════════════════════════════════════╗
            ║   第三行：活跃订单实时滚动 + 工厂工序卡点 + 逾期&延期风险订单 ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-3">

          {/* 活跃订单实时滚动面板（左侧） */}
          <OrderScrollPanel orders={orders} />

          {/* 工厂卡点分析 */}
          <div className="c-card c-breathe-cyan">
            <div className="c-card-title">
              <LiveDot size={7} color="#00e5ff" />
              工厂工序卡点
              <span className="c-card-badge cyan-badge">{factoryBottleneck.length} 家工厂</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4a8aaa', letterSpacing: 0 }}>点击整行或订单号可直达 →</span>
            </div>
            <AutoScrollBox className="c-orders-scroll">
              {factoryBottleneck.map(f => <BottleneckRow key={f.factoryName} item={f} />)}
              {!factoryBottleneck.length && <div className="c-empty">暂无在制订单</div>}
            </AutoScrollBox>
          </div>

          {/* 逾期 & 预计延期订单 */}
          <div className="c-card c-breathe-red">
            <div className="c-card-title">
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
            </div>
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
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: '#ff4136', flexShrink: 0, fontWeight: 600 }}>📞 立即联系</span>
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
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: '#f7a600', flexShrink: 0, fontWeight: 600 }}>⚡ 加急协调</span>
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
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: '#3a8aff', flexShrink: 0 }}>👁 持续关注</span>
                    </div>
                  );
                })}
              </AutoScrollBox>
            )}
          </div>

        </div>

        {/* ╔══════════════════════════════════════════════╗
            ║   监控：面料缺口 + 缺陷热力图                ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-5-7">

          {/* 面料缺口预警 */}
          <div className="c-card">
            <div className="c-card-title">
              <LiveDot color={(shortage?.shortageItems?.length ?? 0) > 0 ? '#f7a600' : '#39ff14'} />
              面料 &amp; 辅料缺口预警
            </div>
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

          {/* 缺陷热力图 */}
          <div className="c-card">
            <div className="c-card-title">
              <LiveDot size={7} color={(heatmap?.totalDefects ?? 0) > 0 ? '#ff4136' : '#39ff14'} />
              质量缺陷热力图
              {heatmap && (
                <span className="c-card-badge red-badge">
                  总缺陷 {heatmap.totalDefects}
                </span>
              )}
            </div>
            {heatmap?.cells?.length ? (
              <>
                <div className="c-heatmap-meta">
                  风险工序：<b style={{ color: '#ff4136' }}>{heatmap.worstProcess}</b>
                  &nbsp;·&nbsp;风险工厂：<b style={{ color: '#ff4136' }}>{heatmap.worstFactory}</b>
                </div>
                <div className="c-heatmap-grid" style={{ gridTemplateColumns: `52px repeat(${heatmap.factories.length}, 1fr)` }}>
                  <div />
                  {heatmap.factories.map(f => (
                    <Tooltip key={f} title={f} placement="top">
                      <div className="c-heat-head">{f}</div>
                    </Tooltip>
                  ))}
                  {heatmap.processes.map(proc => (
                    <React.Fragment key={proc}>
                      <div className="c-heat-row-label">{proc}</div>
                      {heatmap.factories.map(fac => {
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

        {/* ╔══════════════════════════════════════════════╗
            ║   系统异常自愈诊断(左) + 工厂绩效排行榜(右)  ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-2">

          {/* 异常自愈诊断 */}
          <div className="c-card">
            <div className="c-card-title">
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
            </div>
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

          {/* 工厂绩效排行 */}
          <div className="c-card">
            <div className="c-card-title">
              <LiveDot size={7} color="#ffd700" />
              工厂绩效排行榜
              <span className="c-card-badge purple-badge">实时评分</span>
            </div>
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

        {/* ╔══════════════════════════════════════════════╗
            ║   AI 大脑状态 + 行动中心 (brain + actionCenter) ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-2">

          {/* AI 大脑快照 */}
          <div className="c-card">
            <div className="c-card-title">
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
            </div>
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

          {/* 行动中心 */}
          <div className="c-card">
            <div className="c-card-title">
              <ThunderboltOutlined style={{ color: '#ffd700', marginRight: 6 }} />
              行动中心
              {actionCenter?.summary && (
                <span className="c-card-badge red-badge">
                  待处理 {actionCenter.summary.totalTasks} · 紧急 {actionCenter.summary.highPriorityTasks}
                </span>
              )}
            </div>
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
                    {task.autoExecutable && <Tag style={{ fontSize: 9, background: 'rgba(82,196,26,0.08)', color: '#73d13d', borderColor: '#73d13d33' }}>自动</Tag>}
                  </div>
                ))}
              </>
            ) : <div className="c-empty">暂无待办任务</div>}
          </div>

        </div>

        {/* ╔════════════════════════════════════════════╗
            ║ 底部：利润/完工双引擎(左) + AI智能顾问(右)  ║
            ╚════════════════════════════════════════════╝ */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 0, padding: '0 24px 28px', alignItems: 'stretch' }}>
          {/* 左：利润估算&完工预测 */}
          <div style={{ paddingRight: 6 }}>
            <ProfitDeliveryPanel />
          </div>
          {/* 右：AI 智能顾问 */}
          <div style={{ paddingLeft: 6 }}>
            <div className="c-card c-chat-card" style={{ height: '100%' }}>
              <div className="c-card-title" style={{ marginBottom: 10 }}>
                <RobotOutlined style={{ marginRight: 7, color: '#a78bfa', fontSize: 16 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#c4b5fd' }}>AI 智能顾问</span>
                <LiveDot size={7} color="#a78bfa" />
              </div>

              {/* ai-advisor 服务状态警告 */}
              {!aiAdvisorReady && (
                <div style={{ fontSize: 10, color: '#f7a600', background: 'rgba(247,166,0,0.08)',
                  border: '1px solid rgba(247,166,0,0.25)', borderRadius: 4,
                  padding: '4px 8px', marginBottom: 8 }}>
                  ⚠ AI 顾问服务当前不可用，数据查询功能正常
                </div>
              )}

              {/* AI 问答区 */}
              <div style={{ marginBottom: 8 }}>
                <div className="c-chat-row" style={{ marginBottom: 4 }}>
                  <Input
                    size="small"
                    className="c-chat-input"
                    placeholder="问任何问题：逾期订单 / 工厂效率 / 面料库存缺口 / 次品分析..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onPressEnter={() => handleSend()}
                  />
                  <Button size="small" type="primary" icon={<SendOutlined />} loading={sending}
                    onClick={() => handleSend()} className="c-chat-send">发送</Button>
                </div>
                {sending && <div style={{ fontSize: 10, color: '#7aaec8', paddingTop: 4 }}>
                  <DashboardOutlined spin style={{ marginRight: 4 }} />AI 正在分析…
                </div>}
                {/* 统一回复区 */}
                {(nlResult || chatA) && (
                  <div className="c-chat-answer" style={{ fontSize: 11, marginTop: 5, lineHeight: 1.6 }}>
                    {nlResult && (
                      <div style={{ color: '#c4b5fd', marginBottom: chatA ? 6 : 0 }}>
                        {nlResult.intent === 'ai_direct' && (
                          <span style={{ fontSize: 9, color: '#a78bfa', marginRight: 6,
                            background: 'rgba(167,139,250,0.15)', padding: '1px 5px',
                            borderRadius: 3 }}>🤖 AI直接回答</span>
                        )}
                        {nlResult.answer}
                        {nlResult.confidence !== undefined && (
                          <span style={{ fontSize: 9, color: '#7a9abc', marginLeft: 6 }}>
                            置信度 {Math.round(nlResult.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    )}
                    {chatA && <div>{chatA}</div>}
                    {/* 根据问题关键词内联渲染对应智能面板 */}
                    {(() => {
                      const q = inlineQuery;
                      if (/节拍|DNA|工序耗时|节奏/.test(q)) return <div style={{ marginTop: 8 }}><RhythmDnaPanel /></div>;
                      if (/工人效率|工人画像|工人排行/.test(q)) return <div style={{ marginTop: 8 }}><WorkerProfilePanel /></div>;
                      if (/实时成本|成本追踪|成本分析/.test(q)) return <div style={{ marginTop: 8 }}><LiveCostTrackerPanel /></div>;
                      if (/报价建议|款式估价|估算报价|报价/.test(q)) return <div style={{ marginTop: 8 }}><StyleQuoteSuggestionPanel /></div>;
                      if (/供应商评分|工厂综合评分|综合评分排行/.test(q)) return <div style={{ marginTop: 8 }}><SupplierScorecardPanel /></div>;
                      if (/学习报告|学习效率/.test(q)) return <div style={{ marginTop: 8 }}><LearningReportPanel /></div>;
                      if (/次品溯源|缺陷追溯|次品分析/.test(q)) return <div style={{ marginTop: 8 }}><DefectTracePanel /></div>;
                      if (/智能派工|派工推荐/.test(q)) return <div style={{ marginTop: 8 }}><SmartAssignmentPanel /></div>;
                      if (/智能推送|推送消息/.test(q)) return <div style={{ marginTop: 8 }}><MindPushPanel /></div>;
                      if (/排期建议|AI排程|排程/.test(q)) return <div style={{ marginTop: 8 }}><SchedulingSuggestionPanel /></div>;
                      return null;
                    })()}
                  </div>
                )}
              </div>

              <div className="c-chat-suggestions" style={{ marginTop: 'auto', paddingTop: 8 }}>
                {[
                  '本周逾期订单', '效率最低工厂', '面料库存缺口', '今日扫码异常', '工序节拍分析', '哪个工序是瓶颈？',
                  '今日生产进度如何？', '有哪些订单停工？', '面料库存是否充足？', '本月工厂绩效？',
                  '次品溯源分析', '工厂综合评分排行', '给新款式估算报价',
                  '实时成本追踪分析', '工人效率画像排行', 'AI排程建议', '智能派工推荐',
                  '学习效率报告', '最新智能推送消息',
                ].map(q => (
                  <button key={q} className="c-suggest-btn" onClick={() => handleSend(q)}>{q}</button>
                ))}
              </div>
            </div>
          </div>
        </div>



      </div>
    </Layout>
  );
};

export default IntelligenceCenter;
