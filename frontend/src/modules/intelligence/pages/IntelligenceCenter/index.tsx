import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Tag, Tooltip, Popover } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ThunderboltOutlined, SyncOutlined, RobotOutlined,
  WarningOutlined, CheckCircleOutlined,
  FullscreenOutlined, FullscreenExitOutlined, SearchOutlined,
  DownOutlined, UpOutlined,
} from '@ant-design/icons';
import { intelligenceApi as execApi } from '@/services/intelligenceApi';
import api from '@/utils/api';
import Layout from '@/components/Layout';
import { useAuth } from '@/utils/AuthContext';
import ProfitDeliveryPanel from './ProfitDeliveryPanel';
import LiveScanFeed from './LiveScanFeed';
import AiExecutionPanel from '../../components/AiExecutionPanel';

import {
  risk2color, grade2color, LiveDot, Sparkline,
  AnimatedNum, medalColor,
} from './components/IntelligenceWidgets';
import { OrderScrollPanel, AutoScrollBox, BottleneckRow } from './components/OrderScrollPanel';
import { useCockpit } from './hooks/useCockpit';
import GlobalSearchModal from './components/GlobalSearchModal';
import MonthlyBizSummary from './MonthlyBizSummary';
import WhatIfSimPanel from './WhatIfSimPanel';
import AgentGraphPanel from '../../components/AgentGraphPanel';
import ABTestStatsPanel from '../../components/ABTestStatsPanel';
import StageCapsulePanel from './components/StageCapsulePanel';
import { useKpiMetrics } from './hooks/useKpiMetrics';
import { useKpiPopovers } from './KpiPopoverContent';
import { paths } from '@/routeConfig';
import './styles.css';



const IntelligenceCenter: React.FC = () => {
  const navigate = useNavigate();
  const { data, reload } = useCockpit();
  const [countdown, setCountdown]   = useState(30);
  const [now, setNow]               = useState(new Date());
  const { isSuperAdmin, isTenantOwner, user } = useAuth();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  /* ── 自愈一键修复 ── */
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<{ autoFixed: number; needManual: number } | null>(null);
  const handleRepair = useCallback(async () => {
    setRepairing(true);
    setRepairResult(null);
    try {
      const res = await execApi.runSelfHealingRepair() as any;
      const d = res?.data ?? res;
      setRepairResult({ autoFixed: Number(d?.autoFixed ?? 0), needManual: Number(d?.needManual ?? 0) });
      reload();
    } catch { setRepairResult({ autoFixed: 0, needManual: -1 }); }
    finally { setRepairing(false); }
  }, [reload]);

  /* ── Agent 例会 ── */
  const [meetingTopic, setMeetingTopic] = useState('');
  const [holdingMeeting, setHoldingMeeting] = useState(false);
  const [meetingResult, setMeetingResult] = useState<any>(null);
  const [meetingHistory, setMeetingHistory] = useState<any[]>([]);
  const holdMeeting = useCallback(async () => {
    if (!meetingTopic.trim()) return;
    setHoldingMeeting(true);
    setMeetingResult(null);
    try {
      const res = await execApi.holdAgentMeeting(meetingTopic.trim()) as any;
      const d = res?.data ?? res;
      setMeetingResult(d);
      setMeetingTopic('');
      // refresh history
      const hRes = await execApi.listAgentMeetings(5) as any;
      setMeetingHistory((hRes?.data ?? hRes) || []);
    } catch { setMeetingResult({ error: true }); }
    finally { setHoldingMeeting(false); }
  }, [meetingTopic]);
  useEffect(() => {
    (execApi.listAgentMeetings(5) as any).then((r: any) => setMeetingHistory((r?.data ?? r) || [])).catch(() => {});
  }, []);

  /* ── 今日日报（下单数/入库数/出库数） ── */
  const [todayBrief, setTodayBrief] = useState({ todayOrderCount: 0, todayOrderQuantity: 0, todayInboundCount: 0, todayInboundQuantity: 0, todayOutboundCount: 0, todayOutboundQuantity: 0 });
  useEffect(() => {
    const ac = new AbortController();
    (api.get('/dashboard/daily-brief', { signal: ac.signal }) as Promise<any>)
      .then((res: any) => {
        const d = res?.data ?? res;
        if (d) {
          setTodayBrief({
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rootRef  = useRef<HTMLDivElement>(null);

  /* URL ?q= 参数：从生产页「问AI分析」或「催→AI」跳转时自动预填问题 */
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      // useSearchParams 已自动解码，无需再 decodeURIComponent（否则含 % 字符会 URIError）
      // setInlineQuery(q); // removed AI panel
      setSearchParams({}, { replace: true }); // 消费后清除 URL 参数，避免刷新重复触发
    }
  }, []);

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

  /* 全屏：监听 Esc 等原生退出事件，同步状态 */
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

  const { pulse, health, notify, workers, heatmap, ranking, shortage, healing, bottleneck: _bottleneck, orders, brain, actionCenter, factoryCapacity } = data;

  /* ── KPI 指标（委托给 useKpiMetrics） ── */
  const {
    kpiFlash, kpiDelta, kpiHistory: _kpiHistory, currentKpiMetrics, factoryCapMap,
    formatDeltaText, renderDeltaBadge, getKpiTrend,
    minFactorySilentMinutes, overdueRisk, orderStats, factoryBottleneck,
    alertCount: _alertCount, healWarnCount: _healWarnCount, totalWarn, tickerItems, handleTickerClick,
  } = useKpiMetrics(data);

  /* 格式化时钟 */
  const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
  const dateStr = now.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short' });

  /* ── KPI Popover 内容（委托给 useKpiPopovers） ── */
  const { scanPop, factoryPop, healthPop, stagnantPop, shortagePop, notifyPop } = useKpiPopovers({ data, currentKpiMetrics, now });

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
            <Tooltip title="查看 AI 执行记录">
              <button className="cockpit-fs-btn" onClick={() => navigate(paths.cockpitTrace)} style={{ marginRight: 4 }}>
                <RobotOutlined />
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
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px 4px', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleCollapse('kpiRow6')}>
          <span style={{ color: '#5a7a9a', fontSize: 11 }}>核心 KPI 指标</span>
          <CollapseChevron panelKey="kpiRow6" />
        </div>
        <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['kpiRow6'] ? 0 : 420, transition: 'max-height 0.28s ease' }}>
        <div className={`cockpit-grid-6${kpiFlash ? ' kpi-flash' : ''}`}>

          {/* 今日生产扫码量 */}
          <Popover overlayClassName="cockpit-kpi-pop" placement="bottom" content={scanPop} mouseEnterDelay={0.15} mouseLeaveDelay={0.1} getPopupContainer={() => rootRef.current || document.body}>
          <div className="c-card c-kpi c-kpi-hoverable">
            <div className="c-kpi-label"><LiveDot size={7} />今日生产扫码量</div>
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
        </div>{/* /kpiRow6-collapsible */}
        {/* ╔══════════════════════════════════════════════╗
            ║   补充 KPI：生产中订单数 + 工厂全景         ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-2">

          {/* 生产中订单数 —— 扩充版 */}
          <div className="c-card" style={{ padding: '12px 14px' }}>
            <div className="c-kpi-label" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('productionOrders')}>
              <LiveDot size={7} color="#f7a600" />生产中订单<CollapseChevron panelKey="productionOrders" />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['productionOrders'] ? 0 : 1200, transition: 'max-height 0.28s ease' }}>
            {/* 主数字 + 总件数 */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ color: '#f7a600', fontSize: 42, fontWeight: 800, textShadow: '0 0 14px #f7a60088', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                <AnimatedNum val={currentKpiMetrics.productionOrderCount} />
              </span>
              <span style={{ color: '#7dacc4', fontSize: 14, fontWeight: 600 }}>单在制</span>
              <span style={{ marginLeft: 'auto', color: '#7dacc4', fontSize: 14, fontWeight: 600 }}>
                总&nbsp;<b style={{ color: '#e0e0e0', fontSize: 28, fontWeight: 800 }}>{orderStats.totalQty.toLocaleString()}</b>&nbsp;件
              </span>
            </div>

            {/* 今日统计：下单 / 入库 / 出库 */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <div
                onClick={() => navigate('/production')}
                style={{ flex: 1, background: 'rgba(247,166,0,0.1)', borderRadius: 6, padding: '8px 6px', border: '1px solid rgba(247,166,0,0.25)', textAlign: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(247,166,0,0.22)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(247,166,0,0.1)')}
              >
                <div style={{ color: '#b8d4e8', fontSize: 12, fontWeight: 600, marginBottom: 3, letterSpacing: 1 }}>今日下单</div>
                <div style={{ color: '#f7a600', fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>{todayBrief.todayOrderCount}<span style={{ color: '#f7c44a', fontSize: 13, fontWeight: 600, marginLeft: 2 }}>单</span></div>
                <div style={{ color: '#f7c44a', fontSize: 13, fontWeight: 700, marginTop: 4 }}>{todayBrief.todayOrderQuantity.toLocaleString()}<span style={{ color: '#9ab8cc', fontSize: 11, marginLeft: 2 }}>件</span></div>
              </div>
              <div
                onClick={() => navigate('/production/warehousing')}
                style={{ flex: 1, background: 'rgba(57,255,20,0.08)', borderRadius: 6, padding: '8px 6px', border: '1px solid rgba(57,255,20,0.22)', textAlign: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(57,255,20,0.18)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(57,255,20,0.08)')}
              >
                <div style={{ color: '#b8d4e8', fontSize: 12, fontWeight: 600, marginBottom: 3, letterSpacing: 1 }}>今日入库</div>
                <div style={{ color: '#39ff14', fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>{todayBrief.todayInboundQuantity.toLocaleString()}<span style={{ color: '#7ddd5a', fontSize: 14, fontWeight: 700, marginLeft: 2 }}>件</span></div>
                <div style={{ color: '#7ddd5a', fontSize: 13, fontWeight: 700, marginTop: 4 }}>{todayBrief.todayInboundCount.toLocaleString()}<span style={{ color: '#9ab8cc', fontSize: 11, marginLeft: 2 }}>单</span></div>
              </div>
              <div
                onClick={() => navigate('/warehouse/finished')}
                style={{ flex: 1, background: 'rgba(0,229,255,0.08)', borderRadius: 6, padding: '8px 6px', border: '1px solid rgba(0,229,255,0.22)', textAlign: 'center', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,229,255,0.18)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,229,255,0.08)')}
              >
                <div style={{ color: '#b8d4e8', fontSize: 12, fontWeight: 600, marginBottom: 3, letterSpacing: 1 }}>今日出库</div>
                <div style={{ color: '#00e5ff', fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>{todayBrief.todayOutboundQuantity.toLocaleString()}<span style={{ color: '#5ad4e8', fontSize: 14, fontWeight: 700, marginLeft: 2 }}>件</span></div>
                <div style={{ color: '#5ad4e8', fontSize: 13, fontWeight: 700, marginTop: 4 }}>{todayBrief.todayOutboundCount.toLocaleString()}<span style={{ color: '#9ab8cc', fontSize: 11, marginLeft: 2 }}>单</span></div>
              </div>
            </div>

            {/* 三色统计块：逾期 / 高风险 / 关注 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10 }}>
              <div
                onClick={() => navigate('/production')}
                style={{ background: 'rgba(255,65,54,0.12)', borderRadius: 6, padding: '8px 6px', border: '1px solid rgba(255,65,54,0.3)', cursor: 'pointer', transition: 'background 0.15s', textAlign: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,65,54,0.25)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,65,54,0.12)')}
              >
                <div style={{ color: '#ff6b6b', fontSize: 12, fontWeight: 600, marginBottom: 3, letterSpacing: 1 }}>已逾期</div>
                <div style={{ color: '#ff4136', fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
                  {overdueRisk.overdue.length}<span style={{ color: '#ff8080', fontSize: 13, fontWeight: 600, marginLeft: 2 }}>单</span>
                </div>
                <div style={{ color: '#ff8080', fontSize: 13, fontWeight: 700, marginTop: 4 }}>{orderStats.overdueQty.toLocaleString()}<span style={{ color: '#9ab8cc', fontSize: 11, marginLeft: 2 }}>件</span></div>
              </div>
              <div
                onClick={() => navigate('/production')}
                style={{ background: 'rgba(247,166,0,0.12)', borderRadius: 6, padding: '8px 6px', border: '1px solid rgba(247,166,0,0.3)', cursor: 'pointer', transition: 'background 0.15s', textAlign: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(247,166,0,0.25)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(247,166,0,0.12)')}
              >
                <div style={{ color: '#f7a600', fontSize: 12, fontWeight: 600, marginBottom: 3, letterSpacing: 1 }}>高风险</div>
                <div style={{ color: '#f7a600', fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
                  {overdueRisk.highRisk.length}<span style={{ color: '#f7c44a', fontSize: 13, fontWeight: 600, marginLeft: 2 }}>单</span>
                </div>
                <div style={{ color: '#f7c44a', fontSize: 13, fontWeight: 700, marginTop: 4 }}>{orderStats.highRiskQty.toLocaleString()}<span style={{ color: '#9ab8cc', fontSize: 11, marginLeft: 2 }}>件</span></div>
              </div>
              <div
                onClick={() => navigate('/production')}
                style={{ background: 'rgba(0,180,255,0.08)', borderRadius: 6, padding: '8px 6px', border: '1px solid rgba(0,180,255,0.2)', cursor: 'pointer', transition: 'background 0.15s', textAlign: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,180,255,0.18)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,180,255,0.08)')}
              >
                <div style={{ color: '#7dacc4', fontSize: 12, fontWeight: 600, marginBottom: 3, letterSpacing: 1 }}>关注中</div>
                <div style={{ color: '#00b4ff', fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
                  {overdueRisk.watch.length}<span style={{ color: '#5ad4e8', fontSize: 13, fontWeight: 600, marginLeft: 2 }}>单</span>
                </div>
                <div style={{ color: '#5ad4e8', fontSize: 13, fontWeight: 700, marginTop: 4 }}>{orderStats.watchQty.toLocaleString()}<span style={{ color: '#9ab8cc', fontSize: 11, marginLeft: 2 }}>件</span></div>
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
            </div>{/* /productionOrders-collapsible */}
          </div>

          {/* 工厂全景 —— 扩充版 */}
          <div className="c-card" style={{ padding: '12px 14px' }}>
            <div className="c-kpi-label" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('factoryOverview')}>
              <LiveDot size={7} color="#00b4ff" />工厂全景<CollapseChevron panelKey="factoryOverview" />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['factoryOverview'] ? 0 : 800, transition: 'max-height 0.28s ease' }}>
            {/* 主数字 + 状态概要 */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ color: '#00e5ff', fontSize: 36, fontWeight: 700, textShadow: '0 0 14px #00b4ff88', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                <AnimatedNum val={currentKpiMetrics.totalFactories} />
              </span>
              <span style={{ color: '#7dacc4', fontSize: 12 }}>家工厂&nbsp;共计</span>
              {factoryCapacity.length > 0 && (
                <span style={{ color: '#7dacc4', fontSize: 11, marginLeft: 4 }}>
                  · {factoryCapacity.reduce((s, f) => s + f.totalOrders, 0)} 单 {factoryCapacity.reduce((s, f) => s + f.totalQuantity, 0).toLocaleString()} 件
                </span>
              )}
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
                  {pulse!.factoryActivity.filter(f => f.active).map(f => {
                    const cap = factoryCapMap.get(f.factoryName);
                    return (
                      <span key={f.factoryName} style={{ background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.3)', borderRadius: 4, padding: '2px 7px', fontSize: 11, color: '#39ff14' }}>
                        {f.factoryName}
                        {cap && <span style={{ color: '#7dacc4', marginLeft: 4, fontSize: 10 }}>{cap.totalOrders}单·{cap.totalQuantity.toLocaleString()}件</span>}
                      </span>
                    );
                  })}
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
                  const cap = factoryCapMap.get(f.factoryName);
                  return (
                    <div key={f.factoryName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: '#e0e0e0' }}>
                        ● {f.factoryName}
                        {cap && <span style={{ color: '#7dacc4', marginLeft: 4, fontSize: 10 }}>{cap.totalOrders}单·{cap.totalQuantity.toLocaleString()}件</span>}
                      </span>
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
            </div>{/* /factoryOverview-collapsible */}
          </div>

        </div>

        <div style={{ padding: '0 20px 10px' }}>
          <StageCapsulePanel orders={orders} />
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
          <OrderScrollPanel
            orders={orders}
            collapsed={collapsedPanels['activeOrders']}
            onToggle={() => toggleCollapse('activeOrders')}
          />

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
              shortage.shortageItems.slice(0, 6).map((item, idx) => (
                <div key={`${item.materialCode}-${idx}`} className="c-shortage-row">
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
            {/* 一键修复按钮 */}
            {healing && healing.needManual > 0 && (
              <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={handleRepair}
                  disabled={repairing}
                  style={{
                    background: 'linear-gradient(135deg, #1677ff, #4096ff)', color: '#fff',
                    border: 'none', borderRadius: 6, padding: '5px 16px', cursor: repairing ? 'wait' : 'pointer',
                    fontSize: 12, fontWeight: 600, opacity: repairing ? 0.6 : 1,
                  }}
                >
                  {repairing ? '修复中…' : '⚡ 一键修复'}
                </button>
                {repairResult && (
                  <span style={{ fontSize: 11, color: repairResult.needManual < 0 ? '#ff4d4f' : '#73d13d' }}>
                    {repairResult.needManual < 0 ? '修复失败' : `已修复 ${repairResult.autoFixed} 项，${repairResult.needManual} 项需人工`}
                  </span>
                )}
              </div>
            )}
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
            ║   Agent 例会（多 Agent 结构化辩论）           ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="c-card" style={{ marginBottom: 16 }}>
          <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('meeting')}>
            <RobotOutlined style={{ color: '#a78bfa', marginRight: 6 }} />
            Agent 智能例会
            <span className="c-card-badge purple-badge">多Agent辩论</span>
            <CollapseChevron panelKey="meeting" />
          </div>
          <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['meeting'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', alignItems: 'center' }}>
              <input
                value={meetingTopic}
                onChange={e => setMeetingTopic(e.target.value)}
                placeholder="输入议题，如：Q3产能分配方案"
                onKeyDown={e => e.key === 'Enter' && holdMeeting()}
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6, padding: '6px 12px', color: '#e0e0e0', fontSize: 13, outline: 'none',
                }}
              />
              <button
                onClick={holdMeeting}
                disabled={holdingMeeting || !meetingTopic.trim()}
                style={{
                  background: 'linear-gradient(135deg, #a78bfa, #7c3aed)', color: '#fff',
                  border: 'none', borderRadius: 6, padding: '6px 16px', cursor: holdingMeeting ? 'wait' : 'pointer',
                  fontSize: 12, fontWeight: 600, opacity: (holdingMeeting || !meetingTopic.trim()) ? 0.5 : 1, whiteSpace: 'nowrap',
                }}
              >
                {holdingMeeting ? '讨论中…' : '🧠 召开例会'}
              </button>
            </div>
            {/* 最新结果 */}
            {meetingResult && !meetingResult.error && (
              <div style={{ padding: '8px 14px', margin: '0 14px 10px', background: 'rgba(167,139,250,0.06)', borderRadius: 8, border: '1px solid rgba(167,139,250,0.15)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#a78bfa', marginBottom: 4 }}>📋 共识结论</div>
                <div style={{ fontSize: 12, color: '#c0c8d0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{meetingResult.consensus || '无共识'}</div>
                {meetingResult.dissent && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#d48806', marginTop: 8, marginBottom: 4 }}>⚠️ 分歧意见</div>
                    <div style={{ fontSize: 12, color: '#a0a8b0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{meetingResult.dissent}</div>
                  </>
                )}
                {meetingResult.confidenceScore != null && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#7aaec8' }}>
                    共识置信度：<span style={{ color: meetingResult.confidenceScore >= 70 ? '#73d13d' : '#d48806', fontWeight: 600 }}>{meetingResult.confidenceScore}%</span>
                    {meetingResult.durationMs > 0 && <span> · 耗时 {(meetingResult.durationMs / 1000).toFixed(1)}s</span>}
                  </div>
                )}
              </div>
            )}
            {meetingResult?.error && <div style={{ padding: '6px 14px', fontSize: 12, color: '#ff4d4f' }}>例会调用失败，请稍后重试</div>}
            {/* 历史记录 */}
            {meetingHistory.length > 0 && (
              <div style={{ padding: '0 14px 10px' }}>
                <div style={{ fontSize: 11, color: '#7aaec8', marginBottom: 6 }}>近期例会</div>
                {meetingHistory.slice(0, 5).map((m: any, idx: number) => (
                  <div key={m.id ?? idx} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <Tag style={{ fontSize: 10, background: '#a78bfa22', color: '#a78bfa', borderColor: '#a78bfa55' }}>{m.meetingType ?? '辩论'}</Tag>
                    <span style={{ fontSize: 12, color: '#d0d8e0', flex: 1 }}>{m.topic}</span>
                    <span style={{ fontSize: 10, color: '#5a6a7a' }}>{m.createTime?.slice(5, 16)?.replace('T', ' ')}</span>
                  </div>
                ))}
              </div>
            )}
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
                {actionCenter.tasks.slice(0, 6).map((task, index) => {
                  const taskRowKey = [task.taskCode, task.relatedOrderNo, task.routePath, index]
                    .filter(Boolean)
                    .join('-');
                  return (
                  <div key={taskRowKey} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: task.routePath ? 'pointer' : 'default' }}
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
                );})}
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

        {/* 多代理图分析 + A/B测试统计：仅超管可见（平台运营工具，非租户业务数据） */}
        {isSuperAdmin && (
          <>
        {/* ╔════════════════════════════════════════════════╗
            ║  Hybrid Graph MAS v4.0 — 多代理自治分析      ║
            ╚════════════════════════════════════════════════╝ */}
        <div style={{ padding: '0 24px 4px' }}>
          <div className="c-card-title" style={{ cursor: 'pointer', padding: '8px 0', marginBottom: 0 }} onClick={() => toggleCollapse('graphmas')}>
            <span style={{ fontSize: 13, color: '#c084fc', fontWeight: 600 }}>🤖 多代理图分析（Graph MAS）</span>
            <span className="c-card-badge" style={{ marginLeft: 8, background: 'rgba(192,132,252,0.15)', color: '#c084fc' }}>
              Plan · Act · Reflect v4.0
            </span>
            <CollapseChevron panelKey="graphmas" />
          </div>
        </div>
        <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['graphmas'] ? 0 : 600, transition: 'max-height 0.3s ease' }}>
          <div style={{ padding: '0 24px 20px' }}>
            <AgentGraphPanel />
          </div>
        </div>

        {/* ╔════════════════════════════════════════════════╗
            ║ A/B 测试统计（模型/场景对比）                  ║
            ╚════════════════════════════════════════════════╝ */}
        <div style={{ padding: '0 24px 4px' }}>
          <div className="c-card-title" style={{ cursor: 'pointer', padding: '8px 0', marginBottom: 0 }} onClick={() => toggleCollapse('abtest')}>
            <span style={{ fontSize: 13, color: '#38bdf8', fontWeight: 600 }}>📊 A/B 测试统计</span>
            <span className="c-card-badge" style={{ marginLeft: 8, background: 'rgba(56,189,248,0.15)', color: '#38bdf8' }}>
              Scene Comparison
            </span>
            <CollapseChevron panelKey="abtest" />
          </div>
        </div>
        <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['abtest'] ? 0 : 400, transition: 'max-height 0.3s ease' }}>
          <div style={{ padding: '0 24px 20px' }}>
            <ABTestStatsPanel />
          </div>
        </div>
          </>
        )}

        {/* ╔════════════════════════════════════════════╝
            ║ 推演仿真（WhatIf）— 所有租户用户可见        ║
            ╚════════════════════════════════════════════╝ */}
        <div style={{ padding: '0 24px 4px' }}>
          <div className="c-card-title" style={{ cursor: 'pointer', padding: '8px 0', marginBottom: 0 }} onClick={() => toggleCollapse('whatif')}>
            <span style={{ fontSize: 13, color: '#fb923c', fontWeight: 600 }}>🔮 推演仿真（What-If）</span>
            <span className="c-card-badge" style={{ marginLeft: 8, background: 'rgba(251,146,60,0.15)', color: '#fb923c' }}>场景推演</span>
            <CollapseChevron panelKey="whatif" />
          </div>
        </div>
        <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['whatif'] ? 0 : 800, transition: 'max-height 0.3s ease' }}>
          <div style={{ padding: '0 24px 20px' }}>
            <WhatIfSimPanel />
          </div>
        </div>

        {/* ╔════════════════════════════════════════════╝
            ║ 月度经营汇总（仅超管可见）                  ║
            ╚════════════════════════════════════════════╝ */}
        {(isSuperAdmin || isTenantOwner || (user?.permissions ?? []).includes('INTELLIGENCE_MONTHLY_VIEW')) && (
          <>
            <div style={{ padding: '0 24px 4px' }}>
              <div
                className="c-card-title"
                style={{ cursor: 'pointer', padding: '8px 0', marginBottom: 0 }}
                onClick={() => toggleCollapse('monthly')}
              >
                <span style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}>📊 月度经营汇总</span>
                <span className="c-card-badge" style={{ marginLeft: 8, background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>
                  全维度报告
                </span>
                <CollapseChevron panelKey="monthly" />
              </div>
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['monthly'] ? 0 : 3000, transition: 'max-height 0.4s ease' }}>
              <div style={{ padding: '0 24px 28px' }}>
                <MonthlyBizSummary />
              </div>
            </div>
          </>
        )}

      </div>

      {/* ⌘K 全局搜索弹窗 */}
      <GlobalSearchModal open={showSearch} onClose={() => setShowSearch(false)} />

    </Layout>
  );
};

export default IntelligenceCenter;
