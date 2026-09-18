import React from 'react';
import { LiveDot, AnimatedNum } from './IntelligenceWidgets';
import CollapseChevron from '../CollapseChevron';

const ProductionOrdersCard: React.FC<any> = ({
  currentKpiMetrics, orderStats, todayBrief, overdueRisk,
  kpiDelta, collapsedPanels, toggleCollapse, renderDeltaBadge, navigate,
}) => (
  <div className="c-card" style={{ padding: '12px 14px' }}>
    <div className="c-kpi-label u-cur-pointer"  onClick={() => toggleCollapse('productionOrders')}>
      <LiveDot size={7} color="var(--color-warning-deep)" />生产中订单<CollapseChevron panelKey="productionOrders" collapsed={!!collapsedPanels['productionOrders']} />
    </div>
    <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['productionOrders'] ? 0 : 1200, transition: 'max-height 0.28s ease' }}>
    {/* 主数字 + 总件数 */}
    <div className="u-d-flex u-gap-8 u-mt-6" style={{ alignItems: 'baseline' }}>
      <span style={{ color: 'var(--color-warning-deep)', fontSize: 42, fontWeight: 800, textShadow: '0 0 14px var(--color-warning-deep)88', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        <AnimatedNum val={currentKpiMetrics.productionOrderCount} />
      </span>
      <span className="u-fs-14 u-fw-600" style={{ color: 'var(--color-blue-300)' }}>单生产中</span>
      <span className="u-ml-auto u-fs-14 u-fw-600" style={{ color: 'var(--color-blue-300)' }}>
        总&nbsp;<b className="u-fs-28" style={{ color: 'var(--color-border-light)', fontWeight: 800 }}>{orderStats.totalQty.toLocaleString()}</b>&nbsp;件
      </span>
    </div>

    {/* 今日统计：下单 / 入库 / 出库 */}
    <div className="u-d-flex u-gap-6 u-mt-8">
      <div
        onClick={() => navigate('/production')}
        className="u-flex-1 u-br-6 u-ta-center u-cur-pointer" style={{ background: 'rgba(247,166,0,0.1)', padding: '8px 6px', border: '1px solid rgba(247,166,0,0.25)', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(247,166,0,0.22)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(247,166,0,0.1)')}
      >
        <div className="u-fs-14 u-fw-600" style={{ color: 'var(--color-blue-200)', marginBottom: 3, letterSpacing: 1 }}>今日下单</div>
        <div className="u-fs-28" style={{ color: 'var(--color-warning-deep)', fontWeight: 800, lineHeight: 1.1 }}>{todayBrief.todayOrderCount}<span className="u-fs-14 u-fw-600 u-ml-2" style={{ color: 'var(--color-amber-400)' }}>单</span></div>
        <div className="u-fs-14 u-fw-700 u-mt-4" style={{ color: 'var(--color-amber-400)' }}>{todayBrief.todayOrderQuantity.toLocaleString()}<span className="u-fs-14 u-ml-2" style={{ color: 'var(--color-blue-300)' }}>件</span></div>
      </div>
      <div
        onClick={() => navigate('/production/warehousing')}
        className="u-flex-1 u-br-6 u-ta-center u-cur-pointer" style={{ background: 'rgba(57,255,20,0.08)', padding: '8px 6px', border: '1px solid rgba(57,255,20,0.22)', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(57,255,20,0.18)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(57,255,20,0.08)')}
      >
        <div className="u-fs-14 u-fw-600" style={{ color: 'var(--color-blue-200)', marginBottom: 3, letterSpacing: 1 }}>今日入库</div>
        <div style={{ color: 'var(--color-accent-neon)', fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>{todayBrief.todayInboundQuantity.toLocaleString()}<span className="u-fs-14 u-fw-700 u-ml-2" style={{ color: 'var(--color-emerald-400)' }}>件</span></div>
        <div className="u-fs-14 u-fw-700 u-mt-4" style={{ color: 'var(--color-emerald-400)' }}>{todayBrief.todayInboundCount.toLocaleString()}<span className="u-fs-14 u-ml-2" style={{ color: 'var(--color-blue-300)' }}>单</span></div>
      </div>
      <div
        onClick={() => navigate('/warehouse/finished')}
        className="u-flex-1 u-br-6 u-ta-center u-cur-pointer" style={{ background: 'rgba(0,229,255,0.08)', padding: '8px 6px', border: '1px solid rgba(0,229,255,0.22)', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,229,255,0.18)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,229,255,0.08)')}
      >
        <div className="u-fs-14 u-fw-600" style={{ color: 'var(--color-blue-200)', marginBottom: 3, letterSpacing: 1 }}>今日出库</div>
        <div style={{ color: 'var(--color-accent-cyan-bright)', fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>{todayBrief.todayOutboundQuantity.toLocaleString()}<span className="u-fs-14 u-fw-700 u-ml-2" style={{ color: 'var(--color-cyan-400)' }}>件</span></div>
        <div className="u-fs-14 u-fw-700 u-mt-4" style={{ color: 'var(--color-cyan-400)' }}>{todayBrief.todayOutboundCount.toLocaleString()}<span className="u-fs-14 u-ml-2" style={{ color: 'var(--color-blue-300)' }}>单</span></div>
      </div>
    </div>

    {/* 三色统计块：逾期 / 高风险 / 关注 */}
    <div className="u-d-grid u-gap-6 u-mt-10" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
      <div
        onClick={() => navigate('/production')}
        className="u-br-6 u-cur-pointer u-ta-center" style={{ background: 'rgba(224,48,48,0.12)', padding: '8px 6px', border: '1px solid rgba(224,48,48,0.3)', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(224,48,48,0.25)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(224,48,48,0.12)')}
      >
        <div className="u-fs-14 u-fw-600" style={{ color: 'var(--color-coral)', marginBottom: 3, letterSpacing: 1 }}>已逾期</div>
        <div className="u-fs-28" style={{ color: 'var(--color-danger)', fontWeight: 800, lineHeight: 1.1 }}>
          {overdueRisk.overdue.length}<span className="u-fs-14 u-fw-600 u-ml-2" style={{ color: 'var(--color-red-300)' }}>单</span>
        </div>
        <div className="u-fs-14 u-fw-700 u-mt-4" style={{ color: 'var(--color-red-300)' }}>{orderStats.overdueQty.toLocaleString()}<span className="u-fs-14 u-ml-2" style={{ color: 'var(--color-blue-300)' }}>件</span></div>
      </div>
      <div
        onClick={() => navigate('/production')}
        className="u-br-6 u-cur-pointer u-ta-center" style={{ background: 'rgba(247,166,0,0.12)', padding: '8px 6px', border: '1px solid rgba(247,166,0,0.3)', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(247,166,0,0.25)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(247,166,0,0.12)')}
      >
        <div className="u-fs-14 u-fw-600" style={{ color: 'var(--color-warning-deep)', marginBottom: 3, letterSpacing: 1 }}>高风险</div>
        <div className="u-fs-28" style={{ color: 'var(--color-warning-deep)', fontWeight: 800, lineHeight: 1.1 }}>
          {overdueRisk.highRisk.length}<span className="u-fs-14 u-fw-600 u-ml-2" style={{ color: 'var(--color-amber-400)' }}>单</span>
        </div>
        <div className="u-fs-14 u-fw-700 u-mt-4" style={{ color: 'var(--color-amber-400)' }}>{orderStats.highRiskQty.toLocaleString()}<span className="u-fs-14 u-ml-2" style={{ color: 'var(--color-blue-300)' }}>件</span></div>
      </div>
      <div
        onClick={() => navigate('/production')}
        className="u-br-6 u-cur-pointer u-ta-center" style={{ background: 'rgba(0,180,255,0.08)', padding: '8px 6px', border: '1px solid rgba(0,180,255,0.2)', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,180,255,0.18)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,180,255,0.08)')}
      >
        <div className="u-fs-14 u-fw-600" style={{ color: 'var(--color-blue-300)', marginBottom: 3, letterSpacing: 1 }}>关注中</div>
        <div className="u-fs-28" style={{ color: 'var(--color-cyan-500)', fontWeight: 800, lineHeight: 1.1 }}>
          {overdueRisk.watch.length}<span className="u-fs-14 u-fw-600 u-ml-2" style={{ color: 'var(--color-cyan-400)' }}>单</span>
        </div>
        <div className="u-fs-14 u-fw-700 u-mt-4" style={{ color: 'var(--color-cyan-400)' }}>{orderStats.watchQty.toLocaleString()}<span className="u-fs-14 u-ml-2" style={{ color: 'var(--color-blue-300)' }}>件</span></div>
      </div>
    </div>

    {/* 逾期订单明细（最多3条） */}
    {overdueRisk.overdue.length > 0 && (
      <div className="u-mt-10" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
        <div className="u-fs-14" style={{ color: 'var(--color-blue-300)', marginBottom: 5 }}>逾期订单明细</div>
        {overdueRisk.overdue.slice(0, 3).map((o: any) => {
          const d = o.plannedEndDate
            ? Math.abs(Math.ceil((new Date(o.plannedEndDate).getTime() - Date.now()) / 86400000))
            : 0;
          return (
            <div key={String(o.id)} className="u-d-flex u-jc-between u-ai-center u-fs-14 u-gap-4" style={{ marginBottom: 3 }}>
              <span className="u-ov-hidden u-ws-nowrap" style={{ color: 'var(--color-border-light)', flex: '0 0 auto', maxWidth: 120, textOverflow: 'ellipsis' }}>{o.orderNo}</span>
              <span className="u-flex-1 u-ov-hidden u-ws-nowrap u-ta-center" style={{ color: 'var(--color-blue-300)', textOverflow: 'ellipsis' }}>{o.factoryName ?? '—'}</span>
              <span className="u-ws-nowrap" style={{ color: 'var(--color-danger)', flex: '0 0 auto' }}>逾{d}天·{(Number(o.orderQuantity)||0).toLocaleString()}件</span>
            </div>
          );
        })}
        {overdueRisk.overdue.length > 3 && (
          <div className="u-fs-14 u-ta-right" style={{ color: 'var(--color-blue-400)' }}>还有 {overdueRisk.overdue.length - 3} 单…</div>
        )}
      </div>
    )}

    <div className="c-kpi-delta-row u-mt-8" >
      {renderDeltaBadge(kpiDelta.productionOrderCount, { flatText: '订单稳定', suffix: '单' })}
    </div>
    </div>{/* /productionOrders-collapsible */}
  </div>
);

export default React.memo(ProductionOrdersCard);
