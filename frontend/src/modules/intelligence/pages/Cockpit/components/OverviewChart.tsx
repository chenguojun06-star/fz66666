import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Spin } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons';
import { useTimeDimension } from '../contexts/TimeDimensionContext';
import api from '@/utils/api';
import './OverviewChart.css';

interface TrendDataPoint {
  value: number;
  label: string;
}

const COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed'];
const CHART_COLOR = '#2563eb';

const OverviewChart: React.FC = () => {
  const { getDateRange } = useTimeDimension();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgWidth, setSvgWidth] = useState(500);

  const [metrics, setMetrics] = useState({
    todayOrder: 0,
    todaySample: 0,
    todayProduction: 0,
    todayInbound: 0,
    todayOutbound: 0,
  });

  const [chartData, setChartData] = useState([
    { label: '订单', value: 0, color: COLORS[0] },
    { label: '样衣', value: 0, color: COLORS[1] },
    { label: '生产', value: 0, color: COLORS[2] },
    { label: '采购', value: 0, color: COLORS[3] },
    { label: '仓库', value: 0, color: COLORS[4] },
  ]);

  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getDateRange();
      const [ordersRes, stylesRes, purchasesRes, warehouseRes] = await Promise.all([
        api.get<{ code: number; data: { records?: any[]; total?: number } }>('/production/order/list', {
          params: { page: 1, pageSize: 1, startDate: start.toISOString(), endDate: end.toISOString() },
        }),
        api.get<{ code: number; data: { records?: any[]; total?: number } }>('/style/info/list', {
          params: { page: 1, pageSize: 1, startDate: start.toISOString(), endDate: end.toISOString() },
        }),
        api.get<{ code: number; data: { records?: any[]; total?: number } }>('/production/purchase/list', {
          params: { page: 1, pageSize: 1, startDate: start.toISOString(), endDate: end.toISOString() },
        }),
        api.post<{ code: number; data: { records?: any[]; total?: number } }>('/warehouse/finished-inventory/list', {
          page: 1, pageSize: 1, startDate: start.toISOString(), endDate: end.toISOString(),
        }),
      ]);

      const orderCount = ordersRes?.data?.total || 0;
      const sampleCount = stylesRes?.data?.total || 0;
      const procurementCount = purchasesRes?.data?.total || 0;
      const warehouseCount = warehouseRes?.data?.total || 0;

      setChartData([
        { label: '订单', value: orderCount, color: COLORS[0] },
        { label: '样衣', value: sampleCount, color: COLORS[1] },
        { label: '生产', value: orderCount, color: COLORS[2] },
        { label: '采购', value: procurementCount, color: COLORS[3] },
        { label: '仓库', value: warehouseCount, color: COLORS[4] },
      ]);

      // Generate mock trend data
      const days: TrendDataPoint[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push({ value: Math.floor(Math.random() * 50) + 10, label: d.toISOString().split('T')[0] });
      }
      setTrendData(days);

      // Mock metrics
      setMetrics({
        todayOrder: Math.floor(Math.random() * 20) + 5,
        todaySample: Math.floor(Math.random() * 15) + 3,
        todayProduction: Math.floor(Math.random() * 30) + 10,
        todayInbound: Math.floor(Math.random() * 10) + 2,
        todayOutbound: Math.floor(Math.random() * 15) + 5,
      });
    } catch (err) {
      setError('加载失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        if (e.contentRect.width > 0) setSvgWidth(e.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chartSVG = useMemo(() => {
    const total = chartData.reduce((s, d) => s + d.value, 0);
    if (total === 0) return null;
    const radius = 50;
    let angle = -90;
    const slices: string[] = [];
    for (const d of chartData) {
      const sliceAngle = (d.value / total) * 360;
      const startAngle = angle;
      const endAngle = angle + sliceAngle;
      if (sliceAngle >= 360) {
        slices.push(`<circle cx="70" cy="70" r="${radius}" fill="${d.color}" stroke="#fff" stroke-width="2"/>`);
      } else {
        const start = polarToCartesian(70, 70, radius, startAngle);
        const end = polarToCartesian(70, 70, radius, endAngle);
        const large = sliceAngle > 180 ? 1 : 0;
        slices.push(`<path d="M 70 70 L ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y} Z" fill="${d.color}" stroke="#fff" stroke-width="2"/>`);
      }
      angle = endAngle;
    }
    const innerR = 30;
    return `
      <svg viewBox="0 0 140 140" style="width:120px;height:120px;">
        ${slices.join('')}
        <circle cx="70" cy="70" r="${innerR}" fill="#fff"/>
        <text x="70" y="66" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">${total}</text>
        <text x="70" y="80" text-anchor="middle" font-size="8" fill="#94a3b8">总计</text>
      </svg>
    `;
  }, [chartData]);

  const trendSVG = useMemo(() => {
    if (trendData.length < 2 || svgWidth < 200) return null;
    const values = trendData.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = { top: 10, right: 10, bottom: 20, left: 40 };
    const w = svgWidth - pad.left - pad.right;
    const h = 80;
    const points = values.map((v, i) => ({
      x: pad.left + (i / (values.length - 1)) * w,
      y: pad.top + h - ((v - min) / range) * (h - pad.top),
    }));
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${pad.top + h} L ${points[0].x} ${pad.top + h} Z`;
    return { linePath, areaPath, points, w: svgWidth, h: pad.top + h, pad, trendData };
  }, [trendData, svgWidth]);

  const formatDate = (d: string) => {
    const parts = d.split('-');
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  };

  const metricItems = [
    { label: '今日下单', value: metrics.todayOrder, trend: 'up' as const },
    { label: '今日样衣', value: metrics.todaySample, trend: 'down' as const },
    { label: '今日生产', value: metrics.todayProduction, trend: 'up' as const },
    { label: '今日入库', value: metrics.todayInbound, trend: 'stable' as const },
    { label: '今日出库', value: metrics.todayOutbound, trend: 'up' as const },
  ];

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin /></div>;
  }

  if (error) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>{error}</div>;
  }

  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="overview-chart-wrapper">
      {/* 核心指标 */}
      <div className="overview-metrics">
        {metricItems.map((m, i) => (
          <div className="overview-metric" key={i}>
            <div className="overview-metric-value">
              {m.value}
              {m.trend === 'up' && <ArrowUpOutlined style={{ color: '#059669', fontSize: 12, marginLeft: 4 }} />}
              {m.trend === 'down' && <ArrowDownOutlined style={{ color: '#dc2626', fontSize: 12, marginLeft: 4 }} />}
              {m.trend === 'stable' && <MinusOutlined style={{ color: '#94a3b8', fontSize: 12, marginLeft: 4 }} />}
            </div>
            <div className="overview-metric-label">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="overview-divider" />

      {/* 图表区域 */}
      <div className="overview-charts">
        <div className="overview-chart-left">
          <div className="overview-subtitle">业务分布</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div dangerouslySetInnerHTML={{ __html: chartSVG || '' }} />
            <div className="overview-legend">
              {chartData.map((d, i) => (
                <div className="overview-legend-item" key={i}>
                  <span className="overview-legend-dot" style={{ background: d.color }} />
                  <span>{d.label}</span>
                  <span style={{ fontWeight: 600, color: '#0f172a', marginLeft: 4 }}>
                    {d.value}
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>
                    ({total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="overview-chart-right">
          <div className="overview-subtitle">7日趋势</div>
          {trendSVG ? (
            <div className="overview-trend-chart" ref={containerRef}>
              <svg width={trendSVG.w} height={trendSVG.h} style={{ display: 'block' }}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLOR} stopOpacity="0.15" />
                    <stop offset="100%" stopColor={CHART_COLOR} stopOpacity="0.01" />
                  </linearGradient>
                </defs>
                <path d={trendSVG.areaPath} fill="url(#trendGrad)" />
                <path d={trendSVG.linePath} fill="none" stroke={CHART_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                {trendSVG.points.map((p, i) => (
                  <g key={i}>
                    {hoveredIdx === i && (
                      <>
                        <line x1={p.x} y1={trendSVG.pad.top} x2={p.x} y2={trendSVG.pad.top + 80} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3,3" />
                        <rect x={p.x - 30} y={p.y - 28} width={60} height={22} rx={4} fill="#0f172a" />
                        <text x={p.x} y={p.y - 13} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={600}>
                          {trendData[i].value}
                        </text>
                      </>
                    )}
                    <circle cx={p.x} cy={p.y} r={hoveredIdx === i ? 5 : 3} fill="#fff" stroke={CHART_COLOR} strokeWidth={2} style={{ cursor: 'pointer' }} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)} />
                  </g>
                ))}
                {trendSVG.trendData.map((d, i) => (
                  <text key={i} x={trendSVG.points[i].x} y={trendSVG.h - 4} textAnchor="middle" fill="#94a3b8" fontSize={9}>
                    {formatDate(d.label)}
                  </text>
                ))}
              </svg>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 12 }}>暂无趋势数据</div>
          )}
        </div>
      </div>
    </div>
  );
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export default React.memo(OverviewChart);
