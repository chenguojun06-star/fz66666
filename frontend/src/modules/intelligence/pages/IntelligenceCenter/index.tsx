import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Tag, Tooltip } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ThunderboltOutlined, SyncOutlined,
  WarningOutlined, CheckCircleOutlined,
  FullscreenOutlined, FullscreenExitOutlined, SearchOutlined,
} from '@ant-design/icons';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import { useAuth } from '@/utils/AuthContext';
import ProfitDeliveryPanel from './ProfitDeliveryPanel';
import LiveScanFeed from './LiveScanFeed';
import CollapseChevron from './CollapseChevron';
import AgentMeetingCard from './AgentMeetingCard';
import BrainActionGrid from './BrainActionGrid';

import {
  risk2color, LiveDot, Sparkline,
  AnimatedNum, medalColor,
} from './components/IntelligenceWidgets';
import { OrderScrollPanel, AutoScrollBox, BottleneckRow } from './components/OrderScrollPanel';
import { useCockpit } from './hooks/useCockpit';
import GlobalSearchModal from './components/GlobalSearchModal';
import MonthlyBizSummary from './MonthlyBizSummary';
import KpiCardRow from './components/KpiCardRow';
import ProductionOrdersCard from './components/ProductionOrdersCard';
import FactoryOverviewCard from './components/FactoryOverviewCard';
import OverdueRiskCard from './components/OverdueRiskCard';
import WhatIfSimPanel from './WhatIfSimPanel';
import AgentGraphPanel from '../../components/AgentGraphPanel';
import ABTestStatsPanel from '../../components/ABTestStatsPanel';
import StageCapsulePanel from './components/StageCapsulePanel';
import { useKpiMetrics } from './hooks/useKpiMetrics';
import { useKpiPopovers } from './KpiPopoverContent';
import { useRepairAction } from './hooks/useRepairAction';
import { useAgentMeeting } from './hooks/useAgentMeeting';
import { useTodayBrief } from './hooks/useTodayBrief';
import { usePanelCollapse } from './hooks/usePanelCollapse';
import { useTaskExecution } from './hooks/useTaskExecution';
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
  const { repairing, repairResult, handleRepair } = useRepairAction(reload);
  /* ── Agent 例会 ── */
  const { meetingTopic, setMeetingTopic, holdingMeeting, meetingResult, meetingHistory, holdMeeting } = useAgentMeeting();
  /* ── 今日日报 ── */
  const todayBrief = useTodayBrief();
  /* ── 主面板折叠/展开 ── */
  const { collapsedPanels, toggleCollapse } = usePanelCollapse();
  /* ── 任务执行 ── */
  const { executingTask, executeTaskResult, handleExecuteTask } = useTaskExecution(reload);

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

  /* ── useMemo: 热力图 O(1) 查找 Map ── */
  const heatmapCellMap = useMemo(() => {
    const m = new Map<string, (typeof heatmap.cells)[number]>();
    (heatmap?.cells || []).forEach(c => m.set(`${c.process}|${c.factory}`, c));
    return m;
  }, [heatmap?.cells]);

  /* ── useMemo: 工厂产能汇总 ── */
  const factoryCapTotals = useMemo(() => ({
    totalOrders: (factoryCapacity || []).reduce((s: number, f: any) => s + f.totalOrders, 0),
    totalQuantity: (factoryCapacity || []).reduce((s: number, f: any) => s + f.totalQuantity, 0),
  }), [factoryCapacity]);

  return (
    <>
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
                <XiaoyunCloudAvatar size={18} active />
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
            <span className="cockpit-ticker-label"> 紧急预警</span>
            <div className="cockpit-ticker-track">
              <div className="cockpit-ticker-inner"
                style={{ animationDuration: `${Math.max(12, tickerItems.length * 5)}s` }}>
                {[...tickerItems, ...tickerItems].map((item, i) => (
                  <button
                    key={`${item.orderNo}-${i}`}
                    type="button"
                    className={`cockpit-ticker-item ${item.level}`}
                    onClick={() => handleTickerClick(item.orderNo)}
                    title={`点击查看 ${item.orderNo} 工序跟进`}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <KpiCardRow kpiFlash={kpiFlash} collapsedPanels={collapsedPanels} toggleCollapse={toggleCollapse} rootRef={rootRef} scanPop={scanPop} factoryPop={factoryPop} healthPop={healthPop} stagnantPop={stagnantPop} shortagePop={shortagePop} notifyPop={notifyPop} currentKpiMetrics={currentKpiMetrics} pulse={pulse} health={health} healing={healing} shortage={shortage} notify={notify} kpiDelta={kpiDelta} formatDeltaText={formatDeltaText} renderDeltaBadge={renderDeltaBadge} getKpiTrend={getKpiTrend} />
        {/* ╔══════════════════════════════════════════════╗
            ║   补充 KPI：生产中订单数 + 工厂全景         ║
            ╚══════════════════════════════════════════════╝ */}
        <div className="cockpit-grid-2">

          <ProductionOrdersCard currentKpiMetrics={currentKpiMetrics} orderStats={orderStats} todayBrief={todayBrief} overdueRisk={overdueRisk} kpiDelta={kpiDelta} collapsedPanels={collapsedPanels} toggleCollapse={toggleCollapse} renderDeltaBadge={renderDeltaBadge} navigate={navigate} />

          <FactoryOverviewCard currentKpiMetrics={currentKpiMetrics} pulse={pulse} factoryCapacity={factoryCapacity} factoryCapMap={factoryCapMap} factoryCapTotals={factoryCapTotals} kpiDelta={kpiDelta} collapsedPanels={collapsedPanels} toggleCollapse={toggleCollapse} renderDeltaBadge={renderDeltaBadge} />

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
              <CollapseChevron panelKey="pulse" collapsed={!!collapsedPanels['pulse']} />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['pulse'] ? 0 : 800, transition: 'max-height 0.28s ease' }}>
            <div style={{ margin: '6px 0 4px' }}>
              <Sparkline pts={(pulse?.timeline ?? []).map(p => Number(p.quantity) || 0)} color="#00e5ff" width={340} height={52} />
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
                      <span className="c-fa-dot" style={{ background: f.active ? '#39ff14' : mins < 90 ? '#f7a600' : '#e8686a' }} />
                      <span className="c-fa-name">{f.factoryName}</span>
                      <span className="c-fa-time" style={{ color: f.active ? '#39ff14' : mins < 90 ? '#f7a600' : '#e8686a' }}>{timeStr}</span>
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
              <CollapseChevron panelKey="workers" collapsed={!!collapsedPanels['workers']} />
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
                          : { g: 'D', c: '#e8686a' };
                        return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <b style={{ color: grd.c, border: `1px solid ${grd.c}55`, padding: '0 3px', borderRadius: 3, fontSize: 10 }}>{grd.g}</b>
                            {w.trend === 'UP' ? '' : w.trend === 'DOWN' ? '' : ''}
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
              <CollapseChevron panelKey="bottleneck" collapsed={!!collapsedPanels['bottleneck']} />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['bottleneck'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
            <AutoScrollBox className="c-orders-scroll">
              {factoryBottleneck.map(f => <BottleneckRow key={f.factoryName} item={f} />)}
              {!factoryBottleneck.length && <div className="c-empty">暂无在制订单</div>}
            </AutoScrollBox>
            </div>
          </div>

          <OverdueRiskCard overdueRisk={overdueRisk} collapsedPanels={collapsedPanels} toggleCollapse={toggleCollapse} />

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
              <CollapseChevron panelKey="shortage" collapsed={!!collapsedPanels['shortage']} />
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
                    color: item.riskLevel === 'HIGH' ? '#e8686a' : item.riskLevel === 'MEDIUM' ? '#f7a600' : '#39ff14',
                  }}>
                    {item.riskLevel === 'HIGH' ? ' 库存严重不足' : item.riskLevel === 'MEDIUM' ? '库存偏紧' : '适量补充'}
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
              <LiveDot size={7} color={(heatmap?.totalDefects ?? 0) > 0 ? '#e8686a' : '#39ff14'} />
              质量缺陷热力图
              {heatmap && (
                <span className="c-card-badge red-badge">
                  总缺陷 {heatmap.totalDefects}
                </span>
              )}
              <CollapseChevron panelKey="heatmap" collapsed={!!collapsedPanels['heatmap']} />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['heatmap'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
            {heatmap?.cells?.length ? (
              <>
                <div className="c-heatmap-meta">
                  风险工序：<b style={{ color: '#e8686a' }}>{heatmap.worstProcess}</b>
                  &nbsp;·&nbsp;风险工厂：<b style={{ color: '#e8686a' }}>{heatmap.worstFactory}</b>
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
                        const cell = heatmapCellMap.get(`${proc}|${fac}`);
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
              <CollapseChevron panelKey="healing" collapsed={!!collapsedPanels['healing']} />
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
                  {repairing ? '修复中…' : ' 一键修复'}
                </button>
                {repairResult && (
                  <span style={{ fontSize: 11, color: repairResult.needManual < 0 ? '#ff7875' : '#73d13d' }}>
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
              <CollapseChevron panelKey="ranking" collapsed={!!collapsedPanels['ranking']} />
            </div>
            <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['ranking'] ? 0 : 500, transition: 'max-height 0.28s ease' }}>
            {ranking?.rankings?.length ? (
              ranking.rankings.slice(0, 5).map((r, i) => (
                <div key={r.factoryId} className="c-rank-row">
                  <span className="c-rank-medal" style={{ color: medalColor[i] ?? '#7a8999' }}>
                    {i < 3 ? ['','',''][i] : `#${r.rank}`}
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

        <AgentMeetingCard
          meetingTopic={meetingTopic}
          setMeetingTopic={setMeetingTopic}
          holdingMeeting={holdingMeeting}
          holdMeeting={holdMeeting}
          meetingResult={meetingResult}
          meetingHistory={meetingHistory}
          collapsedPanels={collapsedPanels}
          toggleCollapse={toggleCollapse}
        />

        <BrainActionGrid
          brain={brain}
          actionCenter={actionCenter}
          collapsedPanels={collapsedPanels}
          toggleCollapse={toggleCollapse}
          executingTask={executingTask}
          executeTaskResult={executeTaskResult}
          handleExecuteTask={handleExecuteTask}
          navigate={navigate}
        />

        {/* ╔════════════════════════════════════════════╗
            ║ 底部：利润/完工双引擎(左) + AI智能顾问(右)  ║
            ╚════════════════════════════════════════════╝ */}
        <div style={{ padding: '0 24px 4px' }}>
          <div className="c-card-title" style={{ cursor: 'pointer', padding: '8px 0', marginBottom: 0 }} onClick={() => toggleCollapse('profit')}>
            <span style={{ fontSize: 13, color: '#a78bfa', fontWeight: 600 }}> 订单利润估算 &amp; 完工预测</span>
            <span className="c-card-badge purple-badge" style={{ marginLeft: 8 }}>AI 双引擎分析</span>
            <CollapseChevron panelKey="profit" collapsed={!!collapsedPanels['profit']} />
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
            <span style={{ fontSize: 13, color: '#c084fc', fontWeight: 600 }}> 多代理图分析（Graph MAS）</span>
            <span className="c-card-badge" style={{ marginLeft: 8, background: 'rgba(192,132,252,0.15)', color: '#c084fc' }}>
              Plan · Act · Reflect v4.0
            </span>
            <CollapseChevron panelKey="graphmas" collapsed={!!collapsedPanels['graphmas']} />
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
            <span style={{ fontSize: 13, color: '#38bdf8', fontWeight: 600 }}> A/B 测试统计</span>
            <span className="c-card-badge" style={{ marginLeft: 8, background: 'rgba(56,189,248,0.15)', color: '#38bdf8' }}>
              Scene Comparison
            </span>
            <CollapseChevron panelKey="abtest" collapsed={!!collapsedPanels['abtest']} />
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
            <span style={{ fontSize: 13, color: '#fb923c', fontWeight: 600 }}> 推演仿真（What-If）</span>
            <span className="c-card-badge" style={{ marginLeft: 8, background: 'rgba(251,146,60,0.15)', color: '#fb923c' }}>场景推演</span>
            <CollapseChevron panelKey="whatif" collapsed={!!collapsedPanels['whatif']} />
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
                <span style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}> 月度经营汇总</span>
                <span className="c-card-badge" style={{ marginLeft: 8, background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>
                  全维度报告
                </span>
                <CollapseChevron panelKey="monthly" collapsed={!!collapsedPanels['monthly']} />
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

    </>
  );
};

export default IntelligenceCenter;
