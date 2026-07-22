import React, { useState, useCallback } from 'react';

interface TrendData {
  date: string;
  orderCount: number;
  productionCount: number;
  inboundCount: number;
}

interface TrendChartProps {
  data: TrendData[];
  colors: {
    order: { ring: string; text: string };
    production: { ring: string; text: string };
    inbound: { ring: string; text: string };
  };
}

const buildSmoothPath = (values: number[], width: number, height: number, padding: number) => {
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
};

const getY = (value: number, max: number, height: number, padding: number) => {
  return height - (value / max) * (height - padding * 2) - padding;
};

const TrendChart: React.FC<TrendChartProps> = ({ data, colors }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const handleHover = useCallback((index: number | null) => {
    setHoverIndex(index);
  }, []);

  const maxValue = Math.max(...data.map(d => Math.max(d.orderCount, d.productionCount, d.inboundCount)), 1);

  return (
    <div className="overview-trend">
      <div className="overview-trend-header">趋势图</div>
      <div className="overview-chart-container">
        <svg viewBox="0 0 400 120" className="overview-chart-svg" preserveAspectRatio="none">
          <defs>
            <linearGradient id="orderGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.order.ring} stopOpacity="0.25" />
              <stop offset="100%" stopColor={colors.order.ring} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="productionGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.production.ring} stopOpacity="0.25" />
              <stop offset="100%" stopColor={colors.production.ring} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="inboundGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.inbound.ring} stopOpacity="0.25" />
              <stop offset="100%" stopColor={colors.inbound.ring} stopOpacity="0" />
            </linearGradient>
          </defs>

          {data.length > 1 && (
            <>
              <path
                d={buildSmoothPath(data.map(d => d.orderCount), 400, 120, 10) + ` L 400,120 L 0,120 Z`}
                fill="url(#orderGrad)"
              />
              <path
                d={buildSmoothPath(data.map(d => d.productionCount), 400, 120, 10) + ` L 400,120 L 0,120 Z`}
                fill="url(#productionGrad)"
              />
              <path
                d={buildSmoothPath(data.map(d => d.inboundCount), 400, 120, 10) + ` L 400,120 L 0,120 Z`}
                fill="url(#inboundGrad)"
              />

              <path
                d={buildSmoothPath(data.map(d => d.orderCount), 400, 120, 10)}
                fill="none"
                stroke={colors.order.ring}
                strokeWidth={0.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={buildSmoothPath(data.map(d => d.productionCount), 400, 120, 10)}
                fill="none"
                stroke={colors.production.ring}
                strokeWidth={0.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={buildSmoothPath(data.map(d => d.inboundCount), 400, 120, 10)}
                fill="none"
                stroke={colors.inbound.ring}
                strokeWidth={0.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {hoverIndex !== null && data[hoverIndex] && (
                <>
                  <line
                    x1={(hoverIndex / (data.length - 1)) * 400}
                    y1={0}
                    x2={(hoverIndex / (data.length - 1)) * 400}
                    y2={120}
                    stroke="rgba(79, 209, 197, 0.4)"
                    strokeWidth={1}
                    strokeDasharray="4,4"
                  />
                  <circle
                    cx={(hoverIndex / (data.length - 1)) * 400}
                    cy={getY(data[hoverIndex].orderCount, maxValue, 120, 10)}
                    r={3}
                    fill={colors.order.ring}
                    stroke="var(--color-bg-base)"
                    strokeWidth={1.5}
                  />
                  <circle
                    cx={(hoverIndex / (data.length - 1)) * 400}
                    cy={getY(data[hoverIndex].productionCount, maxValue, 120, 10)}
                    r={3}
                    fill={colors.production.ring}
                    stroke="var(--color-bg-base)"
                    strokeWidth={1.5}
                  />
                  <circle
                    cx={(hoverIndex / (data.length - 1)) * 400}
                    cy={getY(data[hoverIndex].inboundCount, maxValue, 120, 10)}
                    r={3}
                    fill={colors.inbound.ring}
                    stroke="var(--color-bg-base)"
                    strokeWidth={1.5}
                  />
                </>
              )}
            </>
          )}
        </svg>

        <div className="overview-hover-areas">
          {data.map((d, i) => (
            <div
              key={i}
              className="hover-area"
              onMouseEnter={() => handleHover(i)}
              onMouseLeave={() => handleHover(null)}
            >
              {hoverIndex === i && (
                <div className="hover-tooltip">
                  <div className="tooltip-date">{d.date}</div>
                  <div className="tooltip-row" style={{ color: colors.order.text }}>
                    <span className="tooltip-label">下单</span>
                    <span className="tooltip-value">{d.orderCount}</span>
                  </div>
                  <div className="tooltip-row" style={{ color: colors.production.text }}>
                    <span className="tooltip-label">生产</span>
                    <span className="tooltip-value">{d.productionCount}</span>
                  </div>
                  <div className="tooltip-row" style={{ color: colors.inbound.text }}>
                    <span className="tooltip-label">入库</span>
                    <span className="tooltip-value">{d.inboundCount}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="overview-chart-labels">
          {data.filter((_, i) => i % Math.ceil(data.length / 6) === 0).map((d, i) => (
            <span key={i} className="chart-label">{d.date}</span>
          ))}
        </div>
      </div>

      <div className="overview-legend">
        <span className="legend-item"><span className="legend-dot" style={{ background: colors.order.ring }}></span>下单</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: colors.production.ring }}></span>生产</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: colors.inbound.ring }}></span>入库</span>
      </div>
    </div>
  );
};

export default TrendChart;
