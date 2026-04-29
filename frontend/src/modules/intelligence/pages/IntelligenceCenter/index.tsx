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
import LiveScanFeed from './LiveScanFeed';
import CollapseChevron from './CollapseChevron';

import {
  risk2color, LiveDot, Sparkline,
  AnimatedNum, medalColor,
} from './components/IntelligenceWidgets';
import { OrderScrollPanel, AutoScrollBox, BottleneckRow } from './components/OrderScrollPanel';
import { useCockpit } from './hooks/useCockpit';
import GlobalSearchModal from './components/GlobalSearchModal';
import KpiCardRow from './components/KpiCardRow';
import ProductionOrdersCard from './components/ProductionOrdersCard';
import FactoryOverviewCard from './components/FactoryOverviewCard';
import OverdueRiskCard from './components/OverdueRiskCard';
import AgentGraphPanel from '../../components/AgentGraphPanel';
import ABTestStatsPanel from '../../components/ABTestStatsPanel';
import StageCapsulePanel from './components/StageCapsulePanel';
import { useKpiMetrics } from './hooks/useKpiMetrics';
import { useKpiPopovers } from './KpiPopoverContent';
import { useRepairAction } from './hooks/useRepairAction';
import { useTodayBrief } from './hooks/useTodayBrief';
import { usePanelCollapse } from './hooks/usePanelCollapse';
import { useTimerManager } from './hooks/useTimerManager';
import { paths } from '@/routeConfig';
import './styles.css';

const IntelligenceCenter: React.FC = () => {
  const navigate = useNavigate();
  const { data, reload } = useCockpit();
  const [countdown, setCountdown]   = useState(30);
  const [now, setNow]               = useState(new Date());
  const { isSuperAdmin } = useAuth();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const { repairing, repairResult, handleRepair } = useRepairAction(reload);
  const todayBrief = useTodayBrief();
  const { collapsedPanels, toggleCollapse } = usePanelCollapse();
  const timers = useTimerManager();

  const rootRef  = useRef<HTMLDivElement>(null);
  const nowRef   = useRef(new Date());
  const countdownRef = useRef(30);

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setSearchParams({}, { replace: true });
    }
  }, []);

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
    timers.setInterval({
      id: 'cockpit-countdown',
      interval: 1000,
      callback: () => {
        nowRef.current = new Date();
        countdownRef.current -= 1;
        if (countdownRef.current <= 0) {
          reload();
          countdownRef.current = 30;
          setNow(new Date());
          setCountdown(30);
        } else if (countdownRef.current % 5 === 0) {
          setNow(new Date());
        }
        setCountdown(countdownRef.current);
      },
    });
  }, [reload, timers]);

  const handleReload = () => { reload(); setCountdown(30); };

  const { pulse, health, notify, workers, heatmap, ranking, shortage, healing, bottleneck: _bottleneck, orders, factoryCapacity } = data;

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
    const m = new Map<string, (typeof heatmap.cells)[number]>();
    (heatmap?.cells || []).forEach(c => m.set(`${c.process}|${c.factory}`, c));
    return m;
  }, [heatmap?.cells]);

  const factoryCapTotals = useMemo(() => ({
    totalOrders: (factoryCapacity || []).reduce((s: number, f: any) => s + f.totalOrders, 0),
    totalQuantity: (factoryCapacity || []).reduce((s: number, f: any) => s + f.totalQuantity, 0),
  }), [factoryCapacity]);

  return (
    <>
      <div className={`cockpit-root${isFullscreen ? ' cockpit-fullscreen' : ''}`} ref={rootRef}>

        <div className="cockpit-header">
          <div className="cockpit-header-left">
            <LiveDot size={10} />
            <span className="cockpit-badge-live">LIVE</span>
            <ThunderboltOutlined style={{ color: '#00e5ff', fontSize: 18 }} />
            <span className="cockpit-title">智能运营驾驶舱</span>
            <span className="cockpit-subtitle">全链路实时指挥 · AI 决策引擎</span>
          </div>

          <div className="cockpit-clock">
            <span className="cockpit-time">{timeStr}</span>
            <span className="cockpit-date">{dateStr}</span>
          </div>

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

        <div className="cockpit-refresh-bar">
          <div className="cockpit-refresh-bar-fill" style={{ width: `${(countdown / 30) * 100}%` }} />
        </div>

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

        <div className="cockpit-grid-2">
          <ProductionOrdersCard currentKpiMetrics={currentKpiMetrics} orderStats={orderStats} todayBrief={todayBrief} overdueRisk={overdueRisk} kpiDelta={kpiDelta} collapsedPanels={collapsedPanels} toggleCollapse={toggleCollapse} renderDeltaBadge={renderDeltaBadge} navigate={navigate} />
          <FactoryOverviewCard currentKpiMetrics={currentKpiMetrics} pulse={pulse} factoryCapacity={factoryCapacity} factoryCapMap={factoryCapMap} factoryCapTotals={factoryCapTotals} kpiDelta={kpiDelta} collapsedPanels={collapsedPanels} toggleCollapse={toggleCollapse} renderDeltaBadge={renderDeltaBadge} />
        </div>

        <div style={{ padding: '0 20px 10px' }}>
          <StageCapsulePanel orders={orders} />
        </div>

        <div className="cockpit-grid-2">
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
            {(pulse?.factoryActivity?.length ?? 0) > 0 ? (
              <div className="c-factory-activity-list">
                {pulse!.factoryActivity.map(f => {
                  const mins = f.minutesSinceLastScan;
                  const timeStr = mins < 1 ? '刚刚' : mins < 60 ? `${mins}分钟前` : `${Math.floor(mins/60)}h${mins%60}m前`;
                  return (
                    <div key={f.factoryName} className={`c-factory-activity-row${f.active ? '' : ' inactive'}`}>
                      <span className="c-fa-dot" style={{ background: f.active ? '#39ff14' : mins < 90 ? '#f7a600' : '#e03030' }} />
                      <span className="c-fa-name">{f.factoryName}</span>
                      <span className="c-fa-time" style={{ color: f.active ? '#39ff14' : mins < 90 ? '#f7a600' : '#e03030' }}>{timeStr}</span>
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
            <LiveScanFeed
              minMinutesSinceLastScan={minFactorySilentMinutes}
              currentScanRatePerHour={Number(pulse?.scanRatePerHour) || 0}
            />
            </div>
          </div>

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
                          : { g: 'D', c: '#e03030' };
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

        <div className="cockpit-grid-3">
          <OrderScrollPanel
            orders={orders}
            collapsed={collapsedPanels['activeOrders']}
            onToggle={() => toggleCollapse('activeOrders')}
          />
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

        <div className="cockpit-grid-5-7">
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
                    color: item.riskLevel === 'HIGH' ? '#e03030' : item.riskLevel === 'MEDIUM' ? '#f7a600' : '#39ff14',
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

          <div className="c-card">
            <div className="c-card-title" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('heatmap')}>
              <LiveDot size={7} color={(heatmap?.totalDefects ?? 0) > 0 ? '#e03030' : '#39ff14'} />
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
                  风险工序：<b style={{ color: '#e03030' }}>{heatmap.worstProcess}</b>
                  &nbsp;·&nbsp;风险工厂：<b style={{ color: '#e03030' }}>{heatmap.worstFactory}</b>
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
                            style={{ background: `rgba(224,48,48,${alpha})`, color: alpha > 0.45 ? '#fff' : '#aaa' }}>
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

        <div className="cockpit-grid-2">
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

        {isSuperAdmin && (
          <>
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

      </div>

      <GlobalSearchModal open={showSearch} onClose={() => setShowSearch(false)} />

    </>
  );
};

export default IntelligenceCenter;
