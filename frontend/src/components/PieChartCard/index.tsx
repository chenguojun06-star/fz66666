import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Spin, Empty } from 'antd';
import './PieChartCard.css';

export interface PieSegment {
  key: string;
  label: string;
  count: number;
  color: string;
  unit?: string;
}

export interface TodayStat {
  label: string;
  value: number | string;
  unit?: string;
  type?: 'default' | 'success' | 'warning';
}

export interface PieChartCardProps {
  mode?: 'sidebar' | 'stage';
  title: string;
  total: number;
  inProgress: number;
  completed: number;
  avgTime?: string;
  segments: PieSegment[];
  loading?: boolean;
  todayStats?: TodayStat[];
  extraCompletedStat?: TodayStat;
}

const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => ({
  x: cx + r * Math.cos((angle * Math.PI) / 180),
  y: cy + r * Math.sin((angle * Math.PI) / 180),
});

const describeArc = (cx: number, cy: number, outerR: number, innerR: number, start: number, end: number) => {
  const sweep = end - start;
  if (sweep >= 360) {
    const s1 = polarToCartesian(cx, cy, outerR, start);
    const m1 = polarToCartesian(cx, cy, outerR, start + 180);
    const e1 = polarToCartesian(cx, cy, outerR, end);
    const s2 = polarToCartesian(cx, cy, innerR, end);
    const m2 = polarToCartesian(cx, cy, innerR, start + 180);
    const e2 = polarToCartesian(cx, cy, innerR, start);
    return `M${s1.x.toFixed(1)},${s1.y.toFixed(1)} A${outerR},${outerR} 0 1 1 ${m1.x.toFixed(1)},${m1.y.toFixed(1)} A${outerR},${outerR} 0 1 1 ${e1.x.toFixed(1)},${e1.y.toFixed(1)} L${s2.x.toFixed(1)},${s2.y.toFixed(1)} A${innerR},${innerR} 0 1 0 ${m2.x.toFixed(1)},${m2.y.toFixed(1)} A${innerR},${innerR} 0 1 0 ${e2.x.toFixed(1)},${e2.y.toFixed(1)} Z`;
  }
  const s1 = polarToCartesian(cx, cy, outerR, start);
  const e1 = polarToCartesian(cx, cy, outerR, end);
  const s2 = polarToCartesian(cx, cy, innerR, end);
  const e2 = polarToCartesian(cx, cy, innerR, start);
  const large = sweep > 180 ? 1 : 0;
  return `M${s1.x.toFixed(1)},${s1.y.toFixed(1)} A${outerR},${outerR} 0 ${large} 1 ${e1.x.toFixed(1)},${e1.y.toFixed(1)} L${s2.x.toFixed(1)},${s2.y.toFixed(1)} A${innerR},${innerR} 0 ${large} 0 ${e2.x.toFixed(1)},${e2.y.toFixed(1)} Z`;
};

const PieChartCard: React.FC<PieChartCardProps> = ({
  mode = 'sidebar',
  title,
  total,
  inProgress,
  completed,
  avgTime,
  segments,
  loading = false,
  todayStats,
  extraCompletedStat,
}) => {
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
      setScale(Math.max(0.5, Math.min(2.5, minDim / 400)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(targetEl);
    return () => ro.disconnect();
  }, [mode]);

  const pieSegments = useMemo(() => {
    const validSegments = segments.filter(s => s.count > 0);
    const totalCount = validSegments.reduce((s, c) => s + c.count, 0) || 1;
    let angle = -90;
    return validSegments.map((seg) => {
      const sweep = (seg.count / totalCount) * 360;
      const start = angle;
      const end = angle + sweep;
      const mid = start + sweep / 2;
      angle = end;

      const explodeOffset = 8;
      const explodeX = Math.cos((mid * Math.PI) / 180) * explodeOffset;
      const explodeY = Math.sin((mid * Math.PI) / 180) * explodeOffset;

      return {
        ...seg,
        start,
        end,
        mid,
        percent: Math.round((seg.count / totalCount) * 100),
        explodeX,
        explodeY,
      };
    });
  }, [segments]);

  if (loading) return <div className="pie-card-loading"><Spin /></div>;
  if (total === 0) return <div className="pie-card-empty"><Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} /></div>;

  if (mode === 'sidebar') {
    return (
      <div className="pie-sidebar">
        <div className="pie-sidebar-title">{title}</div>
        <div className="pie-sidebar-total">{total}</div>
        <div className="pie-sidebar-rows">
          <div className="pie-sidebar-row">
            <span className="pie-sidebar-dot pie-sidebar-dot--dev" />
            <span>进行中</span>
            <span className="pie-sidebar-num">{inProgress}</span>
          </div>
          <div className="pie-sidebar-row">
            <span className="pie-sidebar-dot pie-sidebar-dot--done" />
            <span>已完成</span>
            <span className="pie-sidebar-num">{completed}</span>
          </div>
        </div>
        {todayStats && todayStats.length > 0 && (
          <div className="pie-sidebar-today">
            {todayStats.map((stat, idx) => (
              <div key={idx} className="pie-today-item">
                <span className="pie-today-label">{stat.label}</span>
                <span className={`pie-today-value ${stat.type === 'success' ? 'pie-today-value--success' : ''}`}>
                  {stat.value}{stat.unit || ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const cx = 120, cy = 120, outer = 65, inner = 38;

  return (
    <div ref={containerRef} className="pie-card pie-card--stage" style={{ '--pie-scale': scale } as React.CSSProperties}>
      <div className="pie-card-stats">
        <div className="pie-card-stat">
          <span className="pie-card-stat-num pie-card-stat-num--dev">{inProgress}</span>
          <span className="pie-card-stat-label">进行中</span>
        </div>
        <div className="pie-card-stat">
          <span className="pie-card-stat-num pie-card-stat-num--done">{completed}</span>
          <span className="pie-card-stat-label">已完成</span>
        </div>
        {extraCompletedStat && (
          <div className="pie-card-stat pie-card-stat--extra">
            <span className={`pie-card-stat-num ${extraCompletedStat.type === 'success' ? 'pie-card-stat-num--done' : ''}`}>
              {extraCompletedStat.value}{extraCompletedStat.unit || ''}
            </span>
            <span className="pie-card-stat-label">{extraCompletedStat.label}</span>
          </div>
        )}
        <div className="pie-card-stat">
          <span className="pie-card-stat-num">{total}</span>
          <span className="pie-card-stat-label">总数量</span>
        </div>
        {avgTime && (
          <div className="pie-card-stat">
            <span className="pie-card-stat-num pie-card-stat-num--time">{avgTime}</span>
            <span className="pie-card-stat-label">平均周期</span>
          </div>
        )}
      </div>

      <div className="pie-card-content">
        <div className="pie-card-chart">
          <svg viewBox="0 0 240 240" className="pie-card-svg">
            <defs>
              <filter id="pie-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3"/>
              </filter>
            </defs>
            {pieSegments.map(seg => {
              const offsetX = cx + seg.explodeX;
              const offsetY = cy + seg.explodeY;
              const labelPos = polarToCartesian(cx, cy, outer + 25, seg.mid);
              return (
                <g key={seg.key} filter="url(#pie-shadow)">
                  <path
                    d={describeArc(offsetX, offsetY, outer, inner, seg.start, seg.end)}
                    fill={seg.color}
                    className="pie-card-segment"
                  />
                  <text
                    x={labelPos.x}
                    y={labelPos.y - 6}
                    textAnchor="middle"
                    className="pie-card-percent"
                    fill={seg.color}
                  >
                    {seg.percent}%
                  </text>
                  <text
                    x={labelPos.x}
                    y={labelPos.y + 8}
                    textAnchor="middle"
                    className="pie-card-pie-count"
                  >
                    {seg.count}{seg.unit || '件'}
                  </text>
                </g>
              );
            })}
            <circle cx={cx} cy={cy} r={inner - 4} className="pie-card-center" />
            <text x={cx} y={cy - 6} textAnchor="middle" className="pie-card-total">{total}</text>
            <text x={cx} y={cy + 12} textAnchor="middle" className="pie-card-center-label">总数</text>
          </svg>
        </div>

        <div className="pie-card-legend">
          {pieSegments.map(seg => (
            <div key={seg.key} className="pie-legend-item">
              <span className="pie-legend-dot" style={{ background: seg.color }} />
              <span className="pie-legend-label">{seg.label}</span>
              <span className="pie-legend-count">{seg.count}{seg.unit || '件'}</span>
              <span className="pie-legend-percent">{seg.percent}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default React.memo(PieChartCard);
