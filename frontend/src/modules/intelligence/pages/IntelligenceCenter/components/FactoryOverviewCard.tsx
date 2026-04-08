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
    <div className="c-kpi-label" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('factoryOverview')}>
      <LiveDot size={7} color="#39ff14" />工厂全景<CollapseChevron panelKey="factoryOverview" collapsed={!!collapsedPanels['factoryOverview']} />
    </div>
    <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['factoryOverview'] ? 0 : 1200, transition: 'max-height 0.28s ease' }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
      <span style={{ color: '#39ff14', fontSize: 42, fontWeight: 800, textShadow: '0 0 14px rgba(57,255,20,0.53)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        <AnimatedNum val={currentKpiMetrics.totalFactories} />
      </span>
      <span style={{ color: '#7dacc4', fontSize: 14, fontWeight: 600 }}>工厂</span>
      <span style={{ marginLeft: 'auto', color: '#7dacc4', fontSize: 12 }}>
        {factoryCapTotals.totalOrders} 单 {factoryCapTotals.totalQuantity}件
      </span>
    </div>

    {/* 在线 / 停滞 状态胶囊 */}
    <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(57,255,20,0.10)', border: '1px solid rgba(57,255,20,0.3)', borderRadius: 99, padding: '3px 10px', fontSize: 12, color: '#39ff14', fontWeight: 700 }}>
        <LiveDot size={6} color="#39ff14" />{pulse.factoryActivity?.filter((f: any) => f.active).length ?? 0} 在线
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,115,0,0.10)', border: '1px solid rgba(255,115,0,0.3)', borderRadius: 99, padding: '3px 10px', fontSize: 12, color: '#ff7300', fontWeight: 700 }}>
        <LiveDot size={6} color="#ff7300" />{pulse.stagnantFactories?.length ?? 0} 停滞
      </span>
    </div>

    {/* 活跃工厂明细 */}
    {pulse.factoryActivity?.filter((f: any) => f.active).length > 0 && (
      <div style={{ marginTop: 10 }}>
        <div style={{ color: '#7dacc4', fontSize: 10, marginBottom: 4 }}>活跃工厂</div>
        {pulse.factoryActivity.filter((f: any) => f.active).map((f: any) => {
          const cap = factoryCapMap[f.factoryName] || {};
          return (
            <div key={f.factoryName} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 3 }}>
              <LiveDot size={5} color="#39ff14" />
              <span style={{ color: '#e0e0e0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.factoryName}</span>
              {cap.orderCount != null && <span style={{ color: '#7dacc4', fontSize: 10 }}>{cap.orderCount}单&nbsp;{(cap.totalQuantity||0).toLocaleString()}件</span>}
            </div>
          );
        })}
      </div>
    )}

    {/* 停滞工厂明细 */}
    {pulse.stagnantFactories?.length > 0 && (
      <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
        <div style={{ color: '#ff7300', fontSize: 10, marginBottom: 4 }}>停滞工厂</div>
        {pulse.stagnantFactories.map((sf: any) => {
          const m = sf.minutesSilent || 0;
          const h = Math.floor(m / 60);
          const rm = m % 60;
          return (
            <div key={sf.factoryName} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 3 }}>
              <LiveDot size={5} color="#ff7300" />
              <span style={{ color: '#e0e0e0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sf.factoryName}</span>
              <span style={{ color: '#ff7300', fontSize: 10 }}>{h > 0 ? `${h}h${rm}m` : `${rm}m`} 静默</span>
            </div>
          );
        })}
      </div>
    )}

    {factoryCapacity?.length === 0 && pulse.factoryActivity?.length === 0 && (
      <div style={{ color: '#5c9ab8', fontSize: 12, textAlign: 'center', marginTop: 14 }}>暂无工厂产能数据</div>
    )}

    <div className="c-kpi-delta-row" style={{ marginTop: 8 }}>
      {renderDeltaBadge(kpiDelta.totalFactories, { flatText: '工厂稳定', suffix: '厂' })}
    </div>
    </div>{/* /factoryOverview-collapsible */}
  </div>
  );
};

export default FactoryOverviewCard;
