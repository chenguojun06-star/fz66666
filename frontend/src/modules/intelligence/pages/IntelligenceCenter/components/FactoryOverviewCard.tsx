import React from 'react';
import { LiveDot, AnimatedNum } from './IntelligenceWidgets';
import CollapseChevron from '../CollapseChevron';

const FactoryOverviewCard: React.FC<any> = ({
  currentKpiMetrics, pulse: rawPulse, factoryCapacity, factoryCapMap, factoryCapTotals: rawCapTotals,
  kpiDelta, collapsedPanels, toggleCollapse, renderDeltaBadge,
}) => {
  const pulse = rawPulse || {};
  const factoryCapTotals = rawCapTotals || {};
  return (
  <div className="c-card" style={{ padding: '12px 14px' }}>
    <div className="c-kpi-label u-cur-pointer"  onClick={() => toggleCollapse('factoryOverview')}>
      <LiveDot size={7} color="var(--color-accent-neon)" />工厂全景<CollapseChevron panelKey="factoryOverview" collapsed={!!collapsedPanels['factoryOverview']} />
    </div>
    <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['factoryOverview'] ? 0 : 1200, transition: 'max-height 0.28s ease' }}>
    <div className="u-d-flex u-gap-8 u-mt-6" style={{ alignItems: 'baseline' }}>
      <span style={{ color: 'var(--color-accent-neon)', fontSize: 42, fontWeight: 800, textShadow: '0 0 14px rgba(57,255,20,0.53)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        <AnimatedNum val={currentKpiMetrics.totalFactories} />
      </span>
      <span className="u-fs-14 u-fw-600" style={{ color: 'var(--color-blue-300)' }}>工厂</span>
      <span className="u-ml-auto u-fs-14" style={{ color: 'var(--color-blue-300)' }}>
        {factoryCapTotals.totalOrders} 单 {factoryCapTotals.totalQuantity}件
      </span>
    </div>

    {/* 在线 / 停滞 状态胶囊 */}
    <div className="u-d-flex u-gap-12 u-mt-8 u-fwrap-wrap">
      <span className="u-d-inline-flex u-ai-center u-fs-14 u-fw-700" style={{ gap: 5, background: 'rgba(57,255,20,0.10)', border: '1px solid rgba(57,255,20,0.3)', borderRadius: 99, padding: '3px 10px', color: 'var(--color-accent-neon)' }}>
        <LiveDot size={6} color="var(--color-accent-neon)" />{pulse.factoryActivity?.filter((f: any) => f.active).length ?? 0} 在线
      </span>
      <span className="u-d-inline-flex u-ai-center u-fs-14 u-fw-700" style={{ gap: 5, background: 'rgba(255,115,0,0.10)', border: '1px solid rgba(255,115,0,0.3)', borderRadius: 99, padding: '3px 10px', color: 'var(--color-orange-500)' }}>
        <LiveDot size={6} color="var(--color-orange-500)" />{pulse.stagnantFactories?.length ?? 0} 停滞
      </span>
    </div>

    {/* 活跃工厂明细 */}
    {pulse.factoryActivity?.filter((f: any) => f.active).length > 0 && (
      <div className="u-mt-10">
        <div className="u-fs-14 u-mb-4" style={{ color: 'var(--color-blue-300)' }}>活跃工厂</div>
        {pulse.factoryActivity.filter((f: any) => f.active).map((f: any) => {
          const cap = factoryCapMap[f.factoryName] || {};
          return (
            <div key={f.factoryName} className="u-d-flex u-ai-center u-gap-6 u-fs-14" style={{ marginBottom: 3 }}>
              <LiveDot size={5} color="var(--color-accent-neon)" />
              <span className="u-flex-1 u-ov-hidden u-ws-nowrap" style={{ color: 'var(--color-border-light)', textOverflow: 'ellipsis' }}>{f.factoryName}</span>
              {cap.orderCount != null && <span className="u-fs-14" style={{ color: 'var(--color-blue-300)' }}>{cap.orderCount}单&nbsp;{(cap.totalQuantity||0).toLocaleString()}件</span>}
            </div>
          );
        })}
      </div>
    )}

    {/* 停滞工厂明细 */}
    {pulse.stagnantFactories?.length > 0 && (
      <div className="u-mt-10" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
        <div className="u-fs-14 u-mb-4" style={{ color: 'var(--color-orange-500)' }}>停滞工厂</div>
        {pulse.stagnantFactories.map((sf: any) => {
          const m = sf.minutesSilent || 0;
          const h = Math.floor(m / 60);
          const rm = m % 60;
          return (
            <div key={sf.factoryName} className="u-d-flex u-ai-center u-gap-6 u-fs-14" style={{ marginBottom: 3 }}>
              <LiveDot size={5} color="var(--color-orange-500)" />
              <span className="u-flex-1 u-ov-hidden u-ws-nowrap" style={{ color: 'var(--color-border-light)', textOverflow: 'ellipsis' }}>{sf.factoryName}</span>
              <span className="u-fs-14" style={{ color: 'var(--color-orange-500)' }}>{h > 0 ? `${h}h${rm}m` : `${rm}m`} 静默</span>
            </div>
          );
        })}
      </div>
    )}

    {factoryCapacity?.length === 0 && pulse.factoryActivity?.length === 0 && (
      <div className="u-fs-14 u-ta-center" style={{ color: 'var(--color-blue-400)', marginTop: 14 }}>暂无工厂产能数据</div>
    )}

    <div className="c-kpi-delta-row u-mt-8" >
      {renderDeltaBadge(kpiDelta.totalFactories, { flatText: '工厂稳定', suffix: '厂' })}
    </div>
    </div>{/* /factoryOverview-collapsible */}
  </div>
  );
};

export default FactoryOverviewCard;
