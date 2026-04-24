import React from 'react';
import { LiveDot, AnimatedNum } from './IntelligenceWidgets';
import CollapseChevron from '../CollapseChevron';

const ProductionOrdersCard: React.FC<any> = ({
  currentKpiMetrics, orderStats, todayBrief, overdueRisk,
  kpiDelta, collapsedPanels, toggleCollapse, renderDeltaBadge, navigate,
}) => (
  <div className="c-card" style={{ padding: '12px 14px' }}>
    <div className="c-kpi-label" style={{ cursor: 'pointer' }} onClick={() => toggleCollapse('productionOrders')}>
      <LiveDot size={7} color="#f7a600" />生产中订单<CollapseChevron panelKey="productionOrders" collapsed={!!collapsedPanels['productionOrders']} />
    </div>
    <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['productionOrders'] ? 0 : 1200, transition: 'max-height 0.28s ease' }}>
    {/* 主数字 + 总件数 */}
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
      <span style={{ color: '#f7a600', fontSize: 42, fontWeight: 800, textShadow: '0 0 14px #f7a60088', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        <AnimatedNum val={currentKpiMetrics.productionOrderCount} />
      </span>
      <span style={{ color: '#7dacc4', fontSize: 14, fontWeight: 600 }}>单生产中</span>
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
        <div style={{ color: '#e8686a', fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
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
        {overdueRisk.overdue.slice(0, 3).map((o: any) => {
          const d = o.plannedEndDate
            ? Math.abs(Math.ceil((new Date(o.plannedEndDate).getTime() - Date.now()) / 86400000))
            : 0;
          return (
            <div key={String(o.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 3, gap: 4 }}>
              <span style={{ color: '#e0e0e0', flex: '0 0 auto', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.orderNo}</span>
              <span style={{ color: '#7dacc4', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{o.factoryName ?? '—'}</span>
              <span style={{ color: '#e8686a', flex: '0 0 auto', whiteSpace: 'nowrap' }}>逾{d}天·{(Number(o.orderQuantity)||0).toLocaleString()}件</span>
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
);

export default ProductionOrdersCard;
