import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useTimeDimension, TimeDimension } from '../contexts/TimeDimensionContext';
import { useStyleLink } from '../contexts/StyleLinkContext';
import api from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import './OverviewChart.css';

interface TrendData {
  date: string;
  orderCount: number;
  productionCount: number;
  inboundCount: number;
}

interface OverviewChartProps {
  mode?: 'sidebar' | 'stage';
  moduleKey?: string;
  position?: { x: number; y: number; width: number; height: number };
}

const COLORS = {
  order: { ring: '#a78bfa', text: '#94a3b8' },
  production: { ring: '#60a5fa', text: '#94a3b8' },
  inbound: { ring: '#34d399', text: '#94a3b8' },
};

const OverviewChart: React.FC<OverviewChartProps> = ({ mode = 'sidebar', moduleKey, position }) => {
  const { dimension, getDateRange } = useTimeDimension();
  const styleLink = useStyleLink();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (mode !== 'stage' || !containerRef.current) return;
    const el = containerRef.current;
    const parentEl = el.parentElement;
    const targetEl = parentEl || el;

    const update = () => {
      const w = targetEl.getBoundingClientRect().width;
      const h = targetEl.getBoundingClientRect().height;
      const minDim = Math.min(w, h);
      setScale(Math.max(0.5, Math.min(2, minDim / 500)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(targetEl);
    return () => ro.disconnect();
  }, [mode]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const res = await api.get<{ code: number; data: { records?: ProductionOrder[] } }>('/production/order/list', {
          params: {
            page: 1,
            pageSize: 1000,
            excludeTerminal: true,
          },
        });
        setOrders(res?.data?.records || []);
      } catch (e) {
        console.error('Load overview data failed:', e);
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, []);

  const styleList = useMemo(() => {
    return orders
      .filter(o => o.styleNo)
      .map(o => ({ styleNo: o.styleNo, styleName: o.styleName }));
  }, [orders]);

  useEffect(() => {
    if (mode === 'stage' && styleLink && moduleKey && position && styleList.length > 0) {
      styleLink.registerStyle(moduleKey, styleList, position);
    }
  }, [mode, styleLink, moduleKey, position, styleList]);

  useEffect(() => {
    return () => {
      if (styleLink && moduleKey) {
        styleLink.unregisterModule(moduleKey);
      }
    };
  }, [styleLink, moduleKey]);

  const trendData = useMemo(() => {
    const { start, end } = getDateRange();
    const data: TrendData[] = [];
    let points = 7;

    switch (dimension) {
      case 'day': points = 24; break;
      case 'week': points = 7; break;
      case 'month': points = 30; break;
      case 'year': points = 12; break;
    }

    const msPerPoint = (end.getTime() - start.getTime()) / points;

    for (let i = 0; i < points; i++) {
      const pointStart = new Date(start.getTime() + i * msPerPoint);
      const pointEnd = new Date(start.getTime() + (i + 1) * msPerPoint);
      let label = '';

      if (dimension === 'day') {
        label = `${pointStart.getHours().toString().padStart(2, '0')}:00`;
      } else if (dimension === 'week' || dimension === 'month') {
        label = `${(pointStart.getMonth() + 1).toString().padStart(2, '0')}-${pointStart.getDate().toString().padStart(2, '0')}`;
      } else {
        label = `${pointStart.getFullYear()}-${(pointStart.getMonth() + 1).toString().padStart(2, '0')}`;
      }

      const periodOrders = orders.filter(o => {
        const dateStr = String(o.createTime || o.createdAt || o.orderDate || '');
        if (!dateStr || dateStr === 'undefined') return false;
        const orderDate = new Date(dateStr);
        if (isNaN(orderDate.getTime())) return false;
        return orderDate >= pointStart && orderDate < pointEnd;
      });

      const orderCount = periodOrders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);
      const productionCount = periodOrders.filter(o => String(o.status||'').toUpperCase() === 'PRODUCTION').reduce((sum, o) => sum + (o.orderQuantity || 0), 0);
      const inboundCount = periodOrders.filter(o => String(o.status||'').toUpperCase() === 'COMPLETED').reduce((sum, o) => sum + (o.inStockQuantity || o.orderQuantity || 0), 0);

      data.push({ date: label, orderCount, productionCount, inboundCount });
    }

    return data;
  }, [orders, dimension, getDateRange]);

  const filteredStats = useMemo(() => {
    const { start, end } = getDateRange();

    const filteredOrders = orders.filter(o => {
      const dateStr = String(o.createTime || o.createdAt || o.orderDate || '');
      if (!dateStr || dateStr === 'undefined') return false;
      const orderDate = new Date(dateStr);
      if (isNaN(orderDate.getTime())) return false;
      return orderDate >= start && orderDate <= end;
    });

    const totalOrders = filteredOrders.length;
    const totalOrderQty = filteredOrders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);
    const productionOrders = filteredOrders.filter(o => String(o.status||'').toUpperCase() === 'PRODUCTION');
    const productionQty = productionOrders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);
    const completedOrders = filteredOrders.filter(o => String(o.status||'').toUpperCase() === 'COMPLETED');
    const inboundQty = completedOrders.reduce((sum, o) => sum + (o.inStockQuantity || o.orderQuantity || 0), 0);

    const days = dimension === 'day' ? 1 : dimension === 'week' ? 7 : dimension === 'month' ? 30 : 365;
    const avgOrderCycle = totalOrders > 0 ? Math.round((days / totalOrders) * 10) / 10 : 0;
    const avgOrderQty = totalOrders > 0 ? Math.round(totalOrderQty / totalOrders) : 0;
    const avgProductionTime = productionQty > 0 ? Math.round((days * 24 / productionQty) * 10) / 10 : 0;
    const avgInboundTime = inboundQty > 0 ? Math.round((days * 24 / inboundQty) * 10) / 10 : 0;

    return {
      order: { count: totalOrders, qty: totalOrderQty, avgCycle: avgOrderCycle, avgQty: avgOrderQty },
      production: { count: productionOrders.length, qty: productionQty, avgTime: avgProductionTime },
      inbound: { count: completedOrders.length, qty: inboundQty, avgTime: avgInboundTime },
    };
  }, [orders, dimension, getDateRange]);

  const stats = filteredStats;

  const buildSmoothPath = useCallback((values: number[], width: number, height: number, padding: number) => {
    if (!values.length) return '';
    const max = Math.max(...values, 1);
    const n = values.length;
    const xs = values.map((_, i) => (i / Math.max(n - 1, 1)) * width);
    const ys = values.map(v => height - (v / max) * (height - padding * 2) - padding);

    let path = `M ${xs[0]},${ys[0]}`;
    for (let i = 1; i < n; i++) {
      const dx = (xs[i] - xs[i - 1]) * 0.38;
      path += ` C ${xs[i - 1] + dx},${ys[i - 1]} ${xs[i] - dx},${ys[i]} ${xs[i]},${ys[i]}`;
    }
    return path;
  }, []);

  const getY = useCallback((value: number, max: number, height: number, padding: number) => {
    return height - (value / max) * (height - padding * 2) - padding;
  }, []);

  const renderPie = useCallback((value: number, total: number, color: string) => {
    const size = 100;
    const radius = size / 2 - 14;
    const circumference = 2 * Math.PI * radius;
    const percent = total > 0 ? (value / total) * 100 : 0;
    const strokeDasharray = `${(percent / 100) * circumference} ${circumference}`;
    const center = size / 2;

    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="overview-mini-pie" preserveAspectRatio="xMidYMid meet">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(148, 163, 184, 0.15)"
          strokeWidth={16}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={16}
          strokeDasharray={strokeDasharray}
          strokeDashoffset={circumference / 4}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
        <text x={center} y={center} textAnchor="middle" dominantBaseline="middle" className="pie-value" fill="#94a3b8">
          {Math.round(percent)}%
        </text>
      </svg>
    );
  }, []);

  const handleHover = useCallback((index: number | null) => {
    setHoverIndex(index);
  }, []);

  const total = stats.order.count + stats.production.count + stats.inbound.count;
  const maxValue = Math.max(...trendData.map(d => Math.max(d.orderCount, d.productionCount, d.inboundCount)), 1);

  return (
    <div ref={containerRef} className="overview-chart-wrapper" style={{ '--ov-scale': scale } as React.CSSProperties}>
      {mode === 'sidebar' ? (
        <div className="overview-sidebar-mode">
          <div className="overview-sidebar-title">业务概览</div>
          <div className="overview-sidebar-stats">
            <span>下单 {stats.order.count}单</span>
            <span>生产 {stats.production.count}单</span>
            <span>入库 {stats.inbound.qty}件</span>
          </div>
        </div>
      ) : (
        <>
          <div className="overview-pies">
            <div className="overview-pie-card">
              <div className="pie-left">
                {renderPie(stats.order.count, Math.max(total, 1), COLORS.order.ring)}
              </div>
              <div className="pie-right">
                <div className="pie-title">下单</div>
                <div className="pie-stats">
                  <div className="pie-stat">
                    <span className="stat-value">{stats.order.avgCycle}</span>
                    <span className="stat-unit">天/单</span>
                  </div>
                  <div className="pie-stat">
                    <span className="stat-value">{stats.order.avgQty}</span>
                    <span className="stat-unit">件/单</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="overview-pie-card">
              <div className="pie-left">
                {renderPie(stats.production.count, Math.max(total, 1), COLORS.production.ring)}
              </div>
              <div className="pie-right">
                <div className="pie-title">生产</div>
                <div className="pie-stats">
                  <div className="pie-stat">
                    <span className="stat-value">{stats.production.qty}</span>
                    <span className="stat-unit">件</span>
                  </div>
                  <div className="pie-stat">
                    <span className="stat-value">{stats.production.avgTime}</span>
                    <span className="stat-unit">时/件</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="overview-pie-card">
              <div className="pie-left">
                {renderPie(stats.inbound.count, Math.max(total, 1), COLORS.inbound.ring)}
              </div>
              <div className="pie-right">
                <div className="pie-title">入库</div>
                <div className="pie-stats">
                  <div className="pie-stat">
                    <span className="stat-value">{stats.inbound.qty}</span>
                    <span className="stat-unit">件</span>
                  </div>
                  <div className="pie-stat">
                    <span className="stat-value">{stats.inbound.avgTime}</span>
                    <span className="stat-unit">时/件</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="overview-trend">
            <div className="overview-trend-header">趋势图</div>
            <div className="overview-chart-container">
              <svg viewBox="0 0 400 120" className="overview-chart-svg" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="orderGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.order.ring} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={COLORS.order.ring} stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="productionGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.production.ring} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={COLORS.production.ring} stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="inboundGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.inbound.ring} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={COLORS.inbound.ring} stopOpacity="0" />
                  </linearGradient>
                </defs>

                {trendData.length > 1 && (
                  <>
                    <path
                      d={buildSmoothPath(trendData.map(d => d.orderCount), 400, 120, 10) + ` L 400,120 L 0,120 Z`}
                      fill="url(#orderGrad)"
                    />
                    <path
                      d={buildSmoothPath(trendData.map(d => d.productionCount), 400, 120, 10) + ` L 400,120 L 0,120 Z`}
                      fill="url(#productionGrad)"
                    />
                    <path
                      d={buildSmoothPath(trendData.map(d => d.inboundCount), 400, 120, 10) + ` L 400,120 L 0,120 Z`}
                      fill="url(#inboundGrad)"
                    />

                    <path
                      d={buildSmoothPath(trendData.map(d => d.orderCount), 400, 120, 10)}
                      fill="none"
                      stroke={COLORS.order.ring}
                      strokeWidth={0.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={buildSmoothPath(trendData.map(d => d.productionCount), 400, 120, 10)}
                      fill="none"
                      stroke={COLORS.production.ring}
                      strokeWidth={0.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={buildSmoothPath(trendData.map(d => d.inboundCount), 400, 120, 10)}
                      fill="none"
                      stroke={COLORS.inbound.ring}
                      strokeWidth={0.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {hoverIndex !== null && trendData[hoverIndex] && (
                      <>
                        <line
                          x1={(hoverIndex / (trendData.length - 1)) * 400}
                          y1={0}
                          x2={(hoverIndex / (trendData.length - 1)) * 400}
                          y2={120}
                          stroke="rgba(79, 209, 197, 0.4)"
                          strokeWidth={1}
                          strokeDasharray="4,4"
                        />
                        <circle
                          cx={(hoverIndex / (trendData.length - 1)) * 400}
                          cy={getY(trendData[hoverIndex].orderCount, maxValue, 120, 10)}
                          r={3}
                          fill={COLORS.order.ring}
                          stroke="#fff"
                          strokeWidth={1.5}
                        />
                        <circle
                          cx={(hoverIndex / (trendData.length - 1)) * 400}
                          cy={getY(trendData[hoverIndex].productionCount, maxValue, 120, 10)}
                          r={3}
                          fill={COLORS.production.ring}
                          stroke="#fff"
                          strokeWidth={1.5}
                        />
                        <circle
                          cx={(hoverIndex / (trendData.length - 1)) * 400}
                          cy={getY(trendData[hoverIndex].inboundCount, maxValue, 120, 10)}
                          r={3}
                          fill={COLORS.inbound.ring}
                          stroke="#fff"
                          strokeWidth={1.5}
                        />
                      </>
                    )}
                  </>
                )}
              </svg>

              <div className="overview-hover-areas">
                {trendData.map((d, i) => (
                  <div
                    key={i}
                    className="hover-area"
                    onMouseEnter={() => handleHover(i)}
                    onMouseLeave={() => handleHover(null)}
                  >
                    {hoverIndex === i && (
                      <div className="hover-tooltip">
                        <div className="tooltip-date">{d.date}</div>
                        <div className="tooltip-row" style={{ color: COLORS.order.text }}>
                          <span className="tooltip-label">下单</span>
                          <span className="tooltip-value">{d.orderCount}</span>
                        </div>
                        <div className="tooltip-row" style={{ color: COLORS.production.text }}>
                          <span className="tooltip-label">生产</span>
                          <span className="tooltip-value">{d.productionCount}</span>
                        </div>
                        <div className="tooltip-row" style={{ color: COLORS.inbound.text }}>
                          <span className="tooltip-label">入库</span>
                          <span className="tooltip-value">{d.inboundCount}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="overview-chart-labels">
                {trendData.filter((_, i) => i % Math.ceil(trendData.length / 6) === 0).map((d, i) => (
                  <span key={i} className="chart-label">{d.date}</span>
                ))}
              </div>
            </div>

            <div className="overview-legend">
              <span className="legend-item"><span className="legend-dot" style={{ background: COLORS.order.ring }}></span>下单</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: COLORS.production.ring }}></span>生产</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: COLORS.inbound.ring }}></span>入库</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default React.memo(OverviewChart);
