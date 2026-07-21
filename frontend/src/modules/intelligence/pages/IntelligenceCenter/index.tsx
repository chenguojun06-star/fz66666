import React from 'react';
import { useIntelligenceCenterData } from './hooks/useIntelligenceCenterData';
import { OrderScrollPanel } from './components/OrderScrollPanel';
import KpiCardRow from './components/KpiCardRow';
import ProductionOrdersCard from './components/ProductionOrdersCard';
import FactoryOverviewCard from './components/FactoryOverviewCard';
import OverdueRiskCard from './components/OverdueRiskCard';
import StageCapsulePanel from './components/StageCapsulePanel';
import CockpitHeader from './components/CockpitHeader';
import CockpitTicker from './components/CockpitTicker';
import PulsePanel from './components/PulsePanel';
import WorkerEfficiencyPanel from './components/WorkerEfficiencyPanel';
import BottleneckPanel from './components/BottleneckPanel';
import ShortagePanel from './components/ShortagePanel';
import HeatmapPanel from './components/HeatmapPanel';
import HealingPanel from './components/HealingPanel';
import RankingPanel from './components/RankingPanel';
import SuperAdminPanels from './components/SuperAdminPanels';
import { paths } from '@/routeConfig';
import './styles.css';

const IntelligenceCenter: React.FC = () => {
  const d = useIntelligenceCenterData();

  return (
    <>
      <div className={`cockpit-root${d.isFullscreen ? ' cockpit-fullscreen' : ''}`} ref={d.rootRef}>

        <CockpitHeader
          timeStr={d.timeStr}
          dateStr={d.dateStr}
          countdown={d.countdown}
          totalWarn={d.totalWarn}
          loading={d.data.loading}
          isFullscreen={d.isFullscreen}
          onReload={d.handleReload}
          onToggleFullscreen={d.toggleFullscreen}
          onNavigateTrace={() => d.navigate(paths.cockpitTrace)}
          onOpenCommandPalette={() => window.dispatchEvent(new CustomEvent('command-palette:open'))}
        />

        <div className="cockpit-refresh-bar">
          <div className="cockpit-refresh-bar-fill" style={{ width: `${(d.countdown / 30) * 100}%` }} />
        </div>

        <CockpitTicker tickerItems={d.tickerItems} onTickerClick={d.handleTickerClick} />

        <KpiCardRow
          kpiFlash={d.kpiFlash}
          collapsedPanels={d.collapsedPanels}
          toggleCollapse={d.toggleCollapse}
          rootRef={d.rootRef}
          scanPop={d.scanPop}
          factoryPop={d.factoryPop}
          healthPop={d.healthPop}
          stagnantPop={d.stagnantPop}
          shortagePop={d.shortagePop}
          notifyPop={d.notifyPop}
          currentKpiMetrics={d.currentKpiMetrics}
          pulse={d.pulse}
          health={d.health}
          healing={d.healing}
          shortage={d.shortage}
          notify={d.notify}
          kpiDelta={d.kpiDelta}
          formatDeltaText={d.formatDeltaText}
          renderDeltaBadge={d.renderDeltaBadge}
          getKpiTrend={d.getKpiTrend}
        />

        <div className="cockpit-grid-2">
          <ProductionOrdersCard
            currentKpiMetrics={d.currentKpiMetrics}
            orderStats={d.orderStats}
            todayBrief={d.todayBrief}
            overdueRisk={d.overdueRisk}
            kpiDelta={d.kpiDelta}
            collapsedPanels={d.collapsedPanels}
            toggleCollapse={d.toggleCollapse}
            renderDeltaBadge={d.renderDeltaBadge}
            navigate={d.navigate}
          />
          <FactoryOverviewCard
            currentKpiMetrics={d.currentKpiMetrics}
            pulse={d.pulse}
            factoryCapacity={d.factoryCapacity}
            factoryCapMap={d.factoryCapMap}
            factoryCapTotals={d.factoryCapTotals}
            kpiDelta={d.kpiDelta}
            collapsedPanels={d.collapsedPanels}
            toggleCollapse={d.toggleCollapse}
            renderDeltaBadge={d.renderDeltaBadge}
          />
        </div>

        <div style={{ padding: '0 20px 10px' }}>
          <StageCapsulePanel orders={d.orders} />
        </div>

        <div className="cockpit-grid-2">
          <PulsePanel
            pulse={d.pulse}
            collapsedPanels={d.collapsedPanels}
            toggleCollapse={d.toggleCollapse}
            isLowEnd={d.isLowEnd}
            minFactorySilentMinutes={d.minFactorySilentMinutes}
          />
          <WorkerEfficiencyPanel
            workers={d.workers}
            collapsedPanels={d.collapsedPanels}
            toggleCollapse={d.toggleCollapse}
          />
        </div>

        <div className="cockpit-grid-3">
          <OrderScrollPanel
            orders={d.orders}
            collapsed={d.collapsedPanels['activeOrders']}
            onToggle={() => d.toggleCollapse('activeOrders')}
          />
          <BottleneckPanel
            factoryBottleneck={d.factoryBottleneck}
            collapsedPanels={d.collapsedPanels}
            toggleCollapse={d.toggleCollapse}
          />
          <OverdueRiskCard
            overdueRisk={d.overdueRisk}
            collapsedPanels={d.collapsedPanels}
            toggleCollapse={d.toggleCollapse}
          />
        </div>

        <div className="cockpit-grid-5-7">
          <ShortagePanel
            shortage={d.shortage}
            collapsedPanels={d.collapsedPanels}
            toggleCollapse={d.toggleCollapse}
          />
          <HeatmapPanel
            heatmap={d.heatmap}
            heatmapCellMap={d.heatmapCellMap}
            collapsedPanels={d.collapsedPanels}
            toggleCollapse={d.toggleCollapse}
            isLowEnd={d.isLowEnd}
          />
        </div>

        <div className="cockpit-grid-2">
          <HealingPanel
            healing={d.healing}
            repairing={d.repairing}
            repairResult={d.repairResult}
            onRepair={d.handleRepair}
            collapsedPanels={d.collapsedPanels}
            toggleCollapse={d.toggleCollapse}
          />
          <RankingPanel
            ranking={d.ranking}
            collapsedPanels={d.collapsedPanels}
            toggleCollapse={d.toggleCollapse}
          />
        </div>

        {d.isSuperAdmin && !d.isLowEnd && (
          <SuperAdminPanels
            collapsedPanels={d.collapsedPanels}
            toggleCollapse={d.toggleCollapse}
          />
        )}

      </div>
    </>
  );
};

export default IntelligenceCenter;
